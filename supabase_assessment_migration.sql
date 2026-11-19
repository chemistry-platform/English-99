-- ============================================================================
-- Migration: منصة الكيمياء مع مستر عمرو السيد
-- 1) كلمات المرور الإلزامية في profiles
-- 2) إعدادات التقييم المستقلة في assignments (المدة، الاستكمال، مرات الدخول، الترتيب العشوائي)
-- 3) جدول النماذج المتعددة (assessment_forms) وترحيل التقييمات الحالية تلقائياً إلى "نموذج أ"
-- 4) التوزيع المتوازن للنماذج (assessment_form_assignments)
-- 5) محاولات الطلاب بمؤقتين مستقلين وتوقيت السيرفر (assessment_attempts)
-- 6) خانة التظلم (question_grievances)
-- 7) ملفات الذكاء الاصطناعي المؤقتة (ai_temp_sources)
-- 8) دوال RPC + سياسات الأمان + مهمة pg_cron للتسليم التلقائي وتنظيف الملفات المؤقتة
-- ============================================================================

-- 1. عمود كلمة المرور في جدول profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS password TEXT;

-- 2. أعمدة الإعدادات المستقلة لكل تقييم في جدول assignments
ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS duration_minutes INT,
  ADD COLUMN IF NOT EXISTS duration_unit TEXT DEFAULT 'minutes',
  ADD COLUMN IF NOT EXISTS resume_window_minutes INT,
  ADD COLUMN IF NOT EXISTS resume_window_unit TEXT DEFAULT 'hours',
  ADD COLUMN IF NOT EXISTS max_attempts INT,
  ADD COLUMN IF NOT EXISTS shuffle_for_students BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS lesson_number INT,
  ADD COLUMN IF NOT EXISTS lesson_title TEXT,
  ADD COLUMN IF NOT EXISTS total_points NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS deadline TEXT,
  ADD COLUMN IF NOT EXISTS chapter TEXT,
  ADD COLUMN IF NOT EXISTS max_completion_hours NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS is_custom_for_student_id UUID;

-- 3. جدول النماذج المتعددة لكل تقييم (حتى 10 نماذج مستقلة لكل تقييم)
CREATE TABLE IF NOT EXISTS public.assessment_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'نموذج أ',
  sort_order INT NOT NULL DEFAULT 1,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_forms_assessment
  ON public.assessment_forms (assessment_id, sort_order);

-- 4. جدول تخصيص النموذج لكل طالب داخل كل تقييم (توزيع عشوائي متوازن مرة واحدة)
CREATE TABLE IF NOT EXISTS public.assessment_form_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.assessment_forms(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reassigned_by TEXT,
  UNIQUE (assessment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_form_assignments_lookup
  ON public.assessment_form_assignments (assessment_id, form_id);

-- 5. جدول محاولات الطلاب الفعلية (حفظ التوقيتين + الترتيب العشوائي + لقطة الأسئلة Snapshot)
CREATE TABLE IF NOT EXISTS public.assessment_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  form_id UUID NOT NULL REFERENCES public.assessment_forms(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  attempt_number INT NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'submitted', 'auto_submitted')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  first_exited_at TIMESTAMPTZ,
  total_deadline_at TIMESTAMPTZ,
  resume_deadline_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  question_order JSONB NOT NULL DEFAULT '[]'::jsonb,
  choice_orders JSONB NOT NULL DEFAULT '{}'::jsonb,
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  visited_question_indices JSONB NOT NULL DEFAULT '[0]'::jsonb,
  questions_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
  question_grades JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_zeroed_questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  mcq_score NUMERIC(10, 2) NOT NULL DEFAULT 0,
  mcq_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  percentage NUMERIC(6, 2) NOT NULL DEFAULT 0,
  has_essay_questions BOOLEAN NOT NULL DEFAULT FALSE,
  essay_grading_pending BOOLEAN NOT NULL DEFAULT FALSE,
  teacher_feedback TEXT,
  graded_at TIMESTAMPTZ,
  graded_by TEXT,
  UNIQUE (assessment_id, student_id, attempt_number)
);

-- ضمان وجود محاولة نشطة واحدة فقط قيد التنفيذ لكل طالب في التقييم الواحد
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_attempt_per_student
  ON public.assessment_attempts (assessment_id, student_id)
  WHERE status = 'in_progress';

CREATE INDEX IF NOT EXISTS idx_attempts_student
  ON public.assessment_attempts (student_id, assessment_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_attempts_active_deadlines
  ON public.assessment_attempts (status, total_deadline_at, resume_deadline_at)
  WHERE status = 'in_progress';

-- 6. جدول خانة التظلم على الأسئلة (تظلم واحد بحد أقصى لكل سؤال في المحاولة الواحدة)
CREATE TABLE IF NOT EXISTS public.question_grievances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL REFERENCES public.assessment_attempts(id) ON DELETE CASCADE,
  assessment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  form_id UUID REFERENCES public.assessment_forms(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  question_text TEXT NOT NULL DEFAULT '',
  student_answer TEXT NOT NULL DEFAULT '',
  correct_answer TEXT NOT NULL DEFAULT '',
  question_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'approved', 'rejected')),
  teacher_note TEXT,
  is_seen_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_grievances_status
  ON public.question_grievances (status, is_seen_by_admin, created_at DESC);

-- 7. جدول تتبع صور المصادر المؤقتة للذكاء الاصطناعي (ai-sources/) لتنظيفها بعد النشر أو بعد 7 أيام
CREATE TABLE IF NOT EXISTS public.ai_temp_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID REFERENCES public.assignments(id) ON DELETE CASCADE,
  form_id UUID,
  storage_path TEXT NOT NULL UNIQUE,
  public_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 8. تفعيل Row Level Security (RLS) المتوافقة مع معمارية المنصة + الدوال الآمنة
-- ============================================================================
ALTER TABLE public.assessment_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_form_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_grievances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_temp_sources ENABLE ROW LEVEL SECURITY;

-- ملاحظة أمنية: المنصة تستخدم جداول profiles المخصصة وتستعلم من الواجهة للوحة المعلم والسكرتارية
-- بينما يستعلم الطلاب عبر دوال RPC SECURITY DEFINER التالية التي تمنع قراءة أي نموذج غير مخصص للطالب.
DROP POLICY IF EXISTS "Enable all on assessment_forms" ON public.assessment_forms;
CREATE POLICY "Enable all on assessment_forms"
  ON public.assessment_forms FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.role IN ('admin', 'secretary')
    )
    OR EXISTS (
      SELECT 1 FROM public.assessment_form_assignments afa
      WHERE afa.form_id = assessment_forms.id
    )
    OR (SELECT COUNT(*) FROM public.assessment_forms af2 WHERE af2.assessment_id = assessment_forms.assessment_id) <= 1
  )
  WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all on assessment_form_assignments" ON public.assessment_form_assignments;
