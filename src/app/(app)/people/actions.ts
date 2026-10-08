'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/session';
import { can } from '@/lib/auth/permissions';
import { recordAudit } from '@/lib/audit';
import { enqueueGeneration, findStalledPeople } from '@/lib/sheet/generation-jobs';

/** Start AI writing for everyone whose text was never written (see findStalledPeople). */
export async function resumeStalledGenerationAction(): Promise<{ ok: boolean; message: string }> {
  try {
    const user = await requireUser();
    if (!can(user, 'sheet.edit') || user.role === 'ENGINEER') {
      return { ok: false, message: 'この操作を行う権限がない' };
    }
    const stalled = await findStalledPeople();
    for (const p of stalled) {
      enqueueGeneration({ personId: p.personId, name: p.name, userId: user.id, onlyMissing: true });
    }
    await recordAudit({
      userId: user.id,
      action: 'sheet.field_generate',
      summary: `止まっていたAIの文章作成を再開した（${stalled.length}名）`,
    });
    revalidatePath('/people');
    return { ok: true, message: `${stalled.length}名の文章作成を開始しました` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : '失敗しました' };
  }
}
