import { z } from 'zod';

export const CitationSchema = z.object({
  filePath: z.string().min(1),
  lineStart: z.number().int().positive().optional(),
  lineEnd: z.number().int().positive().optional(),
});
export type Citation = z.infer<typeof CitationSchema>;

export const ModuleSpecSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().min(1),
  dependencies: z.array(z.string()),
  citations: z.array(CitationSchema).optional(),
});
export type ModuleSpec = z.infer<typeof ModuleSpecSchema>;

export const SddSchema = z.object({
  id: z.string().uuid(),
  charterId: z.string().uuid(),
  title: z.string().min(1),
  overview: z.string().min(1),
  modules: z.array(ModuleSpecSchema),
  dataFlows: z.array(z.string()),
  version: z.number().int().positive(),
});
export type SDD = z.infer<typeof SddSchema>;

export const RsddLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7']);
export type RsddLevel = z.infer<typeof RsddLevelSchema>;

export const RsddSchema = z.object({
  id: z.string().uuid(),
  charterId: z.string().uuid(),
  repoName: z.string().min(1),
  targetCommitSha: z.string().length(40),
  level: RsddLevelSchema,
  modules: z.array(ModuleSpecSchema),
  architectureSummary: z.string().min(1),
  version: z.number().int().positive(),
});
export type RSDD = z.infer<typeof RsddSchema>;
