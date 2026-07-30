import Database from 'better-sqlite3';
import { QuizItem, QuizItemType, CompletionRecord, CompletionRecordSchema } from '@deepdive/core';

interface QuizDbRow {
  id: string;
  concept_id: string;
  quiz_type: QuizItemType;
  question: string;
  options_json: string | null;
  correct_answer: string;
  explanation: string;
}

interface CompletionRecordDbRow {
  record_json: string;
}

export class QuizRepository {
  constructor(private db: Database.Database) {}

  /**
   * Adds a question to the project's bank.
   *
   * Ignores a question already banked under the same wording: generation runs
   * again on every quiz, and without this the bank would fill with near-copies
   * of the same question and crowd out the concepts still untested.
   */
  saveQuizItem(projectId: string, item: QuizItem): void {
    this.db
      .prepare(
        'INSERT OR IGNORE INTO quizzes (id, project_id, concept_id, quiz_type, question, options_json, correct_answer, explanation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        item.id,
        projectId,
        item.conceptId,
        item.type,
        item.question,
        item.options ? JSON.stringify(item.options) : null,
        item.correctAnswer,
        item.explanation,
      );
  }

  getQuizzesForProject(projectId: string): QuizItem[] {
    const rows = this.db
      .prepare(
        'SELECT id, concept_id, quiz_type, question, options_json, correct_answer, explanation FROM quizzes WHERE project_id = ? ORDER BY id ASC',
      )
      .all(projectId) as QuizDbRow[];

    return rows.map((r) => ({
      id: r.id,
      conceptId: r.concept_id,
      type: r.quiz_type,
      question: r.question,
      options: r.options_json ? JSON.parse(r.options_json) : undefined,
      correctAnswer: r.correct_answer,
      explanation: r.explanation,
    }));
  }

  saveCompletionRecord(record: CompletionRecord): void {
    this.db
      .prepare(
        'INSERT INTO completion_records (id, project_id, mode, charter_title, record_json, content_hash, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        record.id,
        record.projectId,
        record.mode,
        record.charterTitle,
        JSON.stringify(record),
        record.contentHash,
        record.completedAt,
      );
  }

  getCompletionRecord(projectId: string): CompletionRecord | null {
    const row = this.db
      .prepare('SELECT record_json FROM completion_records WHERE project_id = ? ORDER BY completed_at DESC LIMIT 1')
      .get(projectId) as CompletionRecordDbRow | undefined;

    if (!row) return null;
    return CompletionRecordSchema.parse(JSON.parse(row.record_json));
  }
}
