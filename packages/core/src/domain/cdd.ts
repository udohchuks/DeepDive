import { z } from 'zod';
import { CitationSchema } from './sdd.js';

export const CddSchema = z.object({
  id: z.string().uuid(),
  rsddId: z.string().uuid(),
  issueId: z.string().min(1),
  issueTitle: z.string().min(1),
  proposedFix: z.string().min(1),
  targetFiles: z.array(CitationSchema),
  characterizationTestPath: z.string().min(1),
  version: z.number().int().positive(),
});
export type CDD = z.infer<typeof CddSchema>;
