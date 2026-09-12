/**
 * The one substitution path shared by the template preview, the test send and
 * the automation runner: replace every `{{path}}` placeholder in a template's
 * subject and body with the concrete value for that path.
 *
 * Deliberately dependency-free and side-effect-free. Unknown or missing paths
 * substitute to an empty string (never the literal `{{path}}` and never a
 * throw), so a template with a stray token degrades quietly rather than mailing
 * raw syntax. The caller supplies the value map — from sample data in the
 * preview, or from the loaded record at send time.
 */

const TOKEN_RE = /\{\{\s*([\w.]+)\s*\}\}/g;

export type TemplateValues = Record<string, string | null | undefined>;

/** Substitute `{{path}}` in one string from the value map. */
export function renderString(text: string, values: TemplateValues): string {
  return text.replace(TOKEN_RE, (_, path: string) => {
    const v = values[path];
    return v == null ? "" : String(v);
  });
}

export interface RenderableTemplate {
  subject: string;
  body: string;
}

/** Render a template's subject and body against a value map. */
export function renderTemplate(template: RenderableTemplate, values: TemplateValues): RenderableTemplate {
  return {
    subject: renderString(template.subject, values),
    body: renderString(template.body, values),
  };
}
