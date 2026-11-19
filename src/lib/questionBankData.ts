/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExamOrAssignment, QuestionBankItem } from '../types';
import { normalizeGrade } from './courseHelpers';

export const CURRICULUM_QUESTION_BANK: QuestionBankItem[] = [
  // ==========================================================
  // 3rd Secondary — Unit 1: English Tenses & Grammar Mastery
  // ==========================================================
  {
    id: 'qb-3sec-ch1-1',
    grade: '3rd Secondary',
    chapter: 'Unit 1: English Tenses & Grammar',
    lesson: 'Lesson 1: Past Simple vs. Past Continuous & Present Perfect',
    difficulty: 'easy',
    type: 'mcq',
    points: 2,
    question: 'While I ________ for the bus yesterday evening, it suddenly started to rain heavily.',
    options: [
      'A) waited',
      'B) was waiting',
      'C) have waited',
      'D) had waited',
    ],
    correctAnswer: 'B) was waiting',
    explanation: 'We use the past continuous (was waiting) for an action in progress in the past that was interrupted by a shorter action in the past simple (started).',
  },
  {
    id: 'qb-3sec-ch1-2',
    grade: '3rd Secondary',
    chapter: 'Unit 1: English Tenses & Grammar',
    lesson: 'Lesson 1: Past Simple vs. Past Continuous & Present Perfect',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'She ________ in London for five years before she moved to Cairo in 2024.',
    options: ['A) lives', 'B) has lived', 'C) had lived', 'D) is living'],
    correctAnswer: 'C) had lived',
    explanation: 'The past perfect (had lived) expresses an action completed before another past event (moved to Cairo in 2024).',
  },
  {
    id: 'qb-3sec-ch1-3',
    grade: '3rd Secondary',
    chapter: 'Unit 1: English Tenses & Grammar',
    lesson: 'Lesson 2: Passive Voice & Causative Structures',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'A new public library ________ in our neighborhood at the moment.',
    options: [
      'A) is building',
      'B) is being built',
      'C) has built',
      'D) was built',
    ],
    correctAnswer: 'B) is being built',
    explanation: 'The phrase "at the moment" indicates the present continuous, and since the library receives the action, we use the passive form: is being + past participle (built).',
  },
  {
    id: 'qb-3sec-ch1-4',
    grade: '3rd Secondary',
    chapter: 'Unit 1: English Tenses & Grammar',
    lesson: 'Lesson 3: Conditionals & Modal Verbs of Deduction',
    difficulty: 'hard',
    type: 'mcq',
    points: 3,
    question: 'If he ________ earlier, he would not have missed the opening speech of the conference.',
    options: [
      'A) arrived',
      'B) arrives',
      'C) had arrived',
      'D) would arrive',
    ],
    correctAnswer: 'C) had arrived',
    explanation: 'This is a Third Conditional sentence referring to an unreal past situation: If + Past Perfect (had arrived), ... would have + past participle.',
  },
  {
    id: 'qb-3sec-ch1-5',
    grade: '3rd Secondary',
    chapter: 'Unit 1: English Tenses & Grammar',
    lesson: 'Lesson 3: Conditionals & Modal Verbs of Deduction',
    difficulty: 'medium',
    type: 'essay',
    points: 4,
    question: 'Explain the difference in meaning between "must have + past participle" and "can\'t have + past participle" when making deductions about the past, and provide one clear example for each.',
    options: [],
    correctAnswer: '"Must have + p.p." expresses near certainty that something happened in the past (e.g., The ground is wet; it must have rained last night). "Can\'t have + p.p." expresses certainty that something was impossible in the past (e.g., She can\'t have forgotten; I reminded her an hour ago).',
    explanation: 'Both structures express past deduction: "must have" for strong positive certainty and "can\'t have" for strong negative certainty.',
  },

  // ==========================================================
  // 3rd Secondary — Unit 2: Vocabulary, Idioms & Collocations
  // ==========================================================
  {
    id: 'qb-3sec-ch2-1',
    grade: '3rd Secondary',
    chapter: 'Unit 2: Vocabulary & Collocations',
    lesson: 'Lesson 1: Academic Words & Context Clues',
    difficulty: 'easy',
    type: 'mcq',
    points: 2,
    question: 'The journalist refused to publish the story until she could ________ the accuracy of her sources.',
    options: [
      'A) ignore',
      'B) verify',
      'C) exaggerate',
      'D) postpone',
    ],
    correctAnswer: 'B) verify',
    explanation: '"Verify" means to check or prove that something is true and accurate, which fits checking journalistic sources.',
  },
  {
    id: 'qb-3sec-ch2-2',
    grade: '3rd Secondary',
    chapter: 'Unit 2: Vocabulary & Collocations',
    lesson: 'Lesson 2: Phrasal Verbs & Prepositions',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'Because of the heavy fog, the organizers had to ________ the outdoor ceremony until next week.',
    options: ['A) put off', 'B) put on', 'C) look after', 'D) turn up'],
    correctAnswer: 'A) put off',
    explanation: '"Put off" is a phrasal verb meaning to postpone or delay an event to a later time.',
  },
  {
    id: 'qb-3sec-ch2-3',
    grade: '3rd Secondary',
    chapter: 'Unit 2: Vocabulary & Collocations',
    lesson: 'Lesson 3: Synonyms, Antonyms & Idioms',
    difficulty: 'hard',
    type: 'mcq',
    points: 3,
    question: 'Which word is closest in meaning to "resilient" in the sentence: "The community remained resilient despite the economic challenges"?',
    options: ['A) fragile', 'B) adaptable and strong', 'C) indifferent', 'D) reluctant'],
    correctAnswer: 'B) adaptable and strong',
    explanation: '"Resilient" describes the ability to recover quickly from difficulties and stay strong under pressure.',
  },

  // ==========================================================
  // 3rd Secondary — Unit 3, 4 & Writing Skills
  // ==========================================================
  {
    id: 'qb-3sec-ch3-1',
    grade: '3rd Secondary',
    chapter: 'Unit 3: Relative Clauses & Sentence Structure',
    lesson: 'Defining & Non-defining Relative Clauses',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'The university ________ my older sister studied engineering has just opened a new research center.',
    options: [
      'A) which',
      'B) where',
      'C) whose',
      'D) whom',
    ],
    correctAnswer: 'B) where',
    explanation: '"Where" refers to a place where an action happened ("studied engineering at the university").',
  },
  {
    id: 'qb-3sec-ch4-1',
    grade: '3rd Secondary',
    chapter: 'Unit 4: Reported Speech & Inversion',
    lesson: 'Reporting Statements & Questions',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'Omar asked me where ________ the previous weekend.',
    options: [
      'A) did I go',
      'B) had I gone',
      'C) I had gone',
      'D) I go',
    ],
    correctAnswer: 'C) I had gone',
    explanation: 'In reported questions, we use statement word order (subject + verb) without "did", and backshift past simple to past perfect ("I had gone").',
  },
  {
    id: 'qb-3sec-ch5-1',
    grade: '3rd Secondary',
    chapter: 'Unit 5: Essay Writing & Punctuation',
    lesson: 'Punctuation Marks & Sentence Mechanics',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'Which of the following sentences is punctuated correctly?',
    options: [
      'A) However I studied hard, I felt nervous before the exam.',
      'B) She bought three items: a notebook, a dictionary, and a highlighter.',
      'C) Its important to review your essay before submitting it.',
      'D) My teacher Miss Asmaa gave us extra practice.',
    ],
    correctAnswer: 'B) She bought three items: a notebook, a dictionary, and a highlighter.',
    explanation: 'A colon properly introduces a list after a complete independent clause, whereas (A) misuses "however", (C) confuses "Its" with "It\'s", and (D) misses commas around the appositive.',
  },
  {
    id: 'qb-3sec-ch5-2',
    grade: '3rd Secondary',
    chapter: 'Unit 5: Essay Writing & Punctuation',
    lesson: 'Essay Structure & Transition Signals',
    difficulty: 'hard',
    type: 'mcq',
    points: 3,
    question: 'Which transition phrase best introduces a contrasting idea between two sentences?',
    options: [
      'A) Furthermore,',
      'B) Consequently,',
      'C) On the other hand,',
      'D) In addition,',
    ],
    correctAnswer: 'C) On the other hand,',
    explanation: '"On the other hand" signals contrast, whereas "Furthermore" and "In addition" add supporting points and "Consequently" indicates a result.',
  },

  // ==========================================================
  // 2nd Secondary
  // ==========================================================
  {
    id: 'qb-2sec-u1-1',
    grade: '2nd Secondary',
    chapter: 'Unit 1: Future Forms & Comparisons',
    lesson: 'Will, Going to & Future Continuous',
    difficulty: 'easy',
    type: 'mcq',
    points: 2,
    question: 'Look at those dark clouds! It ________ very soon.',
    options: ['A) will rain', 'B) is going to rain', 'C) rains', 'D) has rained'],
    correctAnswer: 'B) is going to rain',
    explanation: 'We use "be going to" for predictions based on present physical evidence (those dark clouds).',
  },
  {
    id: 'qb-2sec-u2-1',
    grade: '2nd Secondary',
    chapter: 'Unit 2: Comparative & Superlative Adjectives',
    lesson: 'Modifiers & Parallel Comparisons',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'The ________ you practice speaking English, the more confident you will become.',
    options: [
      'A) most',
      'B) more',
      'C) much',
      'D) many',
    ],
    correctAnswer: 'B) more',
    explanation: 'Double comparatives follow the structure: "The + comparative ..., the + comparative ...".',
  },

  // ==========================================================
  // 1st Secondary
  // ==========================================================
  {
    id: 'qb-1sec-u1-1',
    grade: '1st Secondary',
    chapter: 'Unit 1: Core Grammar Foundations',
    lesson: 'Present Simple vs. Present Continuous',
    difficulty: 'easy',
    type: 'mcq',
    points: 2,
    question: 'Water ________ at 100 degrees Celsius under standard atmospheric pressure.',
    options: [
      'A) is boiling',
      'B) boils',
      'C) boiled',
      'D) has boiled',
    ],
    correctAnswer: 'B) boils',
    explanation: 'Scientific facts and general truths are always expressed using the present simple tense.',
  },
  {
    id: 'qb-1sec-u2-1',
    grade: '1st Secondary',
    chapter: 'Unit 2: Articles & Countable/Uncountable Nouns',
    lesson: 'Definite & Indefinite Articles (a, an, the)',
    difficulty: 'medium',
    type: 'mcq',
    points: 2,
    question: 'My brother hopes to become ________ honest journalist who reports the truth.',
    options: ['A) a', 'B) an', 'C) the', 'D) no article'],
    correctAnswer: 'B) an',
    explanation: 'The "h" in "honest" is silent, so the word begins with a vowel sound and takes the indefinite article "an".',
  },
];

