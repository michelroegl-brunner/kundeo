"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { TokenField } from "@/components/settings/email-templates/token-field";

export interface Draft {
  name: string;
  category: string;
  subject: string;
  body: string;
  description: string;
}

export type EditorErrors = Partial<Record<"name" | "subject" | "body", string>>;

export interface TemplateEditorProps {
  draft: Draft;
  isNew: boolean;
  view: "visual" | "source";
  errors: EditorErrors;
  categories: string[];
  dirty: boolean;
  pending: boolean;
  subtitle: string;
  onView: (v: "visual" | "source") => void;
  onField: (k: keyof Draft, v: string) => void;
  onSave: () => void;
  onDiscard: () => void;
  onDelete: () => void;
}

function ViewToggle({ view, onView }: { view: "visual" | "source"; onView: (v: "visual" | "source") => void }) {
  return (
    <div className="inline-flex h-[30px] items-center rounded-md border border-edge bg-surface-page p-0.5">
      {(["visual", "source"] as const).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onView(v)}
          className={
            "inline-flex h-full items-center rounded-[5px] px-2.5 text-xs transition duration-[180ms] " +
            (view === v ? "bg-surface-card font-semibold text-content shadow-xs" : "font-medium text-content-muted")
          }
        >
          {v === "visual" ? "Visuell" : "Quelltext"}
        </button>
      ))}
    </div>
  );
}

/** Markdown toolbar acting on the body — wraps the source selection or appends. */
function MarkdownToolbar({
  view,
  bodyRef,
  value,
  onChange,
}: {
  view: "visual" | "source";
  bodyRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (v: string) => void;
}) {
  const wrap = (prefix: string, suffix: string, fallback: string) => {
    const el = view === "source" ? bodyRef.current : null;
    if (el && el.selectionStart !== el.selectionEnd) {
      const s = el.selectionStart;
      const e = el.selectionEnd;
      onChange(value.slice(0, s) + prefix + value.slice(s, e) + suffix + value.slice(e));
      return;
    }
    onChange(value ? `${value}${value.endsWith("\n") ? "" : " "}${fallback}` : fallback);
  };
  const btn = (icon: string, label: string, onClick: () => void) => (
    <IconButton icon={icon} label={label} size="sm" onClick={onClick} />
  );
  return (
    <div className="flex items-center gap-0.5">
      {btn("bold", "Fett", () => wrap("**", "**", "**fett**"))}
      {btn("italic", "Kursiv", () => wrap("*", "*", "*kursiv*"))}
      {btn("link", "Link", () => wrap("[", "](https://)", "[Text](https://)"))}
      {btn("list", "Aufzählung", () => onChange(value ? `${value}\n- ` : "- "))}
      {btn("list-ordered", "Nummerierte Liste", () => onChange(value ? `${value}\n1. ` : "1. "))}
    </div>
  );
}

export function TemplateEditor(props: TemplateEditorProps) {
  const { draft, isNew, view, errors, categories, dirty, pending } = props;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const missing = !draft.name.trim() || !draft.subject.trim();
  const complete = draft.name.trim() && draft.subject.trim() && draft.body.trim();
  const hasErrors = Boolean(errors.name || errors.subject || errors.body);

  return (
    <Card
      title={isNew ? "Neue Vorlage" : draft.name || "Vorlage"}
      subtitle={props.subtitle}
      actions={<ViewToggle view={view} onView={props.onView} />}
      footer={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            iconLeft="trash-2"
            disabled={isNew}
            onClick={props.onDelete}
          >
            Löschen
          </Button>
          {dirty ? <Badge tone="warning">Ungespeichert</Badge> : null}
          <div className="ml-auto flex gap-2">
            <Button variant="secondary" size="sm" disabled={!dirty} onClick={props.onDiscard}>
              Verwerfen
            </Button>
            <Button size="sm" loading={pending} disabled={!dirty || hasErrors || !complete} onClick={props.onSave}>
              Speichern
            </Button>
          </div>
        </div>
      }
    >
      {missing ? (
        <div
          className="mb-4 flex gap-3 rounded-md p-3"
          style={{ background: "var(--surface-warning-subtle)", border: "1px solid var(--amber-500)" }}
        >
          <Icon name="triangle-alert" size={16} color="var(--amber-600)" />
          <p className="text-xs leading-normal text-content">
            Dieser Vorlage fehlen noch Angaben. Ohne Name und Betreff lässt sie sich nicht speichern.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
          <Field label="Name" required hint="Erscheint in der Auswahl der Aktion „E-Mail senden“." error={errors.name}>
            <Input
              invalid={!!errors.name}
              value={draft.name}
              placeholder="z. B. Willkommen"
              onChange={(e) => props.onField("name", e.target.value)}
            />
          </Field>
          <Field label="Kategorie" hint="Optional, frei wählbar">
            <Input
              value={draft.category}
              list="email-template-categories"
              placeholder="z. B. Onboarding"
              onChange={(e) => props.onField("category", e.target.value)}
            />
            <datalist id="email-template-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>

        <Field
          hint={`Die Pillen werden beim Senden durch die echten Werte ersetzt. ${draft.subject.length} von 120 Zeichen.`}
          error={errors.subject}
        >
          <TokenField
            label="Betreff"
            value={draft.subject}
            onChange={(v) => props.onField("subject", v)}
            view={view}
            invalid={!!errors.subject}
            placeholder="z. B. Willkommen bei {{org.name}}"
          />
        </Field>

        <Field hint="Markdown: **fett**, *kursiv*, Listen und Links. Platzhalter über „Daten einfügen“ wählen." error={errors.body}>
          <TokenField
            label="Inhalt"
            value={draft.body}
            onChange={(v) => props.onField("body", v)}
            view={view}
            multiline
            invalid={!!errors.body}
            textareaRef={bodyRef}
            placeholder="Guten Tag {{contact.lastName}}, …"
            toolbar={<MarkdownToolbar view={view} bodyRef={bodyRef} value={draft.body} onChange={(v) => props.onField("body", v)} />}
          />
        </Field>

        {view === "source" ? (
          <div className="rounded-md p-3" style={{ background: "var(--surface-brand-subtle)" }}>
            <p className="text-2xs leading-normal text-content-secondary">
              Beide Ansichten zeigen denselben Inhalt. Im Quelltext stehen die Platzhalter als{" "}
              <span className="font-mono">{"{{contact.firstName}}"}</span> — Tippfehler werden beim Speichern gemeldet.
            </p>
          </div>
        ) : null}

        <Field label="Beschreibung" hint="Interne Notiz, wird nicht mitgesendet.">
          <Textarea
            rows={2}
            value={draft.description}
            placeholder="—"
            onChange={(e) => props.onField("description", e.target.value)}
          />
        </Field>
      </div>
    </Card>
  );
}