CREATE POLICY "Enable all on assessment_form_assignments"
  ON public.assessment_form_assignments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all on assessment_attempts" ON public.assessment_attempts;
CREATE POLICY "Enable all on assessment_attempts"
  ON public.assessment_attempts FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all on question_grievances" ON public.question_grievances;
CREATE POLICY "Enable all on question_grievances"
  ON public.question_grievances FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all on ai_temp_sources" ON public.ai_temp_sources;
CREATE POLICY "Enable all on ai_temp_sources"
  ON public.ai_temp_sources FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 9. ترحيل البيانات الحالية غير الهدام:
--    - تحويل أسئلة كل امتحان/واجب/شيت حالي إلى "نموذج أ"
--    - ترحيل exam_meta إلى أعمدة التقييم المستقلة
--    - بناء choice_id ثابت لكل خيار وحل مشكلة الإجابة الصحيحة المختصرة ("أ" -> النص الكامل + id)
-- ============================================================================
CREATE OR REPLACE FUNCTION public._normalize_legacy_question(q JSONB, q_idx INT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_id TEXT;
  v_type TEXT;
  v_opts JSONB;
  v_choices JSONB := '[]'::jsonb;
  v_correct_ids JSONB := '[]'::jsonb;
  v_raw_correct TEXT;
  v_clean_correct TEXT;
  v_opt TEXT;
  v_choice_id TEXT;
  v_choice_text TEXT;
  v_letter TEXT;
  v_letters TEXT[] := ARRAY['أ','ب','ج','د','هـ','و','ز','ح','ط','ي'];
  v_idx INT;
BEGIN
  v_id := COALESCE(NULLIF(q->>'id', ''), 'q-' || q_idx::text);
  v_type := COALESCE(NULLIF(q->>'type', ''), 'mcq');
  v_raw_correct := TRIM(COALESCE(q->>'correctAnswer', ''));

  IF v_type <> 'mcq' THEN
    RETURN q || jsonb_build_object('id', v_id, 'type', v_type);
  END IF;

  -- إذا كان السؤال يحتوي بالفعل على choices صالحة
  IF jsonb_typeof(q->'choices') = 'array' AND jsonb_array_length(q->'choices') > 0 THEN
    RETURN q || jsonb_build_object('id', v_id, 'type', 'mcq');
  END IF;

  v_opts := COALESCE(q->'options', '[]'::jsonb);
  IF jsonb_typeof(v_opts) <> 'array' OR jsonb_array_length(v_opts) = 0 THEN
    v_opts := '["الخيار الأول","الخيار الثاني","الخيار الثالث","الخيار الرابع"]'::jsonb;
  END IF;

  v_clean_correct := regexp_replace(v_raw_correct, '^[أابجدهوزحطيA-Fa-f]\s*[\)\.\-:]\s*', '');

  FOR v_idx IN 0 .. (jsonb_array_length(v_opts) - 1) LOOP
    v_opt := COALESCE(v_opts->>v_idx, '');
    v_choice_text := TRIM(regexp_replace(v_opt, '^[أابجدهوزحطيA-Fa-f]\s*[\)\.\-:]\s*', ''));
    IF v_choice_text = '' THEN
      v_choice_text := TRIM(v_opt);
    END IF;
    v_choice_id := v_id || '-c' || (v_idx + 1)::text;
    v_choices := v_choices || jsonb_build_array(jsonb_build_object('id', v_choice_id, 'text', v_choice_text));

    v_letter := COALESCE(v_letters[v_idx + 1], '');
    IF v_raw_correct <> '' AND (
      TRIM(v_opt) = v_raw_correct
      OR v_choice_text = v_raw_correct
      OR v_choice_text = v_clean_correct
      OR v_raw_correct = v_letter
      OR v_raw_correct = (v_letter || ')')
      OR LOWER(v_raw_correct) = LOWER(CHR(65 + v_idx))
      OR v_raw_correct = (v_idx + 1)::text
    ) THEN
      v_correct_ids := v_correct_ids || jsonb_build_array(v_choice_id);
      v_raw_correct := v_choice_text;
    END IF;
  END LOOP;

  IF jsonb_array_length(v_correct_ids) = 0 AND jsonb_array_length(v_choices) > 0 THEN
    v_correct_ids := jsonb_build_array(v_choices->0->>'id');
    v_raw_correct := v_choices->0->>'text';
  END IF;

  RETURN q || jsonb_build_object(
    'id', v_id,
    'type', 'mcq',
    'choices', v_choices,
    'correctChoiceIds', v_correct_ids,
    'correctAnswer', COALESCE(NULLIF(v_raw_correct, ''), v_choices->0->>'text')
  );
END;
$$;

DO $$
DECLARE
  rec RECORD;
  v_meta JSONB;
  v_questions JSONB;
  v_norm_questions JSONB;
  v_i INT;
  v_total_pts NUMERIC(10, 2);
  v_default_resume_mins INT;
  v_form_id UUID;
BEGIN
  FOR rec IN
    SELECT * FROM public.assignments
    WHERE type IN ('exam', 'assignment', 'sheet')
  LOOP
    SELECT questions INTO v_meta
    FROM public.assignments
    WHERE type = 'exam_meta'
      AND (questions->>'examId') = rec.id::text
    LIMIT 1;

    v_questions := CASE WHEN jsonb_typeof(rec.questions) = 'array' THEN rec.questions ELSE '[]'::jsonb END;
    v_norm_questions := '[]'::jsonb;
    v_total_pts := 0;

    FOR v_i IN 0 .. GREATEST(jsonb_array_length(v_questions) - 1, -1) LOOP
      v_norm_questions := v_norm_questions || jsonb_build_array(public._normalize_legacy_question(v_questions->v_i, v_i + 1));
      v_total_pts := v_total_pts + COALESCE((v_questions->v_i->>'points')::numeric, 0);
    END LOOP;

    v_default_resume_mins := CASE WHEN rec.type = 'assignment' THEN 1440 ELSE 300 END;
    IF v_meta IS NOT NULL AND (v_meta->>'maxCompletionHours') IS NOT NULL THEN
      v_default_resume_mins := GREATEST(1, ROUND(((v_meta->>'maxCompletionHours')::numeric) * 60));
    END IF;

    UPDATE public.assignments
    SET
      questions = v_norm_questions,
      duration_minutes = COALESCE(
        duration_minutes,
        NULLIF((v_meta->>'durationMinutes')::int, 0),
        v_default_resume_mins
      ),
      duration_unit = COALESCE(NULLIF(duration_unit, ''), NULLIF(v_meta->>'durationUnit', ''), 'minutes'),
      resume_window_minutes = COALESCE(
        resume_window_minutes,
        NULLIF((v_meta->>'resumeWindowMinutes')::int, 0),
        v_default_resume_mins
      ),
      resume_window_unit = COALESCE(NULLIF(resume_window_unit, ''), NULLIF(v_meta->>'resumeWindowUnit', ''), 'hours'),
      max_attempts = COALESCE(max_attempts, NULLIF((v_meta->>'maxAttempts')::int, 0)),
      shuffle_for_students = COALESCE(shuffle_for_students, COALESCE((v_meta->>'shuffleForStudents')::boolean, TRUE)),
      lesson_number = COALESCE(lesson_number, (v_meta->>'lessonNumber')::int),
      lesson_title = COALESCE(lesson_title, v_meta->>'lessonTitle'),
      total_points = COALESCE(total_points, NULLIF((v_meta->>'totalPoints')::numeric, 0), NULLIF(v_total_pts, 0), 60),
      deadline = COALESCE(deadline, v_meta->>'deadline', 'متاح للحل فوراً'),
      chapter = COALESCE(chapter, v_meta->>'chapter'),
      max_completion_hours = COALESCE(max_completion_hours, (v_meta->>'maxCompletionHours')::numeric, CASE WHEN rec.type = 'assignment' THEN 24 ELSE 5 END)
    WHERE id = rec.id;

    SELECT id INTO v_form_id
    FROM public.assessment_forms
    WHERE assessment_id = rec.id
    ORDER BY sort_order ASC
    LIMIT 1;

    IF v_form_id IS NULL THEN
      INSERT INTO public.assessment_forms (assessment_id, name, sort_order, questions, total_points, created_at)
      VALUES (
        rec.id,
        'نموذج أ',
        1,
        v_norm_questions,
        COALESCE(NULLIF(v_total_pts, 0), COALESCE((v_meta->>'totalPoints')::numeric, 0), 0),
        COALESCE(rec.created_at, NOW())
      );
    END IF;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS public._normalize_legacy_question(JSONB, INT);

-- ============================================================================
-- 10. دوال Postgres RPC المعتمدة على توقيت السيرفر NOW() للتوزيع والمؤقتين والتظلمات
-- ============================================================================

-- أ) تعيين نموذج عشوائي متوازن للطالب عند أول فتح وتثبيته لجميع محاولاته
CREATE OR REPLACE FUNCTION public.assign_balanced_assessment_form(
  p_assessment_id UUID,
  p_student_id UUID
)
RETURNS TABLE (
  form_id UUID,
  form_name TEXT,
  questions JSONB,
  total_points NUMERIC,
  forms_count INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assigned_form_id UUID;
  v_forms_count INT;
BEGIN
  SELECT COUNT(*) INTO v_forms_count
  FROM public.assessment_forms af
  WHERE af.assessment_id = p_assessment_id;

  IF v_forms_count = 0 THEN
    RETURN;
  END IF;

  SELECT afa.form_id INTO v_assigned_form_id
  FROM public.assessment_form_assignments afa
  WHERE afa.assessment_id = p_assessment_id
    AND afa.student_id = p_student_id
  LIMIT 1;

  IF v_assigned_form_id IS NULL THEN
    -- اختيار عشوائي بين النماذج التي تملك أقل عدد من الطلاب المسندين
    WITH form_counts AS (
      SELECT
        af.id,
        COUNT(afa.id) AS assigned_cnt
      FROM public.assessment_forms af
      LEFT JOIN public.assessment_form_assignments afa
        ON afa.form_id = af.id AND afa.assessment_id = p_assessment_id
      WHERE af.assessment_id = p_assessment_id
      GROUP BY af.id
    ),
    min_cnt AS (
      SELECT MIN(assigned_cnt) AS m FROM form_counts
    )
    SELECT fc.id INTO v_assigned_form_id
    FROM form_counts fc, min_cnt
    WHERE fc.assigned_cnt = min_cnt.m
    ORDER BY random()
    LIMIT 1;

    INSERT INTO public.assessment_form_assignments (assessment_id, student_id, form_id)
    VALUES (p_assessment_id, p_student_id, v_assigned_form_id)
    ON CONFLICT (assessment_id, student_id) DO NOTHING;

    SELECT afa.form_id INTO v_assigned_form_id
    FROM public.assessment_form_assignments afa
    WHERE afa.assessment_id = p_assessment_id
      AND afa.student_id = p_student_id
    LIMIT 1;
  END IF;

  RETURN QUERY
  SELECT
    af.id AS form_id,
    af.name AS form_name,
    af.questions AS questions,
    af.total_points AS total_points,
    v_forms_count AS forms_count
  FROM public.assessment_forms af
  WHERE af.id = v_assigned_form_id;
END;
$$;

-- ب) بدء أو استئناف محاولة الطالب باستخدام وقت السيرفر NOW() والتحقق من عدم تجاوز حد المحاولات
CREATE OR REPLACE FUNCTION public.start_or_resume_assessment_attempt(
  p_assessment_id UUID,
  p_student_id UUID,
  p_question_order JSONB DEFAULT '[]'::jsonb,
  p_choice_orders JSONB DEFAULT '{}'::jsonb,
  p_questions_snapshot JSONB DEFAULT '[]'::jsonb,
  p_total_points NUMERIC DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_assign RECORD;
  v_active public.assessment_attempts%ROWTYPE;
  v_form RECORD;
  v_completed_count INT;
  v_next_attempt_num INT;
  v_effective_deadline TIMESTAMPTZ;
  v_total_deadline TIMESTAMPTZ;
  v_resume_deadline TIMESTAMPTZ;
  v_gap_seconds NUMERIC;
  v_now TIMESTAMPTZ := NOW();
  v_auto_score NUMERIC;
BEGIN
  SELECT * INTO v_assign
  FROM public.assignments
  WHERE id = p_assessment_id
  LIMIT 1;

  IF v_assign.id IS NULL THEN
    RETURN jsonb_build_object('error', 'التقييم غير موجود');
  END IF;

  -- التأكد من تعيين النموذج المتوازن
  SELECT af.* INTO v_form
  FROM public.assign_balanced_assessment_form(p_assessment_id, p_student_id) f
  JOIN public.assessment_forms af ON af.id = f.form_id
  LIMIT 1;

  IF v_form.id IS NULL THEN
    RETURN jsonb_build_object('error', 'لا توجد نماذج مضافة لهذا التقييم بعد');
  END IF;

  -- فحص إذا كان هناك محاولة نشطة حالياً
  SELECT * INTO v_active
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id
    AND student_id = p_student_id
    AND status = 'in_progress'
  LIMIT 1;

  IF v_active.id IS NOT NULL THEN
    -- إذا عاد الطالب بعد انقطاع > 30 ثانية ولم يتم تسجيل أول خروج بعد -> ثبّت first_exited_at و resume_deadline_at
    v_gap_seconds := EXTRACT(EPOCH FROM (v_now - COALESCE(v_active.last_seen_at, v_active.started_at)));
    IF v_active.first_exited_at IS NULL AND v_gap_seconds > 30 THEN
      IF v_assign.resume_window_minutes IS NOT NULL AND v_assign.resume_window_minutes > 0 THEN
        v_resume_deadline := v_active.last_seen_at + make_interval(mins => v_assign.resume_window_minutes);
      ELSE
        v_resume_deadline := NULL;
      END IF;

      UPDATE public.assessment_attempts
      SET
        first_exited_at = v_active.last_seen_at,
        resume_deadline_at = v_resume_deadline,
        last_seen_at = v_now
      WHERE id = v_active.id
      RETURNING * INTO v_active;
    ELSE
      UPDATE public.assessment_attempts
      SET last_seen_at = v_now
      WHERE id = v_active.id
      RETURNING * INTO v_active;
    END IF;

    -- حساب الموعد النهائي الأقل بين المؤقتين
    v_effective_deadline := LEAST(
      COALESCE(v_active.total_deadline_at, 'infinity'::timestamptz),
      COALESCE(v_active.resume_deadline_at, 'infinity'::timestamptz)
    );

    -- لو انتهى وقت إحدى المهلتين قبل العودة -> تسليم تلقائي فوري من السيرفر
    IF v_effective_deadline < 'infinity'::timestamptz AND v_now >= v_effective_deadline THEN
      PERFORM public.auto_submit_expired_attempts();
      SELECT * INTO v_active FROM public.assessment_attempts WHERE id = v_active.id;
      RETURN jsonb_build_object('attempt', to_jsonb(v_active), 'form_name', v_form.name, 'auto_submitted_now', true);
    END IF;

    RETURN jsonb_build_object('attempt', to_jsonb(v_active), 'form_name', v_form.name);
  END IF;

  -- لا توجد محاولة نشطة: تحقق من الحد الأقصى لعدد مرات الدخول (للمحاولات المكتملة فقط)
  SELECT COUNT(*) INTO v_completed_count
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id
    AND student_id = p_student_id
    AND status IN ('submitted', 'auto_submitted');

  IF v_assign.max_attempts IS NOT NULL AND v_assign.max_attempts > 0 AND v_completed_count >= v_assign.max_attempts THEN
    RETURN jsonb_build_object(
      'error', 'استنفدت عدد مرات الدخول المسموحة لهذا التقييم',
      'limit_reached', true,
      'completed_count', v_completed_count,
      'max_attempts', v_assign.max_attempts
    );
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_attempt_num
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id
    AND student_id = p_student_id;

  IF v_assign.duration_minutes IS NOT NULL AND v_assign.duration_minutes > 0 THEN
    v_total_deadline := v_now + make_interval(mins => v_assign.duration_minutes);
  ELSE
    v_total_deadline := NULL;
  END IF;

  INSERT INTO public.assessment_attempts (
    assessment_id, form_id, student_id, attempt_number, status,
    started_at, last_seen_at, total_deadline_at,
    question_order, choice_orders, questions_snapshot, total_points
  )
  VALUES (
    p_assessment_id,
    v_form.id,
    p_student_id,
    v_next_attempt_num,
    'in_progress',
    v_now,
    v_now,
    v_total_deadline,
    p_question_order,
    p_choice_orders,
    CASE WHEN jsonb_array_length(p_questions_snapshot) > 0 THEN p_questions_snapshot ELSE v_form.questions END,
    CASE WHEN p_total_points > 0 THEN p_total_points ELSE COALESCE(v_form.total_points, 0) END
  )
  RETURNING * INTO v_active;

  RETURN jsonb_build_object('attempt', to_jsonb(v_active), 'form_name', v_form.name);
END;
$$;

-- ج) نبضة الحضور كل 12 ثانية + تسجيل أول خروج إذا غاب > 30 ثانية أو عند إشارة الإغلاق الصريحة
CREATE OR REPLACE FUNCTION public.heartbeat_assessment_attempt(
  p_attempt_id UUID,
  p_answers JSONB DEFAULT NULL,
  p_visited JSONB DEFAULT NULL,
  p_mark_exit BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_att public.assessment_attempts%ROWTYPE;
  v_assign public.assignments%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
  v_resume_deadline TIMESTAMPTZ;
  v_effective_deadline TIMESTAMPTZ;
  v_gap_seconds NUMERIC;
BEGIN
  SELECT * INTO v_att FROM public.assessment_attempts WHERE id = p_attempt_id LIMIT 1;
  IF v_att.id IS NULL THEN
    RETURN jsonb_build_object('error', 'المحاولة غير موجودة');
  END IF;

  IF v_att.status <> 'in_progress' THEN
    RETURN jsonb_build_object('attempt', to_jsonb(v_att), 'expired', true);
  END IF;

  SELECT * INTO v_assign FROM public.assignments WHERE id = v_att.assessment_id LIMIT 1;
  v_gap_seconds := EXTRACT(EPOCH FROM (v_now - COALESCE(v_att.last_seen_at, v_att.started_at)));

  -- إذا كان قد مر > 30 ثانية دون نبض أو طلب الخروج الصريح، نثبّت أول خروج فقط (لا يُعاد أبداً)
  IF v_att.first_exited_at IS NULL AND (p_mark_exit OR v_gap_seconds > 30) THEN
    IF v_assign.resume_window_minutes IS NOT NULL AND v_assign.resume_window_minutes > 0 THEN
      v_resume_deadline := (CASE WHEN p_mark_exit THEN v_now ELSE v_att.last_seen_at END)
        + make_interval(mins => v_assign.resume_window_minutes);
    ELSE
      v_resume_deadline := NULL;
    END IF;

    UPDATE public.assessment_attempts
    SET
      first_exited_at = CASE WHEN p_mark_exit THEN v_now ELSE v_att.last_seen_at END,
      resume_deadline_at = v_resume_deadline,
      answers = COALESCE(p_answers, answers),
      visited_question_indices = COALESCE(p_visited, visited_question_indices),
      last_seen_at = v_now
    WHERE id = v_att.id
    RETURNING * INTO v_att;
  ELSE
    UPDATE public.assessment_attempts
    SET
      answers = COALESCE(p_answers, answers),
      visited_question_indices = COALESCE(p_visited, visited_question_indices),
      last_seen_at = v_now
    WHERE id = v_att.id
    RETURNING * INTO v_att;
  END IF;

  v_effective_deadline := LEAST(
    COALESCE(v_att.total_deadline_at, 'infinity'::timestamptz),
    COALESCE(v_att.resume_deadline_at, 'infinity'::timestamptz)
  );

  IF v_effective_deadline < 'infinity'::timestamptz AND v_now >= v_effective_deadline THEN
    PERFORM public.auto_submit_expired_attempts();
    SELECT * INTO v_att FROM public.assessment_attempts WHERE id = v_att.id;
    RETURN jsonb_build_object('attempt', to_jsonb(v_att), 'expired', true);
  END IF;

  RETURN jsonb_build_object(
    'attempt', to_jsonb(v_att),
    'server_now', v_now,
    'expired', false
  );
END;
$$;

-- د) التسليم اليدوي أو التلقائي من الواجهة مع حفظ اللقطة والدرجات
CREATE OR REPLACE FUNCTION public.submit_assessment_attempt(
  p_attempt_id UUID,
  p_status TEXT DEFAULT 'submitted',
  p_answers JSONB DEFAULT '{}'::jsonb,
  p_question_grades JSONB DEFAULT '{}'::jsonb,
  p_auto_zeroed JSONB DEFAULT '[]'::jsonb,
  p_score NUMERIC DEFAULT 0,
  p_mcq_score NUMERIC DEFAULT 0,
  p_mcq_total NUMERIC DEFAULT 0,
  p_total_points NUMERIC DEFAULT 0,
  p_has_essay BOOLEAN DEFAULT FALSE,
  p_essay_pending BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_att public.assessment_attempts%ROWTYPE;
  v_pct NUMERIC(6, 2);
BEGIN
  v_pct := CASE WHEN p_total_points > 0 THEN ROUND((p_score / p_total_points) * 100.0, 2) ELSE 0 END;

  UPDATE public.assessment_attempts
  SET
    status = CASE WHEN p_status IN ('submitted', 'auto_submitted') THEN p_status ELSE 'submitted' END,
    submitted_at = COALESCE(submitted_at, NOW()),
    last_seen_at = NOW(),
    answers = COALESCE(p_answers, answers),
    question_grades = COALESCE(p_question_grades, question_grades),
    auto_zeroed_questions = COALESCE(p_auto_zeroed, auto_zeroed_questions),
    score = p_score,
    mcq_score = p_mcq_score,
    mcq_total = p_mcq_total,
    total_points = GREATEST(p_total_points, total_points),
    percentage = v_pct,
    has_essay_questions = p_has_essay,
    essay_grading_pending = p_essay_pending
  WHERE id = p_attempt_id
  RETURNING * INTO v_att;

  RETURN jsonb_build_object('attempt', to_jsonb(v_att));
END;
$$;

-- هـ) التسليم التلقائي للمحاولات التي انتهت أي من مهلتَيها على السيرفر (تعمل عبر pg_cron و عند الفتح)
CREATE OR REPLACE FUNCTION public.auto_submit_expired_attempts()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INT := 0;
  rec RECORD;
  v_q JSONB;
  v_ans TEXT;
  v_score NUMERIC;
  v_mcq_score NUMERIC;
  v_mcq_total NUMERIC;
  v_total_pts NUMERIC;
  v_q_grades JSONB;
  v_zeroed JSONB;
  v_has_essay BOOLEAN;
  v_correct_ids JSONB;
  v_c JSONB;
  v_found BOOLEAN;
