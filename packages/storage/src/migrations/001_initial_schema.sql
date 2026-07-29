-- Initial Schema Migration for DeepDive Storage

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS phase_states (
  project_id TEXT PRIMARY KEY,
  current_phase TEXT NOT NULL,
  round_count INTEGER NOT NULL DEFAULT 1,
  mode TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS rounds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  phase_id TEXT NOT NULL,
  round_number INTEGER NOT NULL,
  submitted_at TEXT NOT NULL,
  status TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS turns (
  id TEXT PRIMARY KEY,
  round_id TEXT NOT NULL,
  role_id TEXT NOT NULL,
  verdict_status TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS findings (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  target_field_id TEXT NOT NULL,
  file_path TEXT,
  line_start INTEGER,
  line_end INTEGER,
  pass_count INTEGER,
  fail_count INTEGER,
  FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hints (
  id TEXT PRIMARY KEY,
  turn_id TEXT NOT NULL,
  level TEXT NOT NULL,
  content TEXT NOT NULL,
  revealed_at TEXT NOT NULL,
  FOREIGN KEY (turn_id) REFERENCES turns(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  quiz_type TEXT NOT NULL,
  question TEXT NOT NULL,
  options_json TEXT,
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS completion_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  mode TEXT NOT NULL,
  charter_title TEXT NOT NULL,
  record_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
