'use client';

import { useState } from 'react';
import type { SectionView } from '@/lib/sheet/model';
import { SECTION_COLOURS } from '@/components/sheet-document';
import { SectionPanel } from './section-panel';

/**
 * Tabbed section switcher for the editing screen.
 *
 * Sano-san's review (2026-09-22, item 3): "Please consider putting the main
 * sections along the top of the editing screen as tabs... so that pressing a
 * tab expands only that section. At present every field is stacked
 * vertically, so reaching the one you want takes time."
 *
 * One tab per section, in the order the section definitions already specify.
 * Only the active section's panel is mounted, which also answers item 5 (the
 * supplementary-document section gets its own clearly marked tab rather than
 * being one more thing to scroll past).
 */
export function SectionTabs({
  personId,
  sections,
  presetId,
  readOnly,
  editableSectionCodes,
  canSelectRecords,
}: {
  personId: string;
  sections: SectionView[];
  presetId: string | null;
  readOnly: boolean;
  editableSectionCodes: string[] | null;
  canSelectRecords: boolean;
}) {
  const [activeCode, setActiveCode] = useState(sections[0]?.code ?? null);
  const active = sections.find((s) => s.code === activeCode) ?? sections[0] ?? null;

  if (sections.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="tab-bar" role="tablist" aria-label="スキルシートの区分">
        {sections.map((section) => {
          const colour = SECTION_COLOURS[section.code] ?? {
            accent: '#044BA7',
            tint: '#EEF4FD',
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
              onClick={() => setActiveCode(section.code)}
            >
              {section.nameJa}
              {section.document === 'SUPPLEMENT' ? (
                <span
                  className="tab-badge"
                  title="この区分はスキルシートには出力されず、補足資料にのみ出力される。"
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
        />
      ) : null}
    </div>
  );
}
