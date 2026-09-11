import { NextResponse } from "next/server";
import { getSession, scoped } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Exports the active organization's CRM data as a JSON download. Tenant-scoped
 * (RLS), so only the caller's organization is ever included. */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const data = await scoped(async (db) => {
    const [companies, contacts, pipelines, deals, activities, tags] = await Promise.all([
      db.company.findMany(),
      db.contact.findMany({ include: { tags: true } }),
      db.pipeline.findMany({ include: { stages: true } }),
      db.deal.findMany(),
      db.activity.findMany(),
      db.tag.findMany(),
    ]);
    return { companies, contacts, pipelines, deals, activities, tags };
  });

  const body = JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2);
  const filename = `kundeo-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
