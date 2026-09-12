"use server";

import { revalidatePath } from "next/cache";
import { scoped, getSession } from "@/lib/session";
import { getEmailSender } from "@/lib/email";
import { renderTemplate } from "@/lib/email/render-template";
import { renderMarkdown } from "@/lib/email/markdown";
import { sampleTokenValues, unknownTokens } from "@/components/settings/email-tokens";
import { loadEmailTemplateItems } from "@/lib/email/template-usage";
import type { EmailTemplateItem, TemplateInput } from "@/components/settings/email-templates/types";

export type ActionResult = { ok: boolean; error?: string };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

/** Trim and validate a template input; returns an error message or null. */
function validate(input: TemplateInput): string | null {
  if (!input.name.trim()) return "Bitte einen Namen angeben.";
  if (!input.subject.trim()) return "Bitte einen Betreff angeben.";
  if (!input.body.trim()) return "Bitte einen Inhalt angeben.";
  const unknown = [...unknownTokens(input.subject), ...unknownTokens(input.body)];
  if (unknown.length) {
    return `Unbekannter Platzhalter {{${unknown[0]}}} — bitte über „Daten einfügen“ wählen.`;
  }
  return null;
}

function clean(input: TemplateInput) {
  return {
    name: input.name.trim(),
    subject: input.subject.trim(),
    body: input.body.trim(),
    description: input.description.trim() || null,
    category: input.category.trim() || null,
  };
}

export async function listEmailTemplates(): Promise<EmailTemplateItem[]> {
  return scoped((db) => loadEmailTemplateItems(db));
}

export async function createEmailTemplate(input: TemplateInput): Promise<ActionResult & { id?: string }> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    const id = await scoped(async (db, organizationId) => {
      const row = await db.emailTemplate.create({ data: { organizationId, ...clean(input) }, select: { id: true } });
      return row.id;
    });
    revalidatePath("/settings");
    revalidatePath("/automationen");
    return { ok: true, id };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Eine Vorlage mit diesem Namen existiert bereits." };
    return { ok: false, error: "Vorlage konnte nicht gespeichert werden." };
  }
}

export async function updateEmailTemplate(id: string, input: TemplateInput): Promise<ActionResult> {
  const invalid = validate(input);
  if (invalid) return { ok: false, error: invalid };
  try {
    await scoped((db) => db.emailTemplate.update({ where: { id }, data: clean(input) }));
    revalidatePath("/settings");
    revalidatePath("/automationen");
    return { ok: true };
  } catch (e) {
    if (isUniqueViolation(e)) return { ok: false, error: "Eine Vorlage mit diesem Namen existiert bereits." };
    return { ok: false, error: "Vorlage konnte nicht gespeichert werden." };
  }
}

export async function duplicateEmailTemplate(id: string): Promise<ActionResult> {
  try {
    await scoped(async (db, organizationId) => {
      const src = await db.emailTemplate.findFirst({ where: { id } });
      if (!src) throw new Error("Vorlage nicht gefunden.");
      // Find a free "… (Kopie)" name (then " (Kopie 2)", …).
      const base = `${src.name} (Kopie)`;
      const existing = new Set(
        (await db.emailTemplate.findMany({ select: { name: true } })).map((t) => t.name),
      );
      let name = base;
      for (let n = 2; existing.has(name); n++) name = `${src.name} (Kopie ${n})`;
      await db.emailTemplate.create({
        data: {
          organizationId,
          name,
          subject: src.subject,
          body: src.body,
          description: src.description,
          category: src.category,
        },
      });
    });
    revalidatePath("/settings");
    revalidatePath("/automationen");
    return { ok: true };
  } catch {
    return { ok: false, error: "Vorlage konnte nicht dupliziert werden." };
  }
}

export async function deleteEmailTemplate(id: string): Promise<ActionResult> {
  try {
    await scoped(async (db) => {
      const template = await db.emailTemplate.findFirst({ where: { id }, select: { id: true, name: true } });
      if (!template) throw new Error("Vorlage nicht gefunden.");
      // Block deletion while any email.send step references this template (by id
      // or by legacy name) — never orphan an automation step silently.
      const steps = await db.workflowStep.findMany({ where: { type: "email.send" }, select: { config: true } });
      const inUse = steps.filter((s) => {
        const c = (s.config && typeof s.config === "object" ? s.config : {}) as Record<string, unknown>;
        return c.templateId === id || (!c.templateId && c.template === template.name);
      }).length;
      if (inUse > 0) {
        throw new Error(`Vorlage konnte nicht gelöscht werden: sie wird von ${inUse} Automationen verwendet.`);
      }
      await db.emailTemplate.delete({ where: { id } });
    });
    revalidatePath("/settings");
    revalidatePath("/automationen");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Vorlage konnte nicht gelöscht werden." };
  }
}

export async function sendTestEmail(id: string, recipient?: string): Promise<ActionResult & { delivered?: boolean }> {
  try {
    const [loaded, session] = await Promise.all([
      scoped(async (db, organizationId) => ({
        template: await db.emailTemplate.findFirst({ where: { id } }),
        organizationId,
      })),
      getSession(),
    ]);
    const { template, organizationId } = loaded;
    if (!template) return { ok: false, error: "Vorlage nicht gefunden." };
    const to = (recipient?.trim() || session?.user.email || "").trim();
    if (!to) return { ok: false, error: "Keine Empfängeradresse vorhanden." };

    const rendered = renderTemplate({ subject: template.subject, body: template.body }, sampleTokenValues());
    const html = renderMarkdown(rendered.body);
    // Network send happens outside any DB transaction.
    const result = await getEmailSender().send({
      organizationId,
      to,
      subject: rendered.subject,
      text: rendered.body,
      html,
      templateName: template.name,
    });
    return { ok: true, delivered: result.delivered };
  } catch {
    return { ok: false, error: "Test-E-Mail konnte nicht gesendet werden." };
  }
}
