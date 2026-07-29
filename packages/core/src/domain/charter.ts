import { z } from 'zod';

export const AcceptedProjectCharterSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1),
  goal: z.string().min(1),
  techStack: z.array(z.string()),
  scopeBounds: z.array(z.string()),
  coreFeatures: z.array(z.string()),
  createdAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export type AcceptedProjectCharter = z.infer<typeof AcceptedProjectCharterSchema>;

export const RepoLearningCharterSchema = z.object({
  id: z.string().uuid(),
  repoName: z.string().min(1),
  repoUrl: z.string().url(),
  targetCommitSha: z.string().length(40),
  intent: z.enum(['learn', 'contribute', 'replicate']),
  tier: z.enum(['small', 'medium', 'large']),
  mvpScope: z.array(z.string()),
  createdAt: z.string().datetime(),
  version: z.number().int().positive(),
});
export type RepoLearningCharter = z.infer<typeof RepoLearningCharterSchema>;
