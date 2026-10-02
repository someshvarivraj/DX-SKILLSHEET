'use server';

import { saveDraft, submitAnswers, type DraftAnswer } from '@/lib/items/candidate';

/**
 * The candidate's screen has no login: the token in the link is the only
 * credential, and it opens nothing but this one draft (see candidate.ts).
 */
export async function saveDraftAction(token: string, answers: DraftAnswer[]) {
  return saveDraft(token, answers);
}

export async function submitAnswersAction(token: string, answers: DraftAnswer[]) {
  return submitAnswers(token, answers);
}
