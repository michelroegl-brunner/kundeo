import { PrismaClient, type Prisma } from "../generated/client/index.js";

// Seed connects as the owning role (DIRECT_URL) so it bypasses RLS and can
// create data across organizations. Never use the app role here.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

/**
 * Development seed: one demo organization with a default pipeline, a couple of
 * companies, contacts and deals so the UI has something to render.
 * Idempotent-ish: safe to re-run into a fresh dev database.
 */
async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { id: "org_demo", name: "Demo GmbH", slug: "demo" },
  });

  const pipeline = await prisma.pipeline.create({
    data: {
      organizationId: org.id,
      name: "Vertrieb",
      isDefault: true,
      stages: {
        create: [
          { name: "Lead", order: 0, probability: 10 },
          { name: "Qualifiziert", order: 1, probability: 30 },
          { name: "Angebot", order: 2, probability: 60 },
          { name: "Verhandlung", order: 3, probability: 80 },
        ],
      },
    },
    include: { stages: true },
  });

  const company = await prisma.company.create({
    data: {
      organizationId: org.id,
      name: "Muster AG",
      domain: "muster.de",
      city: "München",
      country: "DE",
      vatId: "DE123456789",
    },
  });

  const contact = await prisma.contact.create({
    data: {
      organizationId: org.id,
      salutation: "Herr",
      title: "Dr.",
      firstName: "Max",
      lastName: "Mustermann",
      email: "max@muster.de",
      companyId: company.id,
    },
  });

  const deal = await prisma.deal.create({
    data: {
      organizationId: org.id,
      title: "Jahreslizenz Muster AG",
      amountCents: 1_200_000,
      currency: "EUR",
      pipelineId: pipeline.id,
      stageId: pipeline.stages[2]!.id,
      companyId: company.id,
      contactId: contact.id,
    },
  });

  // Three demo owners for the automations kit (display/ownership only — no
  // Better Auth Account, so they cannot sign in). createdBy has no FK.
  const owners = [
    { id: "user_demo_anna", name: "Anna Weber", email: "anna@demo.kundeo.local", role: "owner" },
    { id: "user_demo_jan", name: "Jan Hofer", email: "jan@demo.kundeo.local", role: "member" },
    { id: "user_demo_lena", name: "Lena Baumgartner", email: "lena@demo.kundeo.local", role: "member" },
  ];
  for (const o of owners) {
    await prisma.user.upsert({
      where: { id: o.id },
      update: {},
      create: { id: o.id, name: o.name, email: o.email, emailVerified: true },
    });
    await prisma.member.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: o.id } },
      update: {},
      create: { id: `mem_${o.id}`, organizationId: org.id, userId: o.id, role: o.role },
    });
  }

  await seedAutomations(prisma, org.id, deal.id, owners.map((o) => o.id));

  // Default Mahnwesen ladder: 3 Stufen, no Inkasso step. Zahlungserinnerung is
  // fee- and interest-free; the two Mahnungen add a small Mahngebühr and the
  // Austrian B2B statutory default of 9,2 % p.a. Verzugszinsen (920 bps).
  await prisma.dunningPolicy.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      graceDays: 3,
      intervalDays: 7,
      levels: {
        create: [
          { level: 1, label: "Zahlungserinnerung", feeCents: 0, interestBps: 0 },
          { level: 2, label: "1. Mahnung", feeCents: 500, interestBps: 920 },
          { level: 3, label: "2. Mahnung", feeCents: 1000, interestBps: 920 },
        ],
      },
    },
  });

  console.log(`Seeded organization "${org.name}" (${org.slug}).`);
}

type SeedKind = "TRIGGER" | "ACTION" | "DELAY" | "BRANCH" | "FILTER";
interface SeedStep {
  kind: SeedKind;
  type: string;
  config?: Prisma.InputJsonValue;
  branch?: { yes: SeedStep[]; no: SeedStep[] };
}
type RunStatus = "OK" | "ERROR" | "SKIPPED" | "TEST";
type RunStepStatus = "OK" | "ERROR" | "SKIPPED";

/**
 * Email templates the demo automations reference. German content with literal
 * {{token}} placeholders (see apps/web/components/settings/email-tokens.ts).
 * Idempotent via upsert on (organizationId, name). Returns a name → row map so
 * the automation seed can wire each email.send step to a real templateId.
 */
