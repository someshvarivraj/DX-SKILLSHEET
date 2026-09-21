/**
 * Glossary access.
 *
 * The lookup logic itself lives in ./glossary and has no database dependency,
 * so it can be unit tested on its own. This module only adds the loader.
 */

import { prisma } from '@/lib/db';
import { Glossary, type GlossaryRecord } from './glossary';

export { Glossary, normaliseTerm } from './glossary';
export type { GlossaryRecord } from './glossary';

export async function loadGlossary(): Promise<Glossary> {
  const entries = await prisma.glossaryEntry.findMany({
    where: { isActive: true },
    select: {
      id: true,
      category: true,
      english: true,
      aliases: true,
      japanese: true,
      gloss: true,
      region: true,
    },
  });
  return new Glossary(entries as GlossaryRecord[]);
}
