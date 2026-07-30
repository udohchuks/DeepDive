-- Mastery tracking per concept, so a quiz can test what a student has not yet
-- shown they know rather than re-asking what they already answered correctly.

CREATE TABLE IF NOT EXISTS mastery_states (
  project_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  attempts_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  last_tested_at TEXT,
  mastered INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, concept_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- A question already asked must not be asked again in the same wording, so the
-- bank is deduplicated on the question text within a project.
CREATE UNIQUE INDEX IF NOT EXISTS idx_quizzes_project_question
  ON quizzes (project_id, question);
