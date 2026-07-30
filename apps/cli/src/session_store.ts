import fs from 'fs';
import path from 'path';
import type Database from 'better-sqlite3';
import {
  createDbConnection,
  runMigrations,
  ProjectRepository,
  RoundRepository,
  ArtifactRepository,
  HintRepository,
  MasteryRepository,
  QuizRepository,
  RoundRecord,
} from '@deepdive/storage';
import {
  Clock,
  Finding,
  CompletionRecord,
  Hint,
  HintLevel,
  MasteryState,
  QuizItem,
  IdGenerator,
  PhaseId,
  SystemClock,
  CryptoIdGenerator,
} from '@deepdive/core';

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
  /**
   * Refuse to create the database if it does not already exist.
   *
   * Read-only commands pass this. `deepdive history` in an unrelated directory
   * used to leave a `.deepdive` folder behind, so looking at a project marked
   * the filesystem — and worse, a typo'd `--project` silently created a second,
   * empty project rather than saying the first one was not there.
   */
  mustExist?: boolean;
}

/** Thrown when a read-only command is pointed at a directory with no history. */
export class NoProjectHistoryError extends Error {
  constructor(projectDir: string) {
    super(`No DeepDive history in ${path.resolve(projectDir)}.`);
    this.name = 'NoProjectHistoryError';
  }
}

/**
 * Which artifact each phase submits.
 *
 * A hint needs the work it is about, and rounds record a phase rather than a
 * pointer to their artifact, so the phase is what maps back to it.
 */
export const PHASE_ARTIFACT_TYPE: Record<string, string> = {
  A: 'charter',
  B: 'sdd',
  C: 'scaffold',
  D: 'verify',
  'OB-A': 'repo-charter',
  'OB-B': 'rsdd',
  'OB-C': 'plan',
  'OB-D': 'characterization',
  'OB-E': 'cdd',
  'OB-F': 'quiz',
};

export interface HintableTurn {
  turnId: string;
  roundNumber: number;
  phaseId: string;
  findings: Finding[];
  artifact: Record<string, unknown>;
}

export interface RoundSummary {
  roundNumber: number;
  phaseId: string;
  status: string;
  submittedAt: string;
  /** Which role produced the round, so `grade` and `scaffold` are distinguishable. */
  roleId: string;
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
  private readonly hints: HintRepository;
  private readonly quizzes: QuizRepository;
  private readonly mastery: MasteryRepository;
  private readonly clock: Clock;
  private readonly ids: IdGenerator;

  readonly projectId: string;
  readonly dbPath: string;