/**
 * Merges questions published inside existing teacher exams/assignments/sheets
 * with the curated curriculum question bank, deduplicated by normalized question text.
 */
export function buildUnifiedQuestionBank(
  exams: ExamOrAssignment[],
  targetGrade?: string
): QuestionBankItem[] {
  const seen = new Set<string>();
  const merged: QuestionBankItem[] = [];

  const pushUnique = (item: QuestionBankItem) => {
    const key = item.question.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
  };

  // 1. Live teacher questions from exams / assignments / sheets (non-custom)
  exams
    .filter((ex) => !ex.isCustomForStudentId)
    .forEach((ex) => {
      const grade = normalizeGrade(ex.grade || '3rd Secondary');
      const defaultLesson = ex.lessonTitle || ex.title;
      (ex.questions || []).forEach((q, idx) => {
        pushUnique({
          ...q,
          id: q.id || `${ex.id}-q${idx + 1}`,
          grade,
          chapter: q.chapter || ex.chapter || 'General Revision & Platform Practice',
          lesson: q.lesson || defaultLesson,
          sourceTitle: ex.title,
        });
      });
    });

  // 2. Curated English curriculum bank
  CURRICULUM_QUESTION_BANK.forEach((item) => pushUnique(item));

  const normalizedTarget = targetGrade ? normalizeGrade(targetGrade) : '';
  if (normalizedTarget && normalizedTarget !== 'All') {
    const gradeMatched = merged.filter((q) => normalizeGrade(q.grade) === normalizedTarget);
    return gradeMatched.length > 0 ? gradeMatched : merged;
  }
  return merged;
}
