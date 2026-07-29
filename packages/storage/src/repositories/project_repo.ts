import Database from 'better-sqlite3';
import { PhaseState, PhaseId } from '@deepdive/core';

export interface ProjectRecord {
  id: string;
  name: string;
  mode: 'greenfield' | 'onboarding';
  createdAt: string;
  updatedAt: string;
}

interface ProjectDbRow {
  id: string;
  name: string;
  mode: 'greenfield' | 'onboarding';
  created_at: string;
  updated_at: string;
}

interface PhaseStateDbRow {
  current_phase: PhaseId;
  round_count: number;
  mode: 'greenfield' | 'onboarding';
  is_complete: number;
}

export class ProjectRepository {
  constructor(private db: Database.Database) {}

  createProject(project: ProjectRecord, initialState: PhaseState): void {
    const insertProject = this.db.prepare(
      'INSERT INTO projects (id, name, mode, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    );
    const insertState = this.db.prepare(
      'INSERT INTO phase_states (project_id, current_phase, round_count, mode, is_complete, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    );

    this.db.transaction(() => {
      insertProject.run(project.id, project.name, project.mode, project.createdAt, project.updatedAt);
      insertState.run(
        project.id,
        initialState.currentPhase,
        initialState.roundCount,
        initialState.mode,
        initialState.isComplete ? 1 : 0,
        project.updatedAt,
      );
    })();
  }

  getProject(id: string): ProjectRecord | null {
    const row = this.db
      .prepare('SELECT id, name, mode, created_at, updated_at FROM projects WHERE id = ?')
      .get(id) as ProjectDbRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      mode: row.mode,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  getPhaseState(projectId: string): PhaseState | null {
    const row = this.db
      .prepare(
        'SELECT current_phase, round_count, mode, is_complete FROM phase_states WHERE project_id = ? ORDER BY project_id ASC',
      )
      .get(projectId) as PhaseStateDbRow | undefined;
    if (!row) return null;
    return {
      currentPhase: row.current_phase,
      roundCount: row.round_count,
      mode: row.mode,
      isComplete: row.is_complete === 1,
    };
  }

  updatePhaseState(projectId: string, state: PhaseState, updatedAt: string): void {
    this.db
      .prepare(
        'UPDATE phase_states SET current_phase = ?, round_count = ?, is_complete = ?, updated_at = ? WHERE project_id = ?',
      )
      .run(state.currentPhase, state.roundCount, state.isComplete ? 1 : 0, updatedAt, projectId);
  }
}
