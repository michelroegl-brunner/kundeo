/**
 * Server-side loader: every email template in the active org, each with the list
 * of automation steps that reference it. A step references a template by
 * `config.templateId`; legacy steps that still carry only `config.template`
 * (the name) are matched by name so a delete stays blocked for them too.
 *
 * Runs inside a `scoped()` transaction — RLS restricts both queries to the org.
 */
import type { Prisma } from "@kundeo/db";
import type { EmailTemplateItem, TemplateUsage } from "@/components/settings/email-templates/types";

type Db = Prisma.TransactionClient;

function config(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
}

export async function loadEmailTemplateItems(db: Db): Promise<EmailTemplateItem[]> {
  const [templates, workflows] = await Promise.all([
    db.emailTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
    db.workflow.findMany({
      select: {
        id: true,
        name: true,
        isActive: true,
        steps: { where: { type: "email.send" }, select: { order: true, config: true } },
      },
    }),
  ]);

  // Index usages by both template id and name so the id-based and legacy
  // name-based references both resolve.
  const byId = new Map<string, TemplateUsage[]>();
  const byName = new Map<string, TemplateUsage[]>();
  const push = (map: Map<string, TemplateUsage[]>, key: string, usage: TemplateUsage) => {
    const list = map.get(key);
    if (list) list.push(usage);
    else map.set(key, [usage]);
  };

  for (const wf of workflows) {
    for (const step of wf.steps) {
      const c = config(step.config);
      const usage: TemplateUsage = {
        workflowId: wf.id,
        workflowName: wf.name,
        stepIndex: step.order + 1,
        enabled: wf.isActive,
      };
      const templateId = typeof c.templateId === "string" ? c.templateId : null;
      const templateName = typeof c.template === "string" ? c.template : null;
      if (templateId) push(byId, templateId, usage);
      else if (templateName) push(byName, templateName, usage);
    }
  }

  return templates.map((t) => ({
    id: t.id,
    name: t.name,
    subject: t.subject,
    body: t.body,
    description: t.description,
    category: t.category,
    updatedAt: t.updatedAt.toISOString(),
    usages: [...(byId.get(t.id) ?? []), ...(byName.get(t.name) ?? [])],
  }));
}