BEGIN
  -- أولاً: تثبيت الخروج الأول لأي محاولة انقطعت نبضاتها أكثر من 30 ثانية ولم يُثبت خروجها بعد
  UPDATE public.assessment_attempts att
  SET
    first_exited_at = att.last_seen_at,
    resume_deadline_at = CASE
      WHEN a.resume_window_minutes IS NOT NULL AND a.resume_window_minutes > 0
      THEN att.last_seen_at + make_interval(mins => a.resume_window_minutes)
      ELSE NULL
    END
  FROM public.assignments a
  WHERE a.id = att.assessment_id
    AND att.status = 'in_progress'
    AND att.first_exited_at IS NULL
    AND EXTRACT(EPOCH FROM (NOW() - COALESCE(att.last_seen_at, att.started_at))) > 30;

  -- ثانياً: تسليم كل المحاولات التي انتهت إحدى مهلتَيها تلقائياً بالدرجات الفعلية للإجابات المحفوظة
  FOR rec IN
    SELECT * FROM public.assessment_attempts
    WHERE status = 'in_progress'
      AND (
        (total_deadline_at IS NOT NULL AND NOW() >= total_deadline_at)
        OR (resume_deadline_at IS NOT NULL AND NOW() >= resume_deadline_at)
      )
  LOOP
    v_score := 0;
    v_mcq_score := 0;
    v_mcq_total := 0;
    v_total_pts := 0;
    v_q_grades := '{}'::jsonb;
    v_zeroed := '[]'::jsonb;
    v_has_essay := FALSE;

    FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(rec.questions_snapshot, '[]'::jsonb)) LOOP
      DECLARE
        v_qid TEXT := v_q->>'id';
        v_qtype TEXT := COALESCE(v_q->>'type', 'mcq');
        v_pts NUMERIC := COALESCE((v_q->>'points')::numeric, 0);
      BEGIN
        v_total_pts := v_total_pts + v_pts;
        v_ans := TRIM(COALESCE(rec.answers->>v_qid, ''));

        IF v_qtype = 'mcq' THEN
          v_mcq_total := v_mcq_total + v_pts;
          v_correct_ids := COALESCE(v_q->'correctChoiceIds', '[]'::jsonb);
          v_found := FALSE;
          IF v_ans <> '' THEN
            IF v_correct_ids ? v_ans THEN
              v_found := TRUE;
            ELSE
              -- دعم مقارنة النص المُخزّن إذا لم يكن الإجابة على صيغة choice_id
              FOR v_c IN SELECT * FROM jsonb_array_elements(COALESCE(v_q->'choices', '[]'::jsonb)) LOOP
                IF (v_correct_ids ? (v_c->>'id')) AND TRIM(COALESCE(v_c->>'text', '')) = v_ans THEN
                  v_found := TRUE;
                END IF;
              END LOOP;
            END IF;
          END IF;

          IF v_found THEN
            v_score := v_score + v_pts;
            v_mcq_score := v_mcq_score + v_pts;
            v_q_grades := v_q_grades || jsonb_build_object(v_qid, v_pts);
          ELSE
            v_q_grades := v_q_grades || jsonb_build_object(v_qid, 0);
          END IF;
        ELSE
          v_has_essay := TRUE;
          v_q_grades := v_q_grades || jsonb_build_object(v_qid, 0);
          IF v_ans = '' THEN
            v_zeroed := v_zeroed || jsonb_build_array(v_qid);
          END IF;
        END IF;
      END;
    END LOOP;

    UPDATE public.assessment_attempts
    SET
      status = 'auto_submitted',
      submitted_at = NOW(),
      question_grades = v_q_grades,
      auto_zeroed_questions = v_zeroed,
      score = v_score,
      mcq_score = v_mcq_score,
      mcq_total = v_mcq_total,
      total_points = GREATEST(v_total_pts, total_points),
      percentage = CASE WHEN GREATEST(v_total_pts, total_points) > 0 THEN ROUND((v_score / GREATEST(v_total_pts, total_points)) * 100.0, 2) ELSE 0 END,
      has_essay_questions = v_has_essay,
      essay_grading_pending = (v_has_essay AND jsonb_array_length(v_zeroed) < (
        SELECT COUNT(*) FROM jsonb_array_elements(COALESCE(rec.questions_snapshot, '[]'::jsonb)) x WHERE (x->>'type') = 'essay'
      ))
    WHERE id = rec.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- و) تغيير نموذج الطالب يدوياً من لوحة الأستاذ (يمنع في حالة وجود محاولات إلا بتأكيد p_force_override)
