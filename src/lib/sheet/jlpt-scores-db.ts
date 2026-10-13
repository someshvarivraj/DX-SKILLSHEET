/** Reading and writing the JLPT scores entered on the editing screen (jlpt-scores.ts). */

import { prisma } from '@/lib/db';
import { selectPrimaryResult, type JlptLevel, type JlptScores } from '@/lib/rules/jlpt';
import type { StoredScores } from './jlpt-scores';

/** The result the sheet describes, as the editing screen shows it. */
export async function loadPrimaryScores(personId: string): Promise<StoredScores | null> {
  const results = await prisma.jlptResult.findMany({ where: { personId } });
  const primary = selectPrimaryResult(results.map((r) => ({ ...r, level: r.level as JlptLevel })));
  if (!primary) return null;
  return {
    level: primary.level,
    languageKnowledge: primary.languageKnowledge,
    reading: primary.reading,
    languageAndReading: primary.languageAndReading,
    listening: primary.listening,
    total: primary.total,
  };
}

/**
 * Write the scores onto the result the sheet describes. A person with no
 * result yet gets one with an unknown exam date (0 / 0, as the importer stores
 * a level given without a date).
 */
export async function saveJlptScores(personId: string, scores: StoredScores) {
  const results = await prisma.jlptResult.findMany({ where: { personId } });
  const primary = selectPrimaryResult<JlptScores & { id: string }>(
    results.map((r) => ({ ...r, level: r.level as JlptLevel })),
  );
  const data = {
    level: scores.level,
    languageKnowledge: scores.languageKnowledge,
    reading: scores.reading,
    languageAndReading: scores.languageAndReading,
    listening: scores.listening,
    total: scores.total,
  };
  if (primary) {
    await prisma.jlptResult.update({ where: { id: primary.id }, data });
  } else {
    await prisma.jlptResult.create({ data: { personId, examYear: 0, examMonth: 0, ...data } });
  }
}
