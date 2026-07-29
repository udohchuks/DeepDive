import crypto from 'crypto';
import {
  RubricDefinition,
  Finding,
  TestRunResult,
  Clock,
  IdGenerator,
} from '@deepdive/core';
import { RoundRepository, RoundRecord } from '@deepdive/storage';
import { evaluateDeterministicGate } from './deterministic_gate.js';
import { filterAndSanitizeFindings, buildRoleSession, transformToFinding } from '@deepdive/agent';

export interface SubmissionPipelineOptions {
  projectId: string;
  phaseId: string;
  rubric: RubricDefinition;
  artifactPayload: Record<string, unknown>;
  roundRepository: RoundRepository;
  clock: Clock;
  idGenerator: IdGenerator;
  testResult?: TestRunResult;
  modelProviderCallCount?: () => void;
}

export interface PipelineExecutionResult {
  roundRecord: RoundRecord;
  exitState: 'approved' | 'revise' | 'clarifying_question';
  findings: Finding[];
  shortCircuitedByDeterministicGate: boolean;
}

export class SubmissionOrchestrator {
  constructor(private options: SubmissionPipelineOptions) {}

  public computeSubmissionHash(payload: Record<string, unknown>): string {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  }

  async executeReviewRound(): Promise<PipelineExecutionResult> {
    const { projectId, phaseId, rubric, roundRepository, clock, idGenerator, testResult, artifactPayload } = this.options;

    // 1. Get prior rounds for round index calculation
    const priorRounds = roundRepository.getRounds(projectId);
    const roundNumber = priorRounds.length + 1;

    // 2. Deterministic Gate Check (D-1)
    const detGateResult = evaluateDeterministicGate(rubric, testResult, () => idGenerator.generate(), artifactPayload);
    if (!detGateResult.passed) {
      // Short-circuit to revise without calling model provider Grader!
      const roundRecord: RoundRecord = {
        id: idGenerator.generate(),
        projectId,
        phaseId,
        roundNumber,
        submittedAt: clock.isoString(),
        status: 'revise',
      };

      roundRepository.addRound(roundRecord);

      return {
        roundRecord,
        exitState: 'revise',
        findings: detGateResult.failedFindings,
        shortCircuitedByDeterministicGate: true,
      };
    }

    // 3. Verifier pass (Role session execution)
    const verifierSession = buildRoleSession('verifier');
    await verifierSession.executeTool('read', { path: 'artifact.json' });

    // Simulated Verifier observation transformation
    const verifierRawFinding = transformToFinding(
      {
        code: 'CITATION_MISSING',
        severity: 'warning',
        targetFieldId: rubric.criteria[0]?.id ?? 'c1',
      },
      () => idGenerator.generate(),
    );

    // 4. Dual-LLM Quarantine Filter (Step 5)
    const sanitizedFindings = filterAndSanitizeFindings([verifierRawFinding]);

    // 5. Grader pass (Role session execution)
    const graderSession = buildRoleSession('grader');
    await graderSession.executeTool('submit_rubric_verdict', { verdict: 'revise' });
    if (this.options.modelProviderCallCount) {
      this.options.modelProviderCallCount();
    }

    const exitState: 'approved' | 'revise' | 'clarifying_question' =
      sanitizedFindings.some((f) => f.severity === 'error') ? 'revise' : 'approved';

    const roundRecord: RoundRecord = {
      id: idGenerator.generate(),
      projectId,
      phaseId,
      roundNumber,
      submittedAt: clock.isoString(),
      status: exitState,
    };

    roundRepository.addRound(roundRecord);

    return {
      roundRecord,
      exitState,
      findings: sanitizedFindings,
      shortCircuitedByDeterministicGate: false,
    };
  }
}
