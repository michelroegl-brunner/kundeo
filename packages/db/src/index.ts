import { PrismaClient, type Prisma } from "../generated/client/index.js";

export * from "../generated/client/index.js";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Base Prisma client (singleton). Uses a superuser-ish connection that is NOT
 * subject to Row-Level Security. Use `forOrg()` for all request-scoped,
 * tenant-owned queries so RLS policies are enforced.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Returns a Prisma client bound to a single organization for the duration of a
 * callback. It sets the `app.current_org_id` Postgres setting inside a
 * transaction, which the RLS policies read to filter every tenant-scoped table.
 *
 * All CRM reads/writes in request handlers should go through this so a missing
 * `where: { organizationId }` can never leak another tenant's data.
 */
export async function withOrg<T>(
  organizationId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `SELECT set_config('app.current_org_id', $1, true)`,
      organizationId,
    );
    return fn(tx);
  });
}
