/**
 * Which buttons a field offers on the editing screen, decided by its
 * processing type in the field definition.
 *
 * Sano-san's review (2026-09-23, item 8): age and gender carried
 * 「再生成」「原文を表示」 even though nothing about them is generated. What an
 * operator can usefully do differs by field, so the buttons follow the
 * definition's 処理 setting:
 *
 *   手入力・転記・規則生成・補完 → 保存、履歴
 *   辞書・翻訳                   → 保存、再生成、原文を表示、履歴
 *   生成（AI）                   → 保存、再生成、指示して再生成、原文を表示、履歴
 *
 * 補完 (ENRICH) is listed with the rule-based group because it runs the same
 * deterministic rule code and involves no AI — pressing 再生成 would only
 * reproduce the same value.
 *
 * 保存 and 履歴 are always available and are not part of this decision.
 */
export type FieldActions = {
  regenerate: boolean;
  regenerateWithInstructions: boolean;
  showOriginal: boolean;
  /**
   * 「日本語に翻訳する」: a copied field that came out as English prose (a
   * free-text answer on a field set to 転記). Sano-san, 2026-10-11: such a
   * field had no way to be put into Japanese.
   */
  translate: boolean;
};

const NONE: FieldActions = {
  regenerate: false,
  regenerateWithInstructions: false,
  showOriginal: false,
  translate: false,
};

/** English prose rather than a name or code: several Latin words, no Japanese. */
export function looksEnglish(value: string | null | undefined): boolean {
  // Links are not prose: a GitHub URL is not "English text to translate".
  const v = (value ?? '').replace(/https?:\/\/\S+/g, ' ').trim();
  if (!v || /[\u3040-\u30ff\u3400-\u9fff]/.test(v)) return false;
  return (v.match(/[A-Za-z]{2,}/g) ?? []).length >= 4;
}

export function fieldActions(processing: string, valueType?: string, valueJa?: string | null): FieldActions {
  if ((processing === 'COPY' || processing === 'MANUAL') && valueType !== 'GRID' && looksEnglish(valueJa)) {
    return { ...NONE, showOriginal: processing === 'COPY', translate: true };
  }
  // Structured grids (e.g. the placement preference grids) are copied as they
  // were answered, whatever the definition says.
  if (valueType === 'GRID') return NONE;

  switch (processing) {
    case 'GLOSSARY':
    case 'TRANSLATE':
      return { regenerate: true, regenerateWithInstructions: false, showOriginal: true, translate: false };
    case 'GENERATE':
      return { regenerate: true, regenerateWithInstructions: true, showOriginal: true, translate: false };
    case 'MANUAL':
    case 'COPY':
    case 'RULE_BASED':
    case 'ENRICH':
    default:
      return NONE;
  }
}
