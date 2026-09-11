/**
 * The in-process scheduler. A single interval sweeps for suspended runs whose
 * delay has elapsed (WorkflowRun.status = WAITING, resumeAt <= now) and resumes
 * each. This is the self-host durability story: delays survive restarts because
 * the wait lives in Postgres, not in a timer, and any Node process that boots
 * picks up due runs on its next tick.
 *
 * The sweep reads run ids across all tenants on the base (RLS-bypassing)
 * connection — a system-level operation by design — then resumes each run inside
 * its own org via withOrg, where RLS applies again.
 *
 * Not yet swept here: schedule/relative triggers. Those fire over *sets* of
 * records (all inactive contacts, all companies without a USt-IdNr.) and need a
 * record-set execution model the action executors don't have yet — a deliberate
 * next increment, not faked.
 */
import "server-only";
import { prisma } from "@kundeo/db";
import { resumeRun } from "./runner";

const TICK_MS = 60_000;
const FIRST_TICK_MS = 10_000;
const BATCH = 50;

/** Resume every suspended run whose delay is due. Returns how many ran. */
export async function drainDueRuns(now: Date = new Date()): Promise<number> {
  const due = await prisma.workflowRun.findMany({
    where: { status: "WAITING", resumeAt: { lte: now } },
    select: { id: true, organizationId: true },
    orderBy: { resumeAt: "asc" },
    take: BATCH,
  });
  let ran = 0;
  for (const run of due) {
    try {
      await resumeRun(run.organizationId, run.id);
      ran++;
    } catch (err) {
      console.error(`[automations] resume failed run=${run.id}`, err);
    }
  }
  return ran;
}

/**
 * Start the interval once per process. Guarded on a global so Next's dev HMR and
 * repeated instrumentation loads don't stack multiple tickers. The timers are
 * unref'd so they never hold the process open on shutdown.
 */
export function startTicker(): void {
  const g = globalThis as unknown as { __kundeoAutomationTicker?: boolean };
  if (g.__kundeoAutomationTicker) return;
  g.__kundeoAutomationTicker = true;

  const tick = () => {
    void drainDueRuns().catch((err) => console.error("[automations] ticker error", err));
  };
  const interval = setInterval(tick, TICK_MS);
  if (typeof interval.unref === "function") interval.unref();
  const first = setTimeout(tick, FIRST_TICK_MS);
  if (typeof first.unref === "function") first.unref();
}
