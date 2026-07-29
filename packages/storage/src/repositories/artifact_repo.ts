import Database from 'better-sqlite3';
import crypto from 'crypto';

export interface ArtifactRecord {
  id: string;
  projectId: string;
  artifactType: string;
  version: number;
  contentJson: string;
  contentHash: string;
  createdAt: string;
}

interface ArtifactDbRow {
  id: string;
  project_id: string;
  artifact_type: string;
  version: number;
  content_json: string;
  content_hash: string;
  created_at: string;
}

interface MaxVersionRow {
  max_version: number | null;
}

export class ArtifactRepository {
  constructor(private db: Database.Database) {}

  saveArtifact(id: string, projectId: string, artifactType: string, contentJson: string, createdAt: string): ArtifactRecord {
    const contentHash = crypto.createHash('sha256').update(contentJson).digest('hex');

    const latest = this.db
      .prepare(
        'SELECT MAX(version) as max_version FROM artifacts WHERE project_id = ? AND artifact_type = ? ORDER BY max_version DESC',
      )
      .get(projectId, artifactType) as MaxVersionRow | undefined;

    const version = (latest?.max_version ?? 0) + 1;

    this.db
      .prepare(
        'INSERT INTO artifacts (id, project_id, artifact_type, version, content_json, content_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      )
      .run(id, projectId, artifactType, version, contentJson, contentHash, createdAt);

    return {
      id,
      projectId,
      artifactType,
      version,
      contentJson,
      contentHash,
      createdAt,
    };
  }

  getLatestArtifact(projectId: string, artifactType: string): ArtifactRecord | null {
    const row = this.db
      .prepare(
        'SELECT id, project_id, artifact_type, version, content_json, content_hash, created_at FROM artifacts WHERE project_id = ? AND artifact_type = ? ORDER BY version DESC LIMIT 1',
      )
      .get(projectId, artifactType) as ArtifactDbRow | undefined;

    if (!row) return null;
    return {
      id: row.id,
      projectId: row.project_id,
      artifactType: row.artifact_type,
      version: row.version,
      contentJson: row.content_json,
      contentHash: row.content_hash,
      createdAt: row.created_at,
    };
  }

  hasIdenticalSubmissionHash(projectId: string, artifactType: string, contentJson: string): boolean {
    const contentHash = crypto.createHash('sha256').update(contentJson).digest('hex');
    const row = this.db
      .prepare(
        'SELECT 1 FROM artifacts WHERE project_id = ? AND artifact_type = ? AND content_hash = ? ORDER BY created_at DESC LIMIT 1',
      )
      .get(projectId, artifactType, contentHash);

    return row !== undefined;
  }
}
