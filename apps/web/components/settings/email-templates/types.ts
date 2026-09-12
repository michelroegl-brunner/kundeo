/** Shared types for the E-Mail-Vorlagen feature (server page, actions, island). */

/** One automation step that references a template. */
export interface TemplateUsage {
  workflowId: string;
  workflowName: string;
  /** 1-based step position within its lane, for the "Schritt N" label. */
  stepIndex: number;
  /** Whether the owning workflow is active. */
  enabled: boolean;
}

/** A template as sent to the client island. */
export interface EmailTemplateItem {
  id: string;
  name: string;
  subject: string;
  body: string;
  description: string | null;
  category: string | null;
  /** ISO timestamp; formatted in the UI via lib/format. */
  updatedAt: string;
  usages: TemplateUsage[];
}

/** One record the preview can render against, with its resolved token values. */
export interface PreviewRecord {
  id: string;
  label: string;
  values: Record<string, string>;
}

/** The editable fields of a template. */
export interface TemplateInput {
  name: string;
  subject: string;
  body: string;
  description: string;
  category: string;
}
