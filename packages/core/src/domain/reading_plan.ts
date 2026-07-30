import { z } from 'zod';
import { CitationSchema } from './sdd.js';

/**
 * One unit of reading: a slice of the repository the student will work through,
 * with the units it depends on.
 *
 * `dependsOn` is what makes phase OB-C gradeable without a model. The phase's
 * exit criterion is "reading units topologically ordered", which is a fact
 * about the graph, not a judgement — so a plan that reads a caller before the
 * thing it calls is rejected deterministically.
 */
export const ReadingUnitSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  /** What the student expects to be able to explain after reading this unit. */
  question: z.string().min(1),
  dependsOn: z.array(z.string()),
  citations: z.array(CitationSchema).min(1),
});
export type ReadingUnit = z.infer<typeof ReadingUnitSchema>;

export const ReadingPlanSchema = z.object({
  rsddId: z.string().min(1),
  targetCommitSha: z.string().length(40),
  readingPlan: z.array(ReadingUnitSchema).min(1),
});
export type ReadingPlan = z.infer<typeof ReadingPlanSchema>;

export interface TopologicalCheck {
  ordered: boolean;
  /** Unit ids naming a dependency that appears later, or not at all. */
  problems: string[];
}

/**
 * Checks that every unit's dependencies appear strictly before it.
 *
 * Deliberately stricter than "the graph is acyclic": the plan is a reading
 * *order*, so a valid dependency listed further down the list is still wrong —
 * the student would read it too late. Unknown ids are reported rather than
 * ignored, since a typo would otherwise silently weaken the check.
 */
export function checkReadingOrder(units: readonly ReadingUnit[]): TopologicalCheck {
  const seen = new Set<string>();
  const known = new Set(units.map((u) => u.id));
  const problems: string[] = [];

  for (const unit of units) {
    for (const dep of unit.dependsOn) {
      if (!known.has(dep)) {
        problems.push(`${unit.id} depends on "${dep}", which is not a unit in this plan`);
      } else if (!seen.has(dep)) {
        problems.push(`${unit.id} depends on "${dep}", which it is scheduled before`);
      }
    }
    seen.add(unit.id);
  }

  return { ordered: problems.length === 0, problems };
}
