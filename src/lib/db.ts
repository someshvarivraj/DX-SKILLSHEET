import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * True when the failure is "the database is not reachable" rather than a real
 * query error. Used to show an actionable message instead of a stack trace —
 * during development this almost always means PostgreSQL has not been started.
 */
export function isDatabaseUnreachable(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const name = (error as { name?: string }).name ?? '';
  const message = (error as { message?: string }).message ?? '';
  return (
    name === 'PrismaClientInitializationError' ||
    message.includes("Can't reach database server") ||
    message.includes('ECONNREFUSED')
  );
}

export const DATABASE_UNREACHABLE_MESSAGE =
  'データベースに接続できません。PostgreSQLが起動しているか確認してください。' +
  '（開発環境では `npm run db:setup` を実行してください）';
