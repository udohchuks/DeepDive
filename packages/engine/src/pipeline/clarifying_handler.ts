import { RoundRecord } from '@deepdive/storage';

export interface ClarifyingQuestionAnswer {
  questionId: string;
  answerText: string;
}

export function handleClarifyingResponse(
  lastRound: RoundRecord,
  _answers: ClarifyingQuestionAnswer[],
): RoundRecord {
  if (lastRound.status !== 'clarifying_question') {
    throw new Error(`Cannot answer clarifying questions on round with status "${lastRound.status}"`);
  }

  return {
    ...lastRound,
    status: 'revise', // Transition back to review round evaluation after clarification
  };
}
