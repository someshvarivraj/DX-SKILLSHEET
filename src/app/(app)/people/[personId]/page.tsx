import { notFound } from 'next/navigation';
import { requireUser } from '@/lib/auth/session';
import { can, canAccessPerson, ENGINEER_EDITABLE_SECTIONS } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import { loadSheetModel } from '@/lib/sheet/model';
import { getOrCreateSkillSheet } from '@/lib/sheet/version';
import { SectionTabs } from '@/components/editor/section-tabs';
import { SheetToolbar } from '@/components/editor/sheet-toolbar';
import { MemoPanel } from '@/components/editor/memo-panel';
import { PhotoPanel } from '@/components/editor/photo-panel';
import { ScrollRestore } from '@/components/editor/scroll-restore';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The field definition that stands for the photo. Its value is never used —
 * the photo itself is a file — so on the editing screen the uploader is shown
 * in its place, inside 個人情報, wherever the definition puts it.
 */
const PHOTO_FIELD = 'photo';

export default async function PersonEditorPage({
  params,
  searchParams,
}: {
  params: Promise<{ personId: string }>;
  searchParams: Promise<{ preset?: string; tab?: string }>;
}) {
  const { personId } = await params;
  const { preset, tab } = await searchParams;
  const user = await requireUser();

  if (!canAccessPerson(user, personId)) notFound();

  await getOrCreateSkillSheet(personId);
  const model = await loadSheetModel(personId, { presetId: preset ?? null });
  if (!model) notFound();

  await recordAudit({
    userId: user.id,
    action: 'sheet.view',
    personId,
    entityType: 'SkillSheet',
    entityId: model.skillSheetId,
  });

  // The supplementary document is internal, so the person it describes never
  // sees it — an engineer viewing their own sheet gets no memo panel.
  const showSupplement = user.role !== 'ENGINEER' && can(user, 'sheet.edit');
  const memos = showSupplement
    ? await prisma.personMemo.findMany({
        where: { personId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { createdBy: { select: { displayName: true } } },
      })
    : [];

  // The supplement's sections carry placement notes and remarks that the export
  // endpoint explicitly refuses to show an engineer. They must not be readable
  // on the editor screen either, which is reachable from the engineer's own
  // sheet, so they are filtered out rather than merely badged.
  const editorSections = showSupplement
    ? model.sections
    : model.sections.filter((section) => section.document !== 'SUPPLEMENT');

  const readOnly = !can(user, 'sheet.edit') && !can(user, 'sheet.editOwnExperience');

  const photo = (
    <PhotoPanel
      personId={personId}
      photoUrl={
        model.person.photoKey
          ? `/api/files/${encodeURIComponent(model.person.photoKey)}`
          : null
      }
      readOnly={!can(user, 'sheet.edit')}
    />
  );
  const editableSectionCodes =
    user.role === 'ENGINEER' ? [...ENGINEER_EDITABLE_SECTIONS] : null;

  return (
    <div className="space-y-4">
      <ScrollRestore personId={personId} />
      <SheetToolbar
        model={model}
        canFinalise={can(user, 'sheet.finalise')}
        canExport={can(user, 'sheet.export')}
        canSubmit={user.role === 'ENGINEER'}
        canExportSupplement={showSupplement && can(user, 'sheet.export')}
      />

      {/* Sano-san's review (2026-09-23, item 7): the tabs come first, and the
          photo sits inside 個人情報 rather than as a section of its own above
          the tabs. */}
      <SectionTabs
        personId={personId}
        sections={editorSections}
        presetId={model.preset?.id ?? null}
        readOnly={readOnly}
        editableSectionCodes={editableSectionCodes}
        canSelectRecords={can(user, 'sheet.selectRecords')}
        initialCode={tab ?? null}
        fieldReplacements={{ [PHOTO_FIELD]: photo }}
      />

      {editorSections.some((s) => s.fields.some((f) => f.code === PHOTO_FIELD)) ? null : (
        // Only if the プロフィール写真 definition has been removed or switched
        // off: the photo still needs somewhere to be managed.
        <div className="card overflow-hidden">{photo}</div>
      )}

      {showSupplement ? (
        <MemoPanel
          personId={personId}
          memos={memos.map((m) => ({
            id: m.id,
            body: m.body,
            createdAt: m.createdAt.toISOString(),
            authorName: m.createdBy?.displayName ?? null,
          }))}
        />
      ) : null}
    </div>
  );
}
