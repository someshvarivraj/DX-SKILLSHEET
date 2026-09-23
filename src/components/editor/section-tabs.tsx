'use client';

import { useRef, useState } from 'react';
import type { SectionView } from '@/lib/sheet/model';
import { SECTION_COLOURS } from '@/components/sheet-document';
import { SectionPanel } from './section-panel';
import { pinnedHeight } from './scroll-restore';

/**
 * Tabbed section switcher for the editing screen.
 *
 * Sano-san's review (2026-09-22, item 3): put the main sections along the top
 * as tabs so that pressing one expands only that section. One tab per
 * section, in the order the section definitions specify; only the active
 * section's panel is mounted.
 *
 * Review of 2026-09-23:
 *  - item 7: the tabs now come first, directly under the toolbar, and the
 *    photo is part of 個人情報 (passed in as `fieldReplacements`, shown where
 *    the プロフィール写真 field is defined) instead of a section of its own
 *    above the tabs;
 *  - item 5: the open tab is kept in the URL (`?tab=`), so returning from the
 *    preview — or pressing the browser's back button — reopens the same
 *    section instead of always the first one.
 */
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
  /** Tab to open first, from the `?tab=` query parameter. */
  initialCode?: string | null;
  /** Content shown in place of a field, keyed by field code. */
  fieldReplacements?: Record<string, React.ReactNode>;
}) {
  const [activeCode, setActiveCode] = useState(
    sections.some((s) => s.code === initialCode) ? initialCode! : (sections[0]?.code ?? null),
  );
  const barRef = useRef<HTMLDivElement>(null);
  const active = sections.find((s) => s.code === activeCode) ?? sections[0] ?? null;

  if (sections.length === 0) return null;

  const select = (code: string) => {
    setActiveCode(code);
    // Record the tab in the address without a navigation, so the preview link
    // and the back button both come back to it.
    const url = new URL(window.location.href);
    url.searchParams.set('tab', code);
    window.history.replaceState(window.history.state, '', url);
    // Having scrolled down a long section, a newly chosen one should start at
    // its top rather than somewhere in its middle: bring the tab bar back to
    // just under the pinned toolbar.
    requestAnimationFrame(() => {
      const bar = barRef.current;
      if (!bar) return;
      const pinned = pinnedHeight();
      const top = bar.getBoundingClientRect().top;
      if (top < pinned) window.scrollBy({ top: top - pinned - 8, behavior: 'auto' });
    });
  };

  return (
    <div className="space-y-3">
      <div ref={barRef} className="tab-bar" role="tablist" aria-label="スキルシートの区分">
        {sections.map((section) => {
          const colour = SECTION_COLOURS[section.code] ?? {
            accent: '#0879B6',
            tint: '#EAF6FC',
          };
          const isActive = section.code === active?.code;
          return (
            <button
              key={section.code}
              type="button"
              role="tab"
              id={`tab-${section.code}`}
              aria-selected={isActive}
              aria-controls={`section-${section.code}`}
              className={`tab-button ${isActive ? 'tab-button-active' : ''}`}
              style={
                {
                  '--tab-accent': colour.accent,
                  '--tab-tint': colour.tint,
                } as React.CSSProperties
              }
              onClick={() => select(section.code)}
            >
              {section.nameJa}
              {section.document === 'SUPPLEMENT' ? (
                <span
                  className="tab-badge"
                  title="この区分はスキルシートには出力されず、補足資料にのみ出力されます。"
                >
                  補足資料のみ
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
  );
}