export async function seedEmailTemplates(prisma: PrismaClient, organizationId: string) {
  const seed: { name: string; subject: string; body: string; description: string; category: string }[] = [
    {
      name: "Willkommen",
      category: "Onboarding",
      description: "Erste Begrüßung neuer Kontakte.",
      subject: "Willkommen bei {{org.name}}, {{contact.firstName}}",
      body: [
        "Guten Tag {{contact.salutation}} {{contact.lastName}},",
        "",
        "herzlich willkommen bei **{{org.name}}**. Wir freuen uns, Sie an Bord zu haben.",
        "",
        "Bei Fragen erreichen Sie uns jederzeit — wir sind gerne für Sie da.",
        "",
        "Freundliche Grüße",
        "{{user.name}}",
      ].join("\n"),
    },
    {
      name: "Nachfassen",
      category: "Vertrieb",
      description: "Erinnerung nach einem versendeten Angebot.",
      subject: "Ihr Angebot „{{deal.title}}“ — dürfen wir nachfassen?",
      body: [
        "Guten Tag {{contact.salutation}} {{contact.lastName}},",
        "",
        "wir möchten kurz zu unserem Angebot **{{deal.title}}** über {{deal.amount}} nachfassen.",
        "",
        "Gerne besprechen wir offene Punkte mit Ihnen. Melden Sie sich einfach.",
        "",
        "Freundliche Grüße",
        "{{user.name}}",
      ].join("\n"),
    },
    {
      name: "Großkunden-Begrüßung",
      category: "Onboarding",
      description: "Persönliche Begrüßung bei großen Abschlüssen.",
      subject: "Vielen Dank für Ihr Vertrauen, {{company.name}}",
      body: [
        "Guten Tag {{contact.salutation}} {{contact.lastName}},",
        "",
        "vielen Dank für den Abschluss von **{{deal.title}}**. Wir freuen uns sehr auf die",
        "Zusammenarbeit mit {{company.name}}.",
        "",
        "Ihre persönliche Ansprechperson meldet sich in Kürze bei Ihnen.",
        "",
        "Freundliche Grüße",
        "{{user.name}}",
      ].join("\n"),
    },
  ];

  const rows: Record<string, { id: string }> = {};
  for (const t of seed) {
    const row = await prisma.emailTemplate.upsert({
      where: { organizationId_name: { organizationId, name: t.name } },
      update: {},
      create: {
        organizationId,
        name: t.name,
        subject: t.subject,
        body: t.body,
        description: t.description,
        category: t.category,
      },
      select: { id: true },
    });
    rows[t.name] = row;
  }
  return rows;
}

/**
 * Automations demo data, mirroring the design kit: six workflows (one
 * branching) and a spread of runs so the list, its KPIs and the run log have
 * something to show. `ownerIds` are existing member user ids to attribute the
 * workflows to (round-robin); pass the org's real members so nothing fake is
 * added. Guarded so re-running is a no-op once automations exist. Run-step
 * traces are seeded alongside the run-history work.
 */
