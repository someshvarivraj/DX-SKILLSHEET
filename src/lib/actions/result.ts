/**
 * One shape for what a server action returns, and one place that catches.
 *
 * Next.js replaces an error thrown out of a server action with an opaque digest
 * in a production build, so a message written for the operator —
 * 「この項目はロックされている」 — never reaches them; they get a generic failure
 * or the error boundary. Actions therefore must not throw: they run their work
 * inside `runAction`, which turns a thrown error into a result the screen can
 * display.
 *
 * Only messages we wrote ourselves are shown. An unexpected error (a database
 * fault, a bug) is logged on the server and reported to the operator in general
 * terms, because its text is not written for them and may describe internals.
 */

import { OwnershipError } from '@/lib/auth/ownership';

export type ActionResult<T = unknown> = {
  ok: boolean;
  message?: string;
  /** Non-fatal notes worth showing beside a successful result. */
  warnings?: string[];
  data?: T;
};

/**
 * An error whose message is written for the operator and may be shown as-is.
 * Everything else is treated as unexpected.
 */
export class OperatorError extends Error {
  readonly warnings?: string[];
  constructor(message: string, warnings?: string[]) {
    super(message);
    this.name = 'OperatorError';
    this.warnings = warnings;
  }
}

/** Errors whose messages are safe to show. */
function isOperatorFacing(error: unknown): error is Error {
  return error instanceof OperatorError || error instanceof OwnershipError;
}

/**
 * Prisma's unique-constraint failure. Surfacing it as "already exists" is far
 * more useful than the raw error, which mentions table and column names.
 */
function uniqueConstraintMessage(error: unknown): string | null {
  const code = (error as { code?: string } | null)?.code;
  if (code !== 'P2002') return null;
  const target = (error as { meta?: { target?: string[] | string } }).meta?.target;
  const fields = Array.isArray(target) ? target.join('、') : target;
  return fields
    ? `同じ内容がすでに登録されている（${fields}）。既存の内容を確認すること。`
    : '同じ内容がすでに登録されている。既存の内容を確認すること。';
}

export async function runAction<T>(
  work: () => Promise<ActionResult<T>>,
): Promise<ActionResult<T>> {
  try {
    return await work();
  } catch (error) {
    if (isOperatorFacing(error)) {
      return {
        ok: false,
        message: error.message,
        warnings: error instanceof OperatorError ? error.warnings : undefined,
      };
    }

    const duplicate = uniqueConstraintMessage(error);
    if (duplicate) return { ok: false, message: duplicate };

    // eslint-disable-next-line no-console
    console.error('server action failed', error);
    return {
      ok: false,
      message:
        '処理中に問題が発生した。操作を取り消したので、もう一度試すこと。繰り返す場合は管理者に連絡すること。',
    };
  }
}
