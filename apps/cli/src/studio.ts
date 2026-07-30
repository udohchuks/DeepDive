import { MasteryState, PhaseId } from '@deepdive/core';
import { RoundSummary } from './session_store.js';

export interface StudioInput {
  projectDir: string;
  rounds: readonly RoundSummary[];
  mastery: readonly MasteryState[];
  hintsTaken: number;
  now: Date;
}

export interface StudioStats {
  rounds: number;
  approved: number;
  activeDays: number;
  currentStreak: number;
  longestStreak: number;
  peakHour: number | null;
  hintsTaken: number;
  conceptsMastered: number;
  conceptsTracked: number;
  phasesApproved: PhaseId[];
}

/** Local calendar day of a timestamp — streaks are about days as lived, not UTC. */
export function dayKey(iso: string | Date): string {
  const date = typeof iso === 'string' ? new Date(iso) : iso;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

/**
 * Counts consecutive days of activity ending today or yesterday.
 *
 * Yesterday counts so that a streak is not reported broken during the hours
 * before the day's first submission — a student who worked last night and
 * opens the studio over breakfast has not lost anything yet.
 */
export function currentStreak(days: ReadonlySet<string>, now: Date): number {
  let cursor = days.has(dayKey(now)) ? now : shiftDays(now, -1);
  if (!days.has(dayKey(cursor))) return 0;

  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor = shiftDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(days: ReadonlySet<string>): number {
  const sorted = [...days].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;

  for (const day of sorted) {
    const expected = previous ? dayKey(shiftDays(new Date(`${previous}T12:00:00`), 1)) : null;
    run = expected === day ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }

  return best;
}

export function computeStats(input: StudioInput): StudioStats {
  const days = new Set(input.rounds.map((r) => dayKey(r.submittedAt)));

  const hourCounts = new Map<number, number>();
  for (const round of input.rounds) {
    const hour = new Date(round.submittedAt).getHours();
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }
  const peak = [...hourCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];

  return {
    rounds: input.rounds.length,
    approved: input.rounds.filter((r) => r.status === 'approved').length,
    activeDays: days.size,
    currentStreak: currentStreak(days, input.now),
    longestStreak: longestStreak(days),
    peakHour: peak ? peak[0] : null,
    hintsTaken: input.hintsTaken,
    conceptsMastered: input.mastery.filter((m) => m.mastered).length,
    conceptsTracked: input.mastery.length,
    phasesApproved: [
      ...new Set(input.rounds.filter((r) => r.status === 'approved').map((r) => r.phaseId)),
    ] as PhaseId[],
  };
}

const HEATMAP_WEEKS = 12;
const SHADES = [' ', '·', '▪', '▣', '█'];

/**
 * A calendar heatmap of the last twelve weeks, one column per week.
 *
 * Rows are weekdays, so the shape of a working week is visible at a glance —
 * which is the thing a streak count alone cannot show.
 */
export function renderHeatmap(rounds: readonly RoundSummary[], now: Date): string[] {
  const counts = new Map<string, number>();
  for (const round of rounds) {
    const key = dayKey(round.submittedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  // Anchor on the Monday of the current week and step back, so the final
  // column is the week containing today. Anchoring on "12 weeks ago" instead
  // put today past the right-hand edge, and the grid rendered empty.
  const mondayThisWeek = shiftDays(now, -((now.getDay() + 6) % 7));
  const start = shiftDays(mondayThisWeek, -(HEATMAP_WEEKS - 1) * 7);

  const rows = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label, weekday) => {
    const cells: string[] = [];

    for (let week = 0; week < HEATMAP_WEEKS; week += 1) {
      const day = shiftDays(start, week * 7 + weekday);
      if (day > now) {
        cells.push(' ');
        continue;
      }
      const count = counts.get(dayKey(day)) ?? 0;
      cells.push(SHADES[Math.min(count, SHADES.length - 1)]!);
    }

    return `  ${label} ${cells.join(' ')}`;
  });

  return [...rows, '', `      ${HEATMAP_WEEKS} weeks    less ${SHADES.slice(1).join(' ')} more`];
}

const GREENFIELD: PhaseId[] = ['A', 'B', 'C', 'D', 'E', 'F'];
const ONBOARDING: PhaseId[] = ['OB-A', 'OB-B', 'OB-C', 'OB-D', 'OB-E', 'OB-F', 'OB-G'];

/**
 * Shows progress along whichever track this project is actually on.
 *
 * Chosen by which track has any approved phases rather than by asking: a
 * project that has never had a round yet has no track to report.
 */
export function renderProgress(phasesApproved: readonly PhaseId[]): string[] {
  const onboarding = phasesApproved.some((p) => p.startsWith('OB-'));
  const track = onboarding ? ONBOARDING : GREENFIELD;
  const done = new Set(phasesApproved);

  const marks = track.map((phase) => `${done.has(phase) ? '●' : '○'} ${phase}`).join('   ');
  return [`  ${onboarding ? 'onboarding' : 'greenfield'}:  ${marks}`];
}

function pad(label: string, value: string): string {
  return `  ${label.padEnd(18)}${value}`;
}

/**
 * Renders the studio.
 *
 * Deliberately reports effort and consistency separately from outcomes. Rounds
 * and active days say you turned up; approvals say the work landed. Collapsing
 * them into one score would make a day of hard revision look like a bad day.
 */
export function renderStudio(input: StudioInput): string[] {
  const stats = computeStats(input);

  if (stats.rounds === 0) {
    return [
      `DeepDive studio — ${input.projectDir}`,
      '',
      '  Nothing recorded yet. Submit something with "deepdive grade" and this',
      '  fills in: rounds, active days, streaks, and how far along you are.',
    ];
  }

  const hour = stats.peakHour === null ? '—' : `${((stats.peakHour + 11) % 12) + 1}${stats.peakHour < 12 ? 'am' : 'pm'}`;

  return [
    `DeepDive studio — ${input.projectDir}`,
    '',
    pad('Rounds', String(stats.rounds)),
    pad('Approved', `${stats.approved} of ${stats.rounds}`),
    pad('Active days', String(stats.activeDays)),
    pad('Current streak', `${stats.currentStreak}d`),
    pad('Longest streak', `${stats.longestStreak}d`),
    pad('Peak hour', hour),
    pad('Hints taken', String(stats.hintsTaken)),
    pad('Concepts mastered', `${stats.conceptsMastered} of ${stats.conceptsTracked}`),
    '',
    ...renderProgress(stats.phasesApproved),
    '',
    ...renderHeatmap(input.rounds, input.now),
  ];
}
