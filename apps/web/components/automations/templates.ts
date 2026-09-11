/**
 * Starter automations. Each template is a real, complete flow — using it
 * creates a draft workflow the user reviews and switches on themselves. Pure
 * data (no ids, no side effects); the create action materialises ids.
 */
import type { StepKind } from "./catalogue";

export interface TemplateStep {
  kind: StepKind;
  type: string;
  config?: Record<string, unknown>;
  yes?: TemplateStep[];
  no?: TemplateStep[];
}

export interface TemplateDef {
  id: string;
  name: string;
  desc: string;
  popular?: boolean;
  branching?: boolean;
  consent?: boolean;
  steps: TemplateStep[];
}

export interface TemplateGroup {
  group: string;
  icon: string;
  items: TemplateDef[];
}

export const TEMPLATE_GROUPS: TemplateGroup[] = [
  {
    group: "Lead-Nachverfolgung",
    icon: "user-plus",
    items: [
      {
        id: "lead-followup-1d",
        name: "Neuer Lead: Aufgabe in 1 Tag",
        desc: "Wenn ein Kontakt angelegt wird, erstellt Kundeo nach einem Tag eine Anruf-Aufgabe für den Inhaber.",
        popular: true,
        steps: [
          { kind: "TRIGGER", type: "contact.created" },
          { kind: "DELAY", type: "wait.duration", config: { amount: "1", unit: "Tage" } },
          { kind: "ACTION", type: "task.create", config: { title: "Neuen Lead anrufen", assignee: "owner", dueDays: "1" } },
        ],
      },
      {
        id: "interessent-welcome",
        name: "Interessent begrüßen",
        desc: "Sobald ein Kontakt das Tag „Interessent“ erhält, geht eine Willkommens-E-Mail aus der Vorlage raus.",
        consent: true,
        steps: [
          { kind: "TRIGGER", type: "contact.tagged", config: { tag: "Interessent" } },
          { kind: "ACTION", type: "email.send", config: { template: "Willkommen", recipient: "contact", consent: true } },
        ],
      },
      {
        id: "messe-verteilen",
        name: "Messe-Kontakte verteilen",
        desc: "Neue Kontakte mit dem Tag „Messe“ werden im Reihum-Verfahren auf das Vertriebsteam verteilt.",
        steps: [
          { kind: "TRIGGER", type: "contact.tagged", config: { tag: "Messe" } },
          { kind: "ACTION", type: "assign", config: { assignee: "roundrobin" } },
          { kind: "ACTION", type: "notify", config: { text: "Neuer Messe-Kontakt wurde zugewiesen" } },
        ],
      },
    ],
  },
  {
    group: "Deal-Hygiene",
    icon: "kanban",
    items: [
      {
        id: "angebot-nachfassen",
        name: "Angebot nach 7 Tagen nachfassen",
        desc: "Liegt ein Deal eine Woche in der Phase „Angebot“, erhält der Inhaber eine Aufgabe und eine Erinnerung.",
        popular: true,
        steps: [
          { kind: "TRIGGER", type: "deal.stage", config: { stage: "Angebot" } },
          { kind: "DELAY", type: "wait.duration", config: { amount: "7", unit: "Tage" } },
          { kind: "ACTION", type: "email.send", config: { template: "Angebot nachfassen", recipient: "contact", consent: true } },
          { kind: "ACTION", type: "notify", config: { text: "Angebot wurde nachgefasst" } },
        ],
      },
      {
        id: "onboarding-won",
        name: "Onboarding nach gewonnenem Deal",
        desc: "Gewonnene Deals über 10.000 EUR starten eine Onboarding-Aufgabe; größere Deals erhalten eine eigene E-Mail.",
        branching: true,
        consent: true,
        steps: [
          { kind: "TRIGGER", type: "deal.won", config: { filters: [{ entity: "Deal", field: "amount", op: "ist größer als", value: "10.000", unit: "EUR" }] } },
          { kind: "ACTION", type: "task.create", config: { title: "Onboarding starten", assignee: "owner", dueDays: "1" } },
          {
            kind: "BRANCH",
            type: "branch",
            config: { condition: { entity: "Deal", field: "amount", op: "ist größer als", value: "50.000", unit: "EUR" } },
            yes: [{ kind: "ACTION", type: "email.send", config: { template: "Willkommen Enterprise", recipient: "contact", consent: true } }],
            no: [{ kind: "ACTION", type: "note.add", config: { text: "Onboarding gestartet" } }],
          },
        ],
      },
      {
        id: "lost-dokumentieren",
        name: "Verlorene Deals dokumentieren",
        desc: "Wird ein Deal verloren, fragt Kundeo per Aufgabe den Grund ab und hängt eine Notiz an.",
        steps: [
          { kind: "TRIGGER", type: "deal.lost" },
          { kind: "ACTION", type: "task.create", config: { title: "Verlustgrund erfassen", assignee: "owner", dueDays: "3" } },
          { kind: "ACTION", type: "note.add", config: { text: "Deal verloren — Grund dokumentieren" } },
        ],
      },
    ],
  },
  {
    group: "Reaktivierung",
    icon: "history",
    items: [
      {
        id: "reaktivierung-60",
        name: "Keine Aktivität seit 60 Tagen",
        desc: "Kontakte ohne Aktivität seit 60 Tagen landen als Aufgabe beim zuständigen Inhaber.",
        steps: [
          { kind: "TRIGGER", type: "schedule", config: { cron: "weekly", weekday: "Montag", time: "08:00" } },
          { kind: "ACTION", type: "task.create", config: { title: "Inaktiven Kontakt reaktivieren", assignee: "owner", dueDays: "3" } },
          { kind: "ACTION", type: "notify", config: { text: "Reaktivierung fällig" } },
        ],
      },
      {
        id: "verlaengerung-7",
        name: "Verlängerung 7 Tage vorher",
        desc: "Eine Woche vor dem Verlängerungsdatum erinnert Kundeo den Inhaber und legt eine Aufgabe an.",
        steps: [
          { kind: "TRIGGER", type: "relative", config: { field: "Verlängerungsdatum", offsetDays: -7 } },
          { kind: "ACTION", type: "notify", config: { text: "Verlängerung steht an" } },
          { kind: "ACTION", type: "task.create", config: { title: "Verlängerung vorbereiten", assignee: "owner", dueDays: "3" } },
        ],
      },
    ],
  },
  {
    group: "Datenpflege",
    icon: "shield-check",
    items: [
      {
        id: "vatid-fehlt",
        name: "Fehlende USt-IdNr. melden",
        desc: "Wöchentliche Prüfung: Firmen ohne USt-IdNr. werden zur Nachpflege gesammelt.",
        steps: [
          { kind: "TRIGGER", type: "schedule", config: { cron: "weekly", weekday: "Montag", time: "08:00" } },
          { kind: "FILTER", type: "filter", config: { entity: "Firma", field: "vatId", op: "ist leer" } },
          { kind: "ACTION", type: "task.create", config: { title: "USt-IdNr. nachpflegen", assignee: "owner", dueDays: "7" } },
          { kind: "ACTION", type: "notify", config: { text: "Firma ohne USt-IdNr. gefunden" } },
        ],
      },
      {
        id: "einwilligung-dokumentieren",
        name: "Einwilligung dokumentieren",
        desc: "Kontakte ohne E-Mail-Einwilligung werden getaggt und aus Versand-Automationen ausgenommen.",
        consent: true,
        steps: [
          { kind: "TRIGGER", type: "contact.updated" },
          { kind: "FILTER", type: "filter", config: { entity: "Kontakt", field: "consent", op: "liegt nicht vor" } },
          { kind: "ACTION", type: "tag.add", config: { tag: "Keine Einwilligung" } },
        ],
      },
    ],
  },
];

/** Total steps in a template, counting branch-lane children. */
export function countSteps(steps: TemplateStep[]): number {
  return steps.reduce((n, s) => n + 1 + (s.yes?.length ?? 0) + (s.no?.length ?? 0), 0);
}

export function templateById(id: string): TemplateDef | undefined {
  return TEMPLATE_GROUPS.flatMap((g) => g.items).find((t) => t.id === id);
}
