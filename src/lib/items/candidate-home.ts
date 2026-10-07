/**
 * What a candidate's own page (マイページ) shows: their questionnaire — to
 * answer for the first time, or to update when the team asks — and their
 * skill sheet once it has been finalised.
 */

import { prisma } from '@/lib/db';

export type CandidateHome = {
  name: string;
  /** An answer in progress through the app (first time or an update request). */
  questionnaire: {
    token: string;
    setName: string;
    deadline: Date | null;
    /** Open and before its deadline: the candidate can answer now. */
    open: boolean;
    deadlinePassed: boolean;
    /** Answers saved so far / questions in the set. */
    answered: number;
    total: number;
    /** They answered before, and the team asked them to update it. */
    isUpdate: boolean;
  } | null;
  lastSubmitted: { at: Date; setName: string } | null;
  sheet: {
    /** The latest version is finalised: the candidate may see it. */
    ready: boolean;
    finalisedAt: Date | null;
    /** A sheet has been finalised at least once (they may add new experience). */
    everFinal: boolean;
  };
};

export async function loadCandidateHome(personId: string): Promise<CandidateHome> {
  const person = await prisma.person.findUniqueOrThrow({ where: { id: personId } });

  const [draft, submitted, sheet] = await Promise.all([
    prisma.response.findFirst({
      where: { personId, status: 'DRAFT', source: 'APP', token: { not: null } },
      orderBy: { createdAt: 'desc' },
      include: { set: { include: { _count: { select: { items: true } } } }, answers: { select: { itemId: true } } },
    }),
    prisma.response.findFirst({
      where: { personId, status: 'SUBMITTED' },
      orderBy: { createdAt: 'desc' },
      include: { set: true },
    }),
    prisma.skillSheet.findUnique({
      where: { personId },
      include: { versions: { orderBy: { versionNo: 'desc' }, select: { status: true, finalisedAt: true } } },
    }),
  ]);

  const now = new Date();
  const latest = sheet?.versions[0];
  return {
    name: person.fullNameEnglish,
    questionnaire: draft
      ? {
          token: draft.token!,
          setName: draft.set.name,
          deadline: draft.set.deadline,
          deadlinePassed: Boolean(draft.set.deadline && draft.set.deadline < now),
          open: draft.set.status === 'OPEN' && !(draft.set.deadline && draft.set.deadline < now),
          answered: new Set(draft.answers.map((a) => a.itemId)).size,
          total: draft.set._count.items,
          isUpdate: Boolean(submitted),
        }
      : null,
    lastSubmitted: submitted
      ? { at: submitted.submittedAt ?? submitted.createdAt, setName: submitted.set.name }
      : null,
    sheet: {
      ready: latest?.status === 'FINAL',
      finalisedAt: latest?.status === 'FINAL' ? (latest.finalisedAt ?? null) : null,
      everFinal: Boolean(sheet?.versions.some((v) => v.status === 'FINAL')),
    },
  };
}