export async function seedAutomations(
  prisma: PrismaClient,
  organizationId: string,
  sampleDealId: string,
  ownerIds: string[],
) {
  if ((await prisma.workflow.count({ where: { organizationId } })) > 0) return;

  const pick = (i: number) => ownerIds[i % ownerIds.length] ?? "system";
  const [anna, jan, lena] = [pick(0), pick(1), pick(2)];

  // Email templates the email.send steps below reference by id. Seeded first so
  // the demo automations resolve to real, editable templates (Settings →
  // E-Mail-Vorlagen), not free-string names.
  const templates = await seedEmailTemplates(prisma, organizationId);
  const tplId = (name: string) => templates[name]?.id;
  const emailConfig = (name: string) => ({ templateId: tplId(name), template: name, consent: true });

  async function makeWorkflow(
    name: string,
    createdBy: string,
    isActive: boolean,
    steps: SeedStep[],
  ) {
    const wf = await prisma.workflow.create({
      data: { organizationId, name, isActive, createdBy },
    });
    let order = 0;
    for (const s of steps) {
      const step = await prisma.workflowStep.create({
        data: { workflowId: wf.id, kind: s.kind, type: s.type, order: order++, config: s.config ?? {} },
      });
      for (const [path, children] of [["YES", s.branch?.yes], ["NO", s.branch?.no]] as const) {
        let childOrder = 0;
        for (const c of children ?? []) {
          await prisma.workflowStep.create({
            data: {
              workflowId: wf.id,
              kind: c.kind,
              type: c.type,
              order: childOrder++,
              parentStepId: step.id,
              branchPath: path,
              config: c.config ?? {},
            },
          });
        }
      }
    }
    return wf;
  }

  const now = Date.now();
  const DAY = 86_400_000;
  async function makeRuns(
    workflowId: string,
    runs: { status: RunStatus; agoDays: number; durationMs: number; by: string | null }[],
  ) {
    for (const r of runs) {
      const startedAt = new Date(now - r.agoDays * DAY);
      await prisma.workflowRun.create({
        data: {
          organizationId,
          workflowId,
          status: r.status,
          startedAt,
          finishedAt: new Date(startedAt.getTime() + r.durationMs),
          durationMs: r.durationMs,
          triggeredByUserId: r.by,
          recordType: "Deal",
          recordId: sampleDealId,
        },
      });
    }
  }

  // a1 — branching onboarding flow (the canvas-mode example).
  const a1 = await makeWorkflow("Onboarding nach gewonnenem Deal", anna, true, [
    { kind: "TRIGGER", type: "deal.won", config: { filters: [{ entity: "Deal", field: "amount", op: "ist größer als", value: "10.000", unit: "EUR" }] } },
    { kind: "ACTION", type: "task.create", config: { title: "Onboarding starten", assignee: "deal.owner" } },
    {
      kind: "BRANCH",
      type: "branch",
      config: { condition: { entity: "Deal", field: "amount", op: "ist größer als", value: "50.000", unit: "EUR" } },
      branch: {
        yes: [{ kind: "ACTION", type: "email.send", config: emailConfig("Großkunden-Begrüßung") }],
        no: [{ kind: "ACTION", type: "note.add", config: { text: "Onboarding gestartet" } }],
      },
    },
  ]);
  await makeRuns(a1.id, [
    { status: "OK", agoDays: 0, durationMs: 1200, by: anna },
    { status: "OK", agoDays: 0, durationMs: 900, by: anna },
    { status: "SKIPPED", agoDays: 1, durationMs: 300, by: jan },
    { status: "OK", agoDays: 3, durationMs: 1100, by: anna },
    { status: "TEST", agoDays: 5, durationMs: 800, by: anna },
  ]);

  const a2 = await makeWorkflow("Lead-Nachverfolgung nach 3 Tagen", anna, true, [
    { kind: "TRIGGER", type: "contact.tagged", config: { tag: "Interessent" } },
    { kind: "DELAY", type: "wait.duration", config: { amount: 3, unit: "Tage" } },
    { kind: "ACTION", type: "task.create", config: { title: "Interessent anrufen", assignee: "contact.owner" } },
  ]);
  await makeRuns(a2.id, [
    { status: "OK", agoDays: 0, durationMs: 700, by: anna },
    { status: "OK", agoDays: 2, durationMs: 650, by: anna },
    { status: "OK", agoDays: 6, durationMs: 720, by: jan },
  ]);

  const a3 = await makeWorkflow("Angebot nachfassen", jan, true, [
    { kind: "TRIGGER", type: "deal.stage", config: { stage: "Angebot", forDays: 7 } },
    { kind: "DELAY", type: "wait.duration", config: { amount: 7, unit: "Tage" } },
    { kind: "ACTION", type: "email.send", config: emailConfig("Nachfassen") },
    { kind: "ACTION", type: "notify", config: { text: "Angebot nachgefasst" } },
  ]);
  await makeRuns(a3.id, [
    { status: "ERROR", agoDays: 1, durationMs: 2400, by: jan },
    { status: "OK", agoDays: 4, durationMs: 1300, by: jan },
  ]);

  const a4 = await makeWorkflow("Verlängerung 7 Tage vorher melden", anna, true, [
    { kind: "TRIGGER", type: "relative", config: { field: "Verlängerungsdatum", offsetDays: -7 } },
    { kind: "ACTION", type: "notify", config: { text: "Verlängerung steht an" } },
    { kind: "ACTION", type: "task.create", config: { title: "Verlängerung vorbereiten", assignee: "deal.owner" } },
  ]);
  await makeRuns(a4.id, [{ status: "OK", agoDays: 2, durationMs: 500, by: null }]);

  const a5 = await makeWorkflow("Datenpflege: fehlende USt-IdNr.", lena, false, [
    { kind: "TRIGGER", type: "schedule", config: { cron: "weekly", weekday: "Montag", time: "08:00" } },
    { kind: "FILTER", type: "filter", config: { entity: "Firma", field: "vatId", op: "ist leer" } },
    { kind: "ACTION", type: "task.create", config: { title: "USt-IdNr. nachpflegen", assignee: "company.owner" } },
    { kind: "ACTION", type: "notify", config: { text: "Fehlende USt-IdNr. gefunden" } },
  ]);
  await makeRuns(a5.id, [{ status: "OK", agoDays: 40, durationMs: 640, by: null }]);

  // a6 — draft, never run.
  await makeWorkflow("Willkommens-E-Mail für neue Kontakte", jan, false, [
    { kind: "TRIGGER", type: "contact.created" },
    { kind: "ACTION", type: "email.send", config: emailConfig("Willkommen") },
  ]);

  await seedRunSteps(prisma, organizationId);
}

type StepRow = {
  id: string;
  kind: SeedKind;
  type: string;
  order: number;
  parentStepId: string | null;
  branchPath: "YES" | "NO" | null;
  config: unknown;
};

function cfg(step: StepRow): Record<string, unknown> {
  return step.config && typeof step.config === "object" ? (step.config as Record<string, unknown>) : {};
}

