import { RoundSummary, StudioStats } from './deepdive_client.js';

export type NodeKind = 'section' | 'phase' | 'stat' | 'round' | 'finding' | 'message';

export interface TreeNode {
  id: string;
  label: string;
  description?: string;
  kind: NodeKind;
  /** A themed codicon id, so the tree reads at a glance. */
  icon?: string;
  children?: TreeNode[];
  /** Round number a node belongs to, for the commands that act on one. */
  roundNumber?: number;
}

const GREENFIELD = ['A', 'B', 'C', 'D', 'E', 'F'];
const ONBOARDING = ['OB-A', 'OB-B', 'OB-C', 'OB-D', 'OB-E', 'OB-F', 'OB-G'];

/**
 * Which track the project is on, decided by evidence rather than by asking.
 *
 * Mirrors the CLI studio: a project with no approved phase has no track to
 * report yet, and greenfield is the thing you are on until an onboarding phase
 * says otherwise.
 */
export function trackFor(phasesApproved: readonly string[]): {
  name: 'greenfield' | 'onboarding';
  phases: string[];
} {
  return phasesApproved.some((p) => p.startsWith('OB-'))
    ? { name: 'onboarding', phases: ONBOARDING }
    : { name: 'greenfield', phases: GREENFIELD };
}

function statNodes(stats: StudioStats): TreeNode[] {
  const hour =
    stats.peakHour === null
      ? '—'
      : `${((stats.peakHour + 11) % 12) + 1}${stats.peakHour < 12 ? 'am' : 'pm'}`;

  // Effort and outcome stay separate here for the same reason they do in the
  // CLI studio: collapsing them into one number would make a day of hard
  // revision look like a bad day.
  return [
    { id: 'stat-rounds', kind: 'stat', label: 'Rounds', description: String(stats.rounds), icon: 'history' },
    {
      id: 'stat-approved',
      kind: 'stat',
      label: 'Approved',
      description: `${stats.approved} of ${stats.rounds}`,
      icon: 'pass',
    },
    { id: 'stat-days', kind: 'stat', label: 'Active days', description: String(stats.activeDays), icon: 'calendar' },
    {
      id: 'stat-streak',
      kind: 'stat',
      label: 'Current streak',
      description: `${stats.currentStreak}d`,
      icon: 'flame',
    },
    {
      id: 'stat-longest',
      kind: 'stat',
      label: 'Longest streak',
      description: `${stats.longestStreak}d`,
      icon: 'graph',
    },
    { id: 'stat-hour', kind: 'stat', label: 'Peak hour', description: hour, icon: 'clock' },
    {
      id: 'stat-hints',
      kind: 'stat',
      label: 'Hints taken',
      description: String(stats.hintsTaken),
      icon: 'lightbulb',
    },
    {
      id: 'stat-mastery',
      kind: 'stat',
      label: 'Concepts mastered',
      description: `${stats.conceptsMastered} of ${stats.conceptsTracked}`,
      icon: 'mortar-board',
    },
  ];
}

function roundNodes(rounds: readonly RoundSummary[]): TreeNode[] {
  // Newest first: the tree is read to answer "what just happened", while the
  // CLI history is read as a sequence and stays oldest-first.
  return [...rounds].reverse().map((round) => ({
    id: `round-${round.roundNumber}`,
    kind: 'round' as const,
    label: `${round.roundNumber}. ${round.status}`,
    description: `phase ${round.phaseId} · ${round.roleId}`,
    icon: round.status === 'approved' ? 'pass-filled' : round.status === 'completed' ? 'circle-filled' : 'error',
    roundNumber: round.roundNumber,
    children: round.findings.map((finding, index) => ({
      id: `round-${round.roundNumber}-finding-${index}`,
      kind: 'finding' as const,
      label: finding.targetFieldId,
      description: finding.message ?? finding.code,
      icon: 'warning',
      roundNumber: round.roundNumber,
    })),
  }));
}

/**
 * The whole sidebar, from one studio call.
 *
 * Returns plain data rather than VS Code TreeItems so it can be tested without
 * the editor, which is also what keeps `vscode` out of every file but one.
 */
export function buildTree(stats: StudioStats | undefined, rounds: readonly RoundSummary[]): TreeNode[] {
  if (!stats || stats.rounds === 0) {
    return [
      {
        id: 'empty',
        kind: 'message',
        label: 'Nothing recorded yet',
        description: 'Run DeepDive: Grade on a charter to start',
        icon: 'info',
      },
    ];
  }

  const track = trackFor(stats.phasesApproved);
  const done = new Set(stats.phasesApproved);

  return [
    {
      id: 'progress',
      kind: 'section',
      label: track.name,
      description: `${done.size} of ${track.phases.length} phases`,
      icon: 'checklist',
      children: track.phases.map((phase) => ({
        id: `phase-${phase}`,
        kind: 'phase' as const,
        label: phase,
        description: done.has(phase) ? 'approved' : '',
        icon: done.has(phase) ? 'pass-filled' : 'circle-outline',
      })),
    },
    {
      id: 'consistency',
      kind: 'section',
      label: 'Consistency',
      icon: 'pulse',
      children: statNodes(stats),
    },
    {
      id: 'rounds',
      kind: 'section',
      label: 'Rounds',
      description: String(rounds.length),
      icon: 'history',
      children: roundNodes(rounds),
    },
  ];
}

/** The status bar text: current phase and whether a streak is live. */
export function statusBarText(stats: StudioStats | undefined): string {
  if (!stats || stats.rounds === 0) return '$(mortar-board) DeepDive';

  const track = trackFor(stats.phasesApproved);
  const next = track.phases.find((p) => !stats.phasesApproved.includes(p));
  const phase = next ? `phase ${next}` : 'all phases done';
  const streak = stats.currentStreak > 0 ? ` · ${stats.currentStreak}d` : '';

  return `$(mortar-board) ${phase}${streak}`;
}
