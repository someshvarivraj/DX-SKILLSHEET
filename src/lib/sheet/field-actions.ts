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
};

const NONE: FieldActions = {
  regenerate: false,
  regenerateWithInstructions: false,
  showOriginal: false,
};

export function fieldActions(processing: string, valueType?: string): FieldActions {
  // Structured grids (e.g. the placement preference grids) are copied as they
  // were answered, whatever the definition says.
  if (valueType === 'GRID') return NONE;

  switch (processing) {
    case 'GLOSSARY':
    case 'TRANSLATE':
      return { regenerate: true, regenerateWithInstructions: false, showOriginal: true };
    case 'GENERATE':
      return { regenerate: true, regenerateWithInstructions: true, showOriginal: true };
    case 'MANUAL':
    case 'COPY':
    case 'RULE_BASED':
    case 'ENRICH':
    default:
      return NONE;
  }
}
