import { z } from 'zod';

/**
 * Both learning modes are supported. Greenfield and onboarding are the two
 * halves of the product (project.md §1) and each has its own MVP vertical
 * slice, so neither may be rejected here.
 */
export const AllowedModes = ['greenfield', 'onboarding'] as const;
export type AllowedMode = (typeof AllowedModes)[number];

export const ProjectConfigV1Schema = z.object({
  version: z.literal(1),
  projectId: z.string().uuid(),
  mode: z.enum(AllowedModes, {
    errorMap: () => ({ message: "Invalid mode: must be 'greenfield' or 'onboarding'." }),
  }),
});

export type ProjectConfigV1 = z.infer<typeof ProjectConfigV1Schema>;

/**
 * Validates a raw project config.
 *
 * Throws a ZodError listing every invalid field — never a bare Error, so
 * callers can rely on `instanceof ZodError` and on `.issues`.
 */
export function validateConfigV1(rawConfig: unknown): ProjectConfigV1 {
  return ProjectConfigV1Schema.parse(rawConfig);
}
