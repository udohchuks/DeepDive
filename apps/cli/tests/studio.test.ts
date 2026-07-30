import { describe, it, expect } from 'vitest';
import { RoundSummary } from '../src/session_store.js';
import {
  computeStats,
  currentStreak,
  dayKey,
  longestStreak,
  renderHeatmap,
  renderProgress,
  renderStudio,
} from '../src/studio.js';

/** Local noon, so a timezone shift cannot move a fixture across a day boundary. */
function at(year: number, month: number, day: number, hour = 12): Date {
  return new Date(year, month - 1, day, hour, 0, 0);
}

function round(date: Date, phaseId = 'A', status = 'revise'): RoundSummary {
  return {
    roundNumber: 1,
    phaseId,
    status,
    submittedAt: date.toISOString(),
    roleId: 'grader',
    findings: [],
  };
}

const NOW = at(2026, 3, 15);

describe('streaks count days as lived', () => {
  const days = (...list: Date[]) => new Set(list.map((d) => dayKey(d)));

  it('counts consecutive days up to today', () => {
    expect(currentStreak(days(at(2026, 3, 13), at(2026, 3, 14), at(2026, 3, 15)), NOW)).toBe(3);
  });

  it('still counts a streak that ended yesterday', () => {
    // Otherwise the streak would read as broken every morning until the day's
    // first submission, which is exactly when it is most discouraging.
    expect(currentStreak(days(at(2026, 3, 13), at(2026, 3, 14)), NOW)).toBe(2);
  });

  it('is zero once a whole day has been missed', () => {
    expect(currentStreak(days(at(2026, 3, 12), at(2026, 3, 13)), NOW)).toBe(0);
  });

  it('does not join runs across a gap', () => {
    expect(
      longestStreak(days(at(2026, 3, 1), at(2026, 3, 2), at(2026, 3, 10), at(2026, 3, 11), at(2026, 3, 12))),
    ).toBe(3);
  });

  it('spans a month boundary', () => {
    expect(longestStreak(days(at(2026, 2, 28), at(2026, 3, 1), at(2026, 3, 2)))).toBe(3);
  });

  it('counts several rounds on one day as one active day', () => {
    const stats = computeStats({
      projectDir: '.',
      rounds: [round(at(2026, 3, 15, 9)), round(at(2026, 3, 15, 17))],
      mastery: [],
      hintsTaken: 0,
      now: NOW,
    });
    expect(stats).toMatchObject({ rounds: 2, activeDays: 1 });
  });
});

describe('effort and outcome are reported separately', () => {
  it('does not treat a rejected round as no work done', () => {
    // A day of hard revision must not look like a bad day: rounds say you
    // turned up, approvals say the work landed.
    const stats = computeStats({
      projectDir: '.',
      rounds: [round(NOW, 'A', 'revise'), round(NOW, 'A', 'revise'), round(NOW, 'A', 'approved')],
      mastery: [],
      hintsTaken: 4,
      now: NOW,
    });

    expect(stats.rounds).toBe(3);
    expect(stats.approved).toBe(1);
    expect(stats.activeDays).toBe(1);
    expect(stats.hintsTaken).toBe(4);
  });

  it('reports the busiest hour', () => {
    const stats = computeStats({
      projectDir: '.',
      rounds: [round(at(2026, 3, 15, 17)), round(at(2026, 3, 14, 17)), round(at(2026, 3, 13, 9))],
      mastery: [],
      hintsTaken: 0,
      now: NOW,
    });
    expect(stats.peakHour).toBe(17);
  });
});

describe('progress follows the track the project is actually on', () => {
  it('shows the onboarding track when onboarding phases are approved', () => {
    const line = renderProgress(['OB-A', 'OB-B']).join('');
    expect(line).toContain('onboarding');
    expect(line).toContain('● OB-A');
    expect(line).toContain('○ OB-D');
  });

  it('shows the greenfield track otherwise', () => {
    expect(renderProgress(['A']).join('')).toContain('greenfield');
  });
});

describe('the heatmap includes today', () => {
  it('marks the current day', () => {
    // Anchoring the window on "12 weeks ago" put today past the right-hand
    // edge and the whole grid rendered empty.
    const rows = renderHeatmap([round(NOW)], NOW);
    expect(rows.join('\n')).toContain('█');
  });

  it('leaves future days of the current week blank', () => {
    const monday = at(2026, 3, 9);
    const rows = renderHeatmap([round(monday)], monday);
    const sunday = rows.find((r) => r.startsWith('  Sun'))!;
    expect(sunday.trim()).toBe('Sun');
  });

  it('has one row per weekday', () => {
    const rows = renderHeatmap([], NOW);
    expect(rows.filter((r) => /^ {2}(Mon|Tue|Wed|Thu|Fri|Sat|Sun) /.test(r))).toHaveLength(7);
  });
});

describe('an empty project', () => {
  it('explains what will fill the studio rather than printing zeroes', () => {
    const lines = renderStudio({
      projectDir: '/p',
      rounds: [],
      mastery: [],
      hintsTaken: 0,
      now: NOW,
    }).join('\n');

    expect(lines).toContain('Nothing recorded yet');
    expect(lines).not.toContain('Longest streak');
  });
});
