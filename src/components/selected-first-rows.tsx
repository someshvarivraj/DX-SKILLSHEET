'use client';

import { Children, isValidElement, useEffect, useState } from 'react';

/**
 * The people table's rows with the ticked ones gathered at the top, so the
 * people chosen for a PDF download sit together instead of scattered through
 * the list (Sano-san, 2026-10-13). Each row keeps its place within its group.
 *
 * The checkboxes belong to the bulk-PDF form (bulk-pdf-bar.tsx); their state is
 * read from the page, so the rows themselves stay server-rendered.
 */
export function SelectedFirstRows({ form, children }: { form: string; children: React.ReactNode }) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const update = () =>
      setSelected(
        new Set(
          Array.from(document.querySelectorAll<HTMLInputElement>(`input[form="${form}"][name="id"]`))
            .filter((b) => b.checked)
            .map((b) => b.value),
        ),
      );
    // 「確定済みをすべて選択」 sets the boxes without a change event, so the
    // bar announces it with one (bulk-pdf-bar.tsx).
    document.addEventListener('change', update);
    update();
    return () => document.removeEventListener('change', update);
  }, [form]);

  const rows = Children.toArray(children);
  const isSelected = (row: React.ReactNode) =>
    isValidElement(row) && typeof row.key === 'string' && selected.has(row.key.replace(/^\.\$/, ''));
  // One list, so React moves a row (keeping its ticked box) rather than
  // rebuilding it in another list.
  return <>{[...rows.filter(isSelected), ...rows.filter((row) => !isSelected(row))]}</>;
}
