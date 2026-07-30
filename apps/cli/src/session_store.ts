import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import {
  createDbConnection,
  runMigrations,
  ProjectRepository,
  RoundRepository,
  ArtifactRepository,
  RoundRecord,
} from '@deepdive/storage';
import { Clock, Finding, IdGenerator, SystemClock, CryptoIdGenerator } from '@deepdive/core';

export const DEEPDIVE_DIR = '.deepdive';
export const DB_FILENAME = 'deepdive.db';

/**
 * Where a project's history lives.
 *
 * Kept beside the student's own work rather than in a shared home directory,
 * so a project is self-contained: copy or delete the folder and its history
 * travels with it, and two projects cannot collide.
 */
export function resolveDbPath(projectDir: string): string {
  return path.join(path.resolve(projectDir), DEEPDIVE_DIR, DB_FILENAME);
}

export interface SessionStoreOptions {
  projectDir: string;
  projectName?: string;
  clock?: Clock;
  idGenerator?: IdGenerator;
}

export interface RoundSummary {
  roundNumber: number;
  phaseId: string;
  status: string;
  submittedAt: string;
  findings: Finding[];
}

/**
 * Persists rounds across CLI invocations.
 *
 * Each command previously started cold, so a student had no record of what
 * they submitted or what came back — the round history the schema was designed
 * for was never written. This opens the project database, applies migrations,
 * and appends one round per submission.
 *
 * Rounds and turns are append-only by design (the repository refuses updates),
 * so a resubmission adds a round rather than overwriting the previous verdict.
 * The history is the point: it is the record of how the student's thinking
 * changed.
 */
export class SessionStore {
  private readonly db: Database.Database;
  private readonly projects: ProjectRepository;
  private readonly rounds: RoundRepository;
  private readonly artifacts: ArtifactRepository;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  readonly projectId: string;
  readonly dbPath: string;

  constructor(options: SessionStoreOptions) {
    this.clock = options.clock ?? new SystemClock();
    this.ids = options.idGenerator ?? new CryptoIdGenerator();

    this.dbPath = resolveDbPath(options.projectDir);
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    this.db = createDbConnection(this.dbPath);
    runMigrations(this.db);

    this.projects = new ProjectRepository(this.db);
    this.rounds = new RoundRepository(this.db);
    this.artifacts = new ArtifactRepository(this.db);

    this.projectId = this.ensureProject(
      options.projectName ?? path.basename(path.resolve(options.projectDir)),
    );
  }

  /**
   * One project per database, created on first use.
   *
   * The id is looked up from the existing row rather than regenerated, because
   * a fresh id on every run would orphan all previous rounds — history would
   * appear empty while still occupying the file.
   */
  private ensureProject(name: string): string {
    const existing = this.db.prepare('SELECT id FROM projects LIMIT 1').get() as
      | { id: string }
      | undefined;
    if (existing) return existing.id;

    const id = this.ids.generate();
    const now = this.clock.isoString();
    this.projects.createProject(
      { id, name, mode: 'greenfield', createdAt: now, updatedAt: now },
      { currentPhase: 'A', roundCount: 0, mode: 'greenfield', isComplete: false },
    );
    return id;
  }

  /** Next round number for a phase. Rounds are unbounded by design (§7). */
  nextRoundNumber(): number {
    return this.rounds.getRounds(this.projectId).length + 1;
  }

  /**
   * Records one submission.
   *
   * The artifact is stored alongside the verdict so a past round can be read
   * back in full: a status with no record of what was submitted cannot explain
   * why it was rejected.
   */
  recordRound(input: {
    phaseId: string;
    status: string;
    artifactType: string;
    artifactPayload: Record<string, unknown>;
    findings?: Finding[];
    verdictPayload?: unknown;
  }): RoundRecord {
    const now = this.clock.isoString();
    const round: RoundRecord = {
      id: this.ids.generate(),
      projectId: this.projectId,
      phaseId: input.phaseId,
      roundNumber: this.nextRoundNumber(),
      submittedAt: now,
      status: input.status,
    };

    this.rounds.addRound(round);

    // saveArtifact assigns its own monotonic version per artifact type.
    this.artifacts.saveArtifact(
      this.ids.generate(),
      this.projectId,
      input.artifactType,
      JSON.stringify(input.artifactPayload),
      now,
    );

    this.rounds.addTurn(
      {
        id: this.ids.generate(),
        roundId: round.id,
        roleId: 'grader',
        verdictStatus: input.status,
        payloadJson: JSON.stringify(input.verdictPayload ?? {}),
        createdAt: now,
      },
      input.findings ?? [],
    );

    return round;
  }

  /** Full round history, oldest first, with each round's findings attached. */
  history(): RoundSummary[] {
    return this.rounds.getRounds(this.projectId).map((round) => {
      const findings = this.rounds
        .getTurnsForRound(round.id)
        .flatMap((turn) => this.rounds.getFindingsForTurn(turn.id));

      return {
        roundNumber: round.roundNumber,
        phaseId: round.phaseId,
        status: round.status,
        submittedAt: round.submittedAt,
        findings,
      };
    });
  }

  close(): void {
    this.db.close();
  }
}
