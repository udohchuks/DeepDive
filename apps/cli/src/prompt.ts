import { createInterface } from 'readline/promises';

/**
 * Asks one multiple-choice question and returns the chosen option's text.
 *
 * Returns null rather than throwing when there is no terminal, or when the
 * answer is not one of the offered numbers: an unanswered question is scored
 * wrong, which is the honest outcome, whereas guessing on the student's behalf
 * would put an answer in the record they never gave.
 */
export async function askMultipleChoice(
  question: string,
  options: readonly string[],
  out: (line: string) => void = (line) => process.stdout.write(`${line}\n`),
): Promise<string | null> {
  if (!process.stdin.isTTY) return null;

  out('');
  out(question);
  options.forEach((option, index) => out(`  ${index + 1}. ${option}`));

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`  your answer [1-${options.length}]: `);
    const index = Number.parseInt(answer.trim(), 10);
    if (!Number.isInteger(index) || index < 1 || index > options.length) return null;
    return options[index - 1]!;
  } catch {
    return null;
  } finally {
    rl.close();
  }
}