/**
 * Per-step execution traces for the seeded runs — the run-log surface. The
 * trace mirrors the builder order one-to-one: main steps, and after a branch
 * the taken (Ja) lane, then the shared tail. Idempotent (skips runs that
 * already have steps). This is demo data, not the execution engine.
 */
export async function seedRunSteps(prisma: PrismaClient, organizationId: string) {
  const members = await prisma.member.findMany({
    where: { organizationId },
    include: { user: { select: { id: true, name: true } } },
  });
  const nameById = new Map(members.map((m) => [m.userId, m.user.name]));

  const workflows = await prisma.workflow.findMany({
    where: { organizationId },
    include: { steps: true, runs: { include: { steps: true } } },
  });

  for (const wf of workflows) {
    const flat = wf.steps as StepRow[];
    const main = flat.filter((s) => s.parentStepId === null).sort((a, b) => a.order - b.order);
    const lane = (branchId: string, path: "YES" | "NO") =>
      flat.filter((s) => s.parentStepId === branchId && s.branchPath === path).sort((a, b) => a.order - b.order);

    // Linear trace: main order, expanding a branch into its "Ja" lane.
    const trace: StepRow[] = [];
    for (const s of main) {
      trace.push(s);
      if (s.kind === "BRANCH") lane(s.id, "YES").forEach((c) => trace.push(c));
    }

    for (const run of wf.runs) {
      if (run.steps.length > 0) continue;
      const byName = run.triggeredByUserId ? (nameById.get(run.triggeredByUserId) ?? "System") : "System";

      let items: { step: StepRow; status: RunStepStatus; durationMs: number; message: string; errorCode: string | null }[];

      if (run.status === "SKIPPED") {
        const t = trace[0];
        items = t
          ? [{ step: t, status: "SKIPPED", durationMs: 300, message: "Bedingung des Auslösers nicht erfüllt — Betrag lag unter 10.000 EUR.", errorCode: null }]
          : [];
      } else {
        const failIdx =
          run.status === "ERROR"
            ? (() => {
                const i = trace.findIndex((s) => s.type === "email.send");
                return i !== -1 ? i : trace.length - 1;
              })()
            : -1;
        // OK and TEST runs both have OK steps (the run-level TEST label lives on
        // the run, not its steps).
        items = trace.map((step, i) => {
          if (failIdx !== -1 && i > failIdx) {
            return { step, status: "SKIPPED" as RunStepStatus, durationMs: 0, message: "Übersprungen, weil ein vorheriger Schritt fehlgeschlagen ist.", errorCode: null };
          }
          if (i === failIdx) {
            return { step, status: "ERROR" as RunStepStatus, durationMs: 1900, message: "Die E-Mail konnte nicht gesendet werden.", errorCode: "TEMPLATE_MISSING" };
          }
          return { step, status: "OK" as RunStepStatus, durationMs: stepDuration(step), message: stepMessage(step, byName), errorCode: null };
        });
      }

      let clock = run.startedAt.getTime();
      let order = 0;
      for (const it of items) {
        await prisma.workflowRunStep.create({
          data: {
            runId: run.id,
            stepId: it.step.id,
            order: order++,
            status: it.status,
            startedAt: new Date(clock),
            durationMs: it.durationMs,
            message: it.message,
            errorCode: it.errorCode,
          },
        });
        clock += it.durationMs;
      }
    }
  }
}

function stepDuration(step: StepRow): number {
  if (step.kind === "TRIGGER") return 20;
  if (step.kind === "DELAY") return 0;
  return 200 + Math.round(Math.random() * 400);
}

function stepMessage(step: StepRow, byName: string): string {
  const c = cfg(step);
  const str = (k: string) => (c[k] == null ? "" : String(c[k]));
  if (step.kind === "TRIGGER") return `Ausgelöst von ${byName} · Bedingung erfüllt`;
  if (step.kind === "BRANCH") return "Bedingung geprüft — weiter im Pfad Ja";
  if (step.kind === "FILTER") return "Bedingung geprüft — Ablauf wird fortgesetzt";
  switch (step.type) {
    case "task.create":
      return `Aufgabe „${str("title") || "Aufgabe"}“ angelegt`;
    case "email.send":
      return `E-Mail „${str("template") || "Vorlage"}“ gesendet · Einwilligung lag vor`;
    case "wait.duration":
      return `${str("amount") || "3"} ${str("unit") || "Tage"} gewartet`;
    case "note.add":
      return "Notiz am Datensatz hinterlegt";
    case "notify":
      return "Team intern benachrichtigt";
    default:
      return "Ausgeführt";
  }
}

// Only run the full seed when this file is executed directly (pnpm db:seed),
// not when seedAutomations is imported by a targeted runner.
import { fileURLToPath } from "node:url";

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
