-- ====================================================================
-- سكربت قاعدة بيانات منصة "الكيمياء مع مستر عمرو السيد" على Supabase
-- يتضمن الجداول، سياسات الأمان RLS المفتوحة للوصول الحر، وحساب المشرف
-- ====================================================================

-- 1. جدول الملفات الشخصية والطلاب (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_code VARCHAR(20) UNIQUE NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    parent_phone VARCHAR(20),
    email VARCHAR(150),
    governorate VARCHAR(50) DEFAULT 'القاهرة',
    grade VARCHAR(50) NOT NULL,
    role VARCHAR(20) DEFAULT 'student', -- 'student' | 'admin' | 'secretary'
    balance NUMERIC(10, 2) DEFAULT 0.00,
    enrolled_courses JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- سياسات الأمان RLS المفتوحة لجدول profiles لمنع أي حظر
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable insert for all users" ON public.profiles;
CREATE POLICY "Enable insert for all users" ON public.profiles FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable select for all users" ON public.profiles;
CREATE POLICY "Enable select for all users" ON public.profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Enable update for all users" ON public.profiles;
CREATE POLICY "Enable update for all users" ON public.profiles FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Enable delete for all users" ON public.profiles;
CREATE POLICY "Enable delete for all users" ON public.profiles FOR DELETE USING (true);


-- 2. جدول الكورسات والمحاضرات (courses)
CREATE TABLE IF NOT EXISTS public.courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    chapter VARCHAR(150) NOT NULL,
    description TEXT,
    video_url TEXT NOT NULL,
    video_source VARCHAR(30) DEFAULT 'direct', -- 'direct' | 'youtube' | 'drive' | 'supabase'
    price NUMERIC(10, 2) DEFAULT 0.00,
    is_free BOOLEAN DEFAULT FALSE,
    grade VARCHAR(50) NOT NULL,
    duration_minutes INT DEFAULT 45,
    views_count INT DEFAULT 0,
    attached_pdf_url TEXT,
    attached_exam_id TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on courses" ON public.courses;
CREATE POLICY "Enable all on courses" ON public.courses FOR ALL USING (true) WITH CHECK (true);


-- 3. جدول الملفات والمذكرات (documents)
CREATE TABLE IF NOT EXISTS public.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    doc_type VARCHAR(50) DEFAULT 'مذكرة شرح', -- 'مذكرة شرح' | 'شيت أسئلة' | 'ملخص قوانين ومفاهيم'
    grade VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    file_size VARCHAR(30) DEFAULT '5 MB',
    downloads_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on documents" ON public.documents;
CREATE POLICY "Enable all on documents" ON public.documents FOR ALL USING (true) WITH CHECK (true);


-- 4. جدول الواجبات والامتحانات والشيتات (exams)
CREATE TABLE IF NOT EXISTS public.exams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    category VARCHAR(50) DEFAULT 'exam', -- 'exam' | 'assignment' | 'sheet'
    grade VARCHAR(50) NOT NULL,
    duration_minutes INT DEFAULT 45,
    total_points INT DEFAULT 60,
    deadline VARCHAR(100),
    questions JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exams ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on exams" ON public.exams;
CREATE POLICY "Enable all on exams" ON public.exams FOR ALL USING (true) WITH CHECK (true);


-- 5. جدول تسليمات الطلاب (exam_submissions)
CREATE TABLE IF NOT EXISTS public.exam_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exam_id UUID REFERENCES public.exams(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_name VARCHAR(150),
    score INT NOT NULL,
    total_points INT NOT NULL,
    answers JSONB,
    submitted_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.exam_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on exam_submissions" ON public.exam_submissions;
CREATE POLICY "Enable all on exam_submissions" ON public.exam_submissions FOR ALL USING (true) WITH CHECK (true);


-- 6. جدول أكواد الشحن والتفعيل الجماعية حتى مليون كود (redeem_codes)
CREATE TABLE IF NOT EXISTS public.redeem_codes (
    code VARCHAR(50) PRIMARY KEY,
    amount NUMERIC(10, 2) NOT NULL,
    max_uses INT DEFAULT 1,
    used_count INT DEFAULT 0,
    code_type VARCHAR(20) DEFAULT 'balance', -- 'balance' | 'course'
    course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
    target_course_title VARCHAR(255),
    created_by VARCHAR(50) DEFAULT 'المشرف العام',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.redeem_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on redeem_codes" ON public.redeem_codes;
CREATE POLICY "Enable all on redeem_codes" ON public.redeem_codes FOR ALL USING (true) WITH CHECK (true);


-- 7. جدول طلبات الدفع وإيصالات التحويل (payment_requests)
CREATE TABLE IF NOT EXISTS public.payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    student_name VARCHAR(150) NOT NULL,
    student_phone VARCHAR(20) NOT NULL,
    method VARCHAR(50) NOT NULL, -- 'vodafone_cash' | 'instapay' | 'fawry'
    amount NUMERIC(10, 2) NOT NULL,
    receipt_image TEXT,
    reference_number VARCHAR(100),
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.payment_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on payment_requests" ON public.payment_requests;
CREATE POLICY "Enable all on payment_requests" ON public.payment_requests FOR ALL USING (true) WITH CHECK (true);


-- 8. جدول رسائل وتنبيهات المنصة (notifications)
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    target_grade VARCHAR(50) DEFAULT 'الكل',
    is_urgent BOOLEAN DEFAULT FALSE,
    created_by VARCHAR(100) DEFAULT 'مستر عمرو السيد',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on notifications" ON public.notifications;
CREATE POLICY "Enable all on notifications" ON public.notifications FOR ALL USING (true) WITH CHECK (true);


-- 9. جدول لوحة الشرف وأوائل الدفعة (honor_board)
CREATE TABLE IF NOT EXISTS public.honor_board (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_name VARCHAR(150) NOT NULL,
    governorate VARCHAR(50) NOT NULL,
    score INT NOT NULL,
    max_score INT DEFAULT 60,
    rank INT DEFAULT 1,
    title_badge VARCHAR(150) DEFAULT 'المركز الأول على مستوى الجمهورية 🥇',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.honor_board ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on honor_board" ON public.honor_board;
CREATE POLICY "Enable all on honor_board" ON public.honor_board FOR ALL USING (true) WITH CHECK (true);


-- 10. جدول السكرتارية والمساعدين (secretaries)
CREATE TABLE IF NOT EXISTS public.secretaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    role VARCHAR(50) DEFAULT 'سكرتارية ومساعدين',
    permissions JSONB DEFAULT '{"manage_students": true, "manage_exams": true, "manage_payments": true}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.secretaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on secretaries" ON public.secretaries;
CREATE POLICY "Enable all on secretaries" ON public.secretaries FOR ALL USING (true) WITH CHECK (true);


-- 11. إعدادات المنصة وحقوق النشر والسنة الدراسية (platform_settings)
CREATE TABLE IF NOT EXISTS public.platform_settings (
    key VARCHAR(50) PRIMARY KEY,
    value TEXT NOT NULL
);

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on platform_settings" ON public.platform_settings;
CREATE POLICY "Enable all on platform_settings" ON public.platform_settings FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.platform_settings (key, value) VALUES
    ('academic_year', '2026'),
    ('platform_name', 'الكيمياء مع مستر عمرو السيد'),
    ('contact_phone', '01069780486'),
    ('theme_color', 'golden')
ON CONFLICT (key) DO NOTHING;

-- 12. تحديثات غير هدامة لبيانات المحاولات وبنك الأسئلة في حسابي (دون مسح أي بيانات حالية)
ALTER TABLE public.exam_submissions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ;
ALTER TABLE public.exam_submissions ADD COLUMN IF NOT EXISTS attempt_number INT DEFAULT 1;
ALTER TABLE public.exam_submissions ADD COLUMN IF NOT EXISTS solved_count INT DEFAULT 0;
ALTER TABLE public.exam_submissions ADD COLUMN IF NOT EXISTS correct_count INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.question_bank_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    attempts JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.question_bank_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on question_bank_progress" ON public.question_bank_progress;
CREATE POLICY "Enable all on question_bank_progress" ON public.question_bank_progress FOR ALL USING (true) WITH CHECK (true);

-- 13. جدول رسائل واستفسارات الدعم الفني الخاصة بكل طالب ومستخدم (support_messages)
CREATE TABLE IF NOT EXISTS public.support_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_key VARCHAR(150) NOT NULL,
    student_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    student_name VARCHAR(150) NOT NULL,
    student_code VARCHAR(30),
    student_phone VARCHAR(30),
    student_grade VARCHAR(60),
    page_number VARCHAR(40),
    question_number VARCHAR(40),
    status VARCHAR(20) DEFAULT 'open', -- 'open' | 'answered'
    messages JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all on support_messages" ON public.support_messages;
CREATE POLICY "Enable all on support_messages" ON public.support_messages FOR ALL USING (true) WITH CHECK (true);