CREATE OR REPLACE FUNCTION public.reassign_student_assessment_form(
  p_assessment_id UUID,
  p_student_id UUID,
  p_new_form_id UUID,
  p_reassigned_by TEXT DEFAULT 'المعلم',
  p_force_override BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_attempt_count INT;
BEGIN
  SELECT COUNT(*) INTO v_attempt_count
  FROM public.assessment_attempts
  WHERE assessment_id = p_assessment_id
    AND student_id = p_student_id;

  IF v_attempt_count > 0 AND NOT p_force_override THEN
    RETURN jsonb_build_object(
      'blocked', true,
      'attempts_count', v_attempt_count,
      'error', 'للطالب محاولات مسجلة بالفعل على هذا التقييم'
    );
  END IF;

  INSERT INTO public.assessment_form_assignments (assessment_id, student_id, form_id, assigned_at, reassigned_by)
  VALUES (p_assessment_id, p_student_id, p_new_form_id, NOW(), p_reassigned_by)
  ON CONFLICT (assessment_id, student_id)
  DO UPDATE SET
    form_id = EXCLUDED.form_id,
    assigned_at = NOW(),
    reassigned_by = EXCLUDED.reassigned_by;

  RETURN jsonb_build_object('success', true, 'attempts_count', v_attempt_count);
END;
$$;

-- ز) مراجعة التظلم (قبول التظلم يمنح درجة السؤال الكاملة لهذه المحاولة فقط ويعيد حساب المجموع والنسبة)
CREATE OR REPLACE FUNCTION public.review_question_grievance(
  p_grievance_id UUID,
  p_action TEXT, -- 'approved' | 'rejected'
  p_teacher_note TEXT DEFAULT NULL,
  p_reviewed_by TEXT DEFAULT 'مستر عمرو السيد'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_g public.question_grievances%ROWTYPE;
  v_att public.assessment_attempts%ROWTYPE;
  v_q JSONB;
  v_new_grades JSONB;
  v_new_score NUMERIC := 0;
  v_new_mcq_score NUMERIC := 0;
  v_pct NUMERIC(6, 2);
BEGIN
  SELECT * INTO v_g FROM public.question_grievances WHERE id = p_grievance_id LIMIT 1;
  IF v_g.id IS NULL THEN
    RETURN jsonb_build_object('error', 'التظلم غير موجود');
  END IF;

  UPDATE public.question_grievances
  SET
    status = CASE WHEN p_action = 'approved' THEN 'approved' ELSE 'rejected' END,
    teacher_note = COALESCE(p_teacher_note, teacher_note),
    is_seen_by_admin = TRUE,
    reviewed_by = p_reviewed_by,
    reviewed_at = NOW()
  WHERE id = p_grievance_id
  RETURNING * INTO v_g;

  IF p_action = 'approved' THEN
    SELECT * INTO v_att FROM public.assessment_attempts WHERE id = v_g.attempt_id LIMIT 1;
    IF v_att.id IS NOT NULL THEN
      v_new_grades := COALESCE(v_att.question_grades, '{}'::jsonb) || jsonb_build_object(v_g.question_id, v_g.question_points);

      FOR v_q IN SELECT * FROM jsonb_array_elements(COALESCE(v_att.questions_snapshot, '[]'::jsonb)) LOOP
        DECLARE
          v_qid TEXT := v_q->>'id';
          v_qtype TEXT := COALESCE(v_q->>'type', 'mcq');
          v_gval NUMERIC := COALESCE((v_new_grades->>v_qid)::numeric, 0);
        BEGIN
          v_new_score := v_new_score + v_gval;
          IF v_qtype = 'mcq' THEN
            v_new_mcq_score := v_new_mcq_score + v_gval;
          END IF;
        END;
      END LOOP;

      v_pct := CASE WHEN v_att.total_points > 0 THEN ROUND((v_new_score / v_att.total_points) * 100.0, 2) ELSE 0 END;

      UPDATE public.assessment_attempts
      SET
        question_grades = v_new_grades,
        score = v_new_score,
        mcq_score = v_new_mcq_score,
        percentage = v_pct,
        graded_at = NOW(),
        graded_by = p_reviewed_by
      WHERE id = v_att.id
      RETURNING * INTO v_att;
    END IF;
  END IF;

  RETURN jsonb_build_object('grievance', to_jsonb(v_g), 'attempt', to_jsonb(v_att));
END;
$$;

-- ح) تعليم التظلمات كمقروءة عند فتح قسم بيانات الطلاب
CREATE OR REPLACE FUNCTION public.mark_grievances_seen()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.question_grievances
  SET is_seen_by_admin = TRUE
  WHERE is_seen_by_admin = FALSE;
END;
$$;

-- ============================================================================
-- 11. جدولة pg_cron (اختياري — يُنفّذ فقط إذا كان pg_cron مفعّلاً في مشروع Supabase)
--     لتفعيل التسليم التلقائي كل دقيقة وحذف سجلات المصادر المؤقتة الأقدم من 7 أيام:
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'auto_submit_expired_assessments_every_min',
      '* * * * *',
      'SELECT public.auto_submit_expired_attempts();'
    );
    PERFORM cron.schedule(
      'cleanup_old_ai_temp_sources_daily',
      '0 3 * * *',
      'DELETE FROM public.ai_temp_sources WHERE created_at < NOW() - INTERVAL ''7 days'';'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- يتم تجاهل الخطأ إذا لم تكن صلاحيات pg_cron متوفرة؛ سيعمل التسليم التلقائي أيضاً عبر الواجهة والـ RPC عند استعلام المحاولة.
  NULL;
END $$;
