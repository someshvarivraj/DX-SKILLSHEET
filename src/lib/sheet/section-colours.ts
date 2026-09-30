/**
 * Section band colours on the printed sheet.
 *
 * Sano-san's review (2026-09-30): adding a section sometimes gave it the same
 * colour as another, so sections could not be told apart by colour. Each
 * section now has a colour from this palette — chosen on the field-definition
 * screen, or automatic:
 *
 *  - automatic keeps a section's traditional colour (TRADITIONAL below, the
 *    colours the sheet has always used), unless an earlier section already
 *    has it;
 *  - otherwise, and for any new section, it takes the first palette colour no
 *    other section is using. A new section's automatic colour is saved when
 *    the section is created, so it does not shift later.
 *
 * Muted, low-saturation tones on purpose: the sheet is printed on A4 and
 * photocopied. Every accent carries white text at >= 4.5:1 (WCAG AA).
 */

export type SectionColour = { key: string; nameJa: string; nameEn: string; accent: string; tint: string };

export const SECTION_PALETTE: SectionColour[] = [
  { key: 'navy', nameJa: '紺', nameEn: 'Navy', accent: '#3D5A8A', tint: '#EAEFF7' },
  { key: 'teal', nameJa: '青緑', nameEn: 'Teal', accent: '#2E6F66', tint: '#E5F0EE' },
  { key: 'blue', nameJa: '青', nameEn: 'Blue', accent: '#2F6BA8', tint: '#E5EFF9' },
  { key: 'rose', nameJa: 'ローズ', nameEn: 'Rose', accent: '#9E4468', tint: '#F8E9F0' },
  { key: 'green', nameJa: '緑', nameEn: 'Green', accent: '#3E7A52', tint: '#E8F3EB' },
  { key: 'violet', nameJa: '紫', nameEn: 'Violet', accent: '#67589B', tint: '#EDEBF7' },
  { key: 'forest', nameJa: '深緑', nameEn: 'Forest', accent: '#2F6B45', tint: '#E4F0E8' },
  { key: 'red', nameJa: '赤', nameEn: 'Red', accent: '#A94F46', tint: '#F9ECEA' },
  { key: 'steel', nameJa: '鋼青', nameEn: 'Steel blue', accent: '#46688C', tint: '#E9F0F6' },
  { key: 'amber', nameJa: '琥珀', nameEn: 'Amber', accent: '#A0662C', tint: '#F7EFE4' },
  { key: 'slate', nameJa: '青灰', nameEn: 'Slate', accent: '#4E6A7A', tint: '#EBF0F3' },
  { key: 'olive', nameJa: 'オリーブ', nameEn: 'Olive', accent: '#6B7A3E', tint: '#F0F3E6' },
  { key: 'plum', nameJa: '梅紫', nameEn: 'Plum', accent: '#7A4A7E', tint: '#F3EAF4' },
  { key: 'cyan', nameJa: '浅葱', nameEn: 'Cyan', accent: '#2C7285', tint: '#E4F1F4' },
  { key: 'brown', nameJa: '茶', nameEn: 'Brown', accent: '#7A5A3E', tint: '#F3EDE6' },
  { key: 'grey', nameJa: '灰', nameEn: 'Grey', accent: '#5C6472', tint: '#EDEFF2' },
];

const BY_KEY = new Map(SECTION_PALETTE.map((c) => [c.key, c]));

/** The colours the seeded sections have always had, by section code. */
const TRADITIONAL: Record<string, string> = {
  personal: 'navy',
  aspirations: 'teal',
  education: 'blue',
  skills: 'rose',
  internships: 'green',
  projects: 'violet',
  work_japan: 'forest',
  japanese_ability: 'red',
  research: 'steel',
  interests: 'amber',
  japanese_companies: 'amber',
  career_development: 'teal',
  placement: 'slate',
  leadership: 'olive',
  other: 'grey',
};

export function paletteColour(key: string | null | undefined): SectionColour | undefined {
  return key ? BY_KEY.get(key) : undefined;
}

export function isPaletteKey(key: unknown): key is string {
  return typeof key === 'string' && BY_KEY.has(key);
}

/**
 * The colour of every section, in order.
 *
 * 1. A chosen colour is kept.
 * 2. Every section whose traditional colour is still free keeps it — decided
 *    over the whole list first, so resolving a clash further up never takes
 *    the colour a later section has always had.
 * 3. The rest (a clash, or a section with no traditional colour) take the
 *    first palette colour nobody uses — or, with all sixteen in use, the
 *    first one that differs from the section before it.
 */
export function resolveSectionColours(
  sections: Array<{ code: string; colour: string | null; order?: number }>,
): Map<string, SectionColour> {
  const ordered = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const chosen = new Map<string, string>();
  const used = new Set<string>();

  for (const s of ordered) {
    if (isPaletteKey(s.colour)) {
      chosen.set(s.code, s.colour);
      used.add(s.colour);
    }
  }
  for (const s of ordered) {
    const traditional = TRADITIONAL[s.code];
    if (!chosen.has(s.code) && traditional && !used.has(traditional)) {
      chosen.set(s.code, traditional);
      used.add(traditional);
    }
  }

  const result = new Map<string, SectionColour>();
  let previous: string | null = null;
  for (const s of ordered) {
    let key = chosen.get(s.code);
    if (!key) {
      key =
        SECTION_PALETTE.find((c) => !used.has(c.key))?.key ??
        SECTION_PALETTE.find((c) => c.key !== previous)!.key;
      used.add(key);
    }
    previous = key;
    result.set(s.code, BY_KEY.get(key)!);
  }
  return result;
}

/** The automatic colour a new section would get next to these. */
export function nextSectionColour(
  existing: Array<{ code: string; colour: string | null; order?: number }>,
): string {
  const used = new Set([...resolveSectionColours(existing).values()].map((c) => c.key));
  return (SECTION_PALETTE.find((c) => !used.has(c.key)) ?? SECTION_PALETTE[0]!).key;
}

/** CSS variables for a section's band, for an inline `style`. */
export function sectionColourStyle(colour: SectionColour | undefined): React.CSSProperties | undefined {
  if (!colour) return undefined;
  return { ['--accent' as string]: colour.accent, ['--accent-tint' as string]: colour.tint };
}
