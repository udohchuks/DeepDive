import { RSDD, RsddSchema, Vcs } from '@deepdive/core';

export async function validateAndVerifyPhaseObBArtifact(
  payload: unknown,
  workspacePath: string,
  vcs: Vcs,
): Promise<{ rsdd: RSDD; citationsValid: boolean }> {
  const rsdd = RsddSchema.parse(payload);

  let citationsValid = true;
  for (const mod of rsdd.modules) {
    if (mod.citations) {
      for (const cit of mod.citations) {
        const fileExists = await vcs.fileExistsAtCommit(workspacePath, rsdd.targetCommitSha, cit.filePath);
        if (!fileExists) {
          citationsValid = false;
          break;
        }
      }
    }
  }

  return { rsdd, citationsValid };
}