  constructor(options: SessionStoreOptions) {
    this.clock = options.clock ?? new SystemClock();
    this.ids = options.idGenerator ?? new CryptoIdGenerator();

    this.dbPath = resolveDbPath(options.projectDir);

    if (options.mustExist && !fs.existsSync(this.dbPath)) {
      throw new NoProjectHistoryError(options.projectDir);
    }

    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });

    this.db = createDbConnection(this.dbPath);
    runMigrations(this.db);

    this.projects = new ProjectRepository(this.db);
    this.rounds = new RoundRepository(this.db);
    this.artifacts = new ArtifactRepository(this.db);
    this.hints = new HintRepository(this.db);
    this.quizzes = new QuizRepository(this.db);
    this.mastery = new MasteryRepository(this.db);

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
    /** Defaults to the Grader, the only role that recorded rounds originally. */
    roleId?: string;
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
        roleId: input.roleId ?? 'grader',
        verdictStatus: input.status,
        payloadJson: JSON.stringify(input.verdictPayload ?? {}),
        createdAt: now,
      },
      input.findings ?? [],
    );

    return round;
  }

  /**
   * The most recent submission of one artifact type, or null.
   *
   * Later phases build on earlier ones — the quiz is generated from the
   * approved reverse SDD — and reading it back from the record rather than
   * asking the student to re-supply the file means the two cannot disagree.
   */
  latestArtifact(artifactType: string): Record<string, unknown> | null {
    const record = this.artifacts.getLatestArtifact(this.projectId, artifactType);
    if (!record) return null;

    try {
      return JSON.parse(record.contentJson) as Record<string, unknown>;
    } catch {
      throw new Error(`Stored ${artifactType} artifact is not readable JSON.`);
    }
  }

  /**
   * The most recent round that has something to be stuck on.
   *
   * Hints attach to a turn, not to a project: the ladder is per-turn (§8b), so
   * a reveal must name which submission it was about. An approved round has no
   * findings and is skipped — there is nothing to hint at.
   */
  latestHintableTurn(): HintableTurn | null {
    const rounds = this.rounds.getRounds(this.projectId);

    for (let i = rounds.length - 1; i >= 0; i -= 1) {
      const round = rounds[i]!;
      const turn = this.rounds.getTurnsForRound(round.id)[0];
      if (!turn) continue;

      const findings = this.rounds.getFindingsForTurn(turn.id);
      if (findings.length === 0) continue;

      return {
        turnId: turn.id,
        roundNumber: round.roundNumber,
        phaseId: round.phaseId,
        findings,
        artifact: this.latestArtifact(PHASE_ARTIFACT_TYPE[round.phaseId] ?? '') ?? {},
      };
    }

    return null;
  }

  /**
   * Files the completion record in its own table, not only on disk.
   *
   * `completion.json` beside the project is the copy a student can show
   * someone; this is the copy that cannot be edited without the stored hash
   * disagreeing with it.
   */
  saveCompletion(record: CompletionRecord): void {
    this.quizzes.saveCompletionRecord(record);
  }

  completion(): CompletionRecord | null {
    return this.quizzes.getCompletionRecord(this.projectId);
  }

  /** Every question banked for this project, across all sessions. */
  quizBank(): QuizItem[] {
    return this.quizzes.getQuizzesForProject(this.projectId);
  }

  /** Banks a question. Re-banking one already stored is a no-op, not an error. */
  bankQuizItem(item: QuizItem): void {
    this.quizzes.saveQuizItem(this.projectId, item);
  }

  /** Per-concept mastery, carried across runs — the point of tracking it. */
  masteryStates(): MasteryState[] {
    return this.mastery.getAllStates(this.projectId);
  }

  saveMastery(state: MasteryState): void {
    this.mastery.saveState(this.projectId, state);
  }

  /** Hints already revealed for a turn, oldest first. */
  hintsFor(turnId: string): Hint[] {
    return this.hints.getHintsForTurn(turnId);
  }

  /** Records one reveal. Logged, never gated — nothing reads this to penalise. */
  recordHint(turnId: string, level: HintLevel, content: string): Hint {
    const hint: Hint = {
      id: this.ids.generate(),
      turnId,
      level,
      content,
      revealedAt: this.clock.isoString(),
    };
    this.hints.saveHint(hint);
    return hint;
  }

  /**
   * The primary sticking point of each round, oldest first.
   *
   * Struggle detection compares consecutive rounds, so it needs the sequence
   * rather than the latest value alone.
   */
  primaryFieldHistory(): string[] {
    return this.rounds
      .getRounds(this.projectId)
      .flatMap((round) => this.rounds.getTurnsForRound(round.id).slice(0, 1))
      .map((turn) => this.rounds.getFindingsForTurn(turn.id)[0]?.targetFieldId)
      .filter((field): field is string => Boolean(field));
  }

  /** Every turn that carries findings, with its hints, for the hint profile. */
  hintProfileSource(): { phaseId: PhaseId; turnId: string; fieldId: string; hints: Hint[] }[] {
    return this.rounds.getRounds(this.projectId).flatMap((round) =>
      this.rounds.getTurnsForRound(round.id).flatMap((turn) => {
        const fieldId = this.rounds.getFindingsForTurn(turn.id)[0]?.targetFieldId;
        if (!fieldId) return [];
        return [
          {
            phaseId: round.phaseId as PhaseId,
            turnId: turn.id,
            fieldId,
            hints: this.hints.getHintsForTurn(turn.id),
          },
        ];
      }),
    );
  }

  /** Full round history, oldest first, with each round's findings attached. */
  history(): RoundSummary[] {
    return this.rounds.getRounds(this.projectId).map((round) => {
      const turns = this.rounds.getTurnsForRound(round.id);
      const findings = turns.flatMap((turn) => this.rounds.getFindingsForTurn(turn.id));

      return {
        roundNumber: round.roundNumber,
        phaseId: round.phaseId,
        status: round.status,
        submittedAt: round.submittedAt,
        roleId: turns[0]?.roleId ?? 'grader',
        findings,
      };
    });
  }

  close(): void {
    this.db.close();
  }
}
