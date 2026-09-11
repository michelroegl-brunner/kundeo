/**
 * Next.js instrumentation hook. Runs once when the server process starts. We use
 * it to start the automations ticker in the Node.js runtime only (never the Edge
 * runtime or at build time), so a single self-hosted process drives delayed and
 * resumed workflow runs with no external scheduler.
 *
 * Set KUNDEO_DISABLE_AUTOMATION_TICKER=1 to opt out (e.g. when running a
 * dedicated worker process, or in tests).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.KUNDEO_DISABLE_AUTOMATION_TICKER === "1") return;
  const { startTicker } = await import("./lib/automations/ticker");
  startTicker();
}
