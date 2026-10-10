'use client';

import { useState } from 'react';
import type { SectionView } from '@/lib/sheet/model';
import { SectionPanel } from './section-panel';
import { pinnedHeight } from './scroll-restore';
import { useLang, useT } from '@/lib/i18n/client';
import { pickName } from '@/lib/i18n';

/**
 * The editing screen's section switcher: a plain list of sections down the
 * left, the chosen section's form on the right. Only the chosen section is
 * mounted.
 *
 * Redesigned 2026-09-29: the earlier row of twelve differently-coloured tabs
 * read as noise. Each entry now carries the one thing an operator wants to
 * know about a section — how many of its fields still need a 確認 tick — or
 * a check mark when none do.
 *
 * The open section is kept in the URL (`?tab=`), so returning from the
 * preview — or pressing the browser's back button — reopens the same section.
 */

/** Fired when a section tab is chosen, with `{ section: code }`. */
export const SECTION_SHOWN_EVENT = 'sheet:section-shown';

export function SectionTabs({
  personId,
  sections,
  presetId,
  readOnly,
  editableSectionCodes,
  canSelectRecords,
  initialCode,
  fieldReplacements = {},
}: {
  personId: string;
  sections: SectionView[];
  presetId: string | null;
  readOnly: boolean;
  editableSectionCodes: string[] | null;
  canSelectRecords: boolean;
  /** Section to open first, from the `?tab=` query parameter. */
  initialCode?: string | null;
  /** Content shown in place of a field, keyed by field code. */
  fieldReplacements?: Record<string, React.ReactNode>;
}) {
  const t = useT();
  const lang = useLang();
  const [activeCode, setActiveCode] = useState(
    sections.some((s) => s.code === initialCode) ? initialCode! : (sections[0]?.code ?? null),
  );
  const active = sections.find((s) => s.code === activeCode) ?? sections[0] ?? null;

  if (sections.length === 0) return null;

  const select = (code: string) => {
    setActiveCode(code);
    // The side-by-side preview follows to the same section (split-preview.tsx).
    window.dispatchEvent(new CustomEvent(SECTION_SHOWN_EVENT, { detail: { section: code } }));
    // Record the section in the address without a navigation, so the preview
    // link and the back button both come back to it.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', code);
    window.history.replaceState(window.history.state, '', url);
    // A newly chosen section starts at its top, not wherever the previous one
    // had been scrolled to.
    requestAnimationFrame(() => {
      const panel = document.getElementById(`section-${code}`);
      if (panel && panel.getBoundingClientRect().top < pinnedHeight()) {
        panel.scrollIntoView({ block: 'start' });
      }
    });
  };

  return (
    <div className="editor-container">
      <div className="editor-layout">
        <div
          className="section-nav"
          role="tablist"
          aria-label={t('スキルシートの区分')}
          aria-orientation="vertical"
        >
          {sections.map((section) => {
            const todo = unreviewedIn(section);
            const hasValues = sectionHasValues(section);
            return (
              <button
                key={section.code}
                type="button"
                role="tab"
                id={`tab-${section.code}`}
                aria-selected={section.code === active?.code}
                aria-controls={`section-${section.code}`}
                className="section-nav-item"
                onClick={() => select(section.code)}
              >
                <span className="section-nav-label">{pickName(lang, section.nameJa, section.nameEn)}</span>
                {todo > 0 ? (
                  <span className="section-nav-count" title={t('未確認 {n}項目', { n: todo })}>
                    {todo}
                  </span>
                ) : hasValues ? (
                  <span
                    className="section-nav-done"
                    title={t('すべて確認済み')}
                    aria-label={t('すべて確認済み')}
                  >
                    ✓
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {active ? (
          <SectionPanel
            key={active.id}
            personId={personId}
            section={active}
            presetId={presetId}
            readOnly={readOnly}
            editableSectionCodes={editableSectionCodes}
            canSelectRecords={canSelectRecords}
            replacements={fieldReplacements}
          />
        ) : null}
      </div>
    </div>
  );
}

function sectionFields(section: SectionView) {
  return section.kind === 'REPEATING' ? section.records.flatMap((r) => r.fields) : section.fields;
}

/** Fields with a value that nobody has ticked 確認 on yet. */
function unreviewedIn(section: SectionView): number {
  return sectionFields(section).filter((f) => f.valueJa && !f.isReviewed).length;
}

function sectionHasValues(section: SectionView): boolean {
  return sectionFields(section).some((f) => f.valueJa);
}
