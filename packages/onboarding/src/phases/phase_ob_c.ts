import { ReadingPlan, ReadingPlanSchema, checkReadingOrder } from '@deepdive/core';

/**
 * Validates a reading plan and its ordering.
 *
 * This used to be `Boolean(payload.readingPlan && Array.isArray(...))`, which
 * accepted any array of anything — including a plan whose units read a caller
 * before the thing it calls, the one thing OB-C exists to check.
 */
export function validatePhaseObCArtifact(payload: unknown): ReadingPlan {
  const plan = ReadingPlanSchema.parse(payload);

  const order = checkReadingOrder(plan.readingPlan);
  if (!order.ordered) {
    throw new Error(`Reading plan is not topologically ordered: ${order.problems.join('; ')}`);
  }

  return plan;
}
