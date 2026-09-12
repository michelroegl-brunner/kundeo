"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { EMAIL_TOKENS, parseTokens } from "@/components/settings/email-tokens";

/** The plain-language data pill (mirrors the automations panel's TokenPill). */
function pillHtml(label: string, path: string): string {
  // contentEditable=false makes the pill atomic; data-token carries the path so
  // serialization can rebuild {{path}}.
  return (
    `<span contenteditable="false" data-token="${path}" ` +
    `class="mx-0.5 inline-flex h-[22px] items-center gap-1.5 rounded-full bg-surface-brand-subtle pl-2.5 pr-2.5 align-middle text-xs font-medium text-content-brand">` +
    `<span class="inline-flex items-center" aria-hidden="true">{}</span>${label}</span>`
  );
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Canonical string → inner HTML with pills for the contentEditable view. */
function toHtml(value: string): string {
  return parseTokens(value)
    .map((n) => (typeof n === "string" ? escapeHtml(n).replace(/\n/g, "<br>") : pillHtml(n.label, n.path)))
    .join("");
}

/** contentEditable DOM → canonical string ({{path}} for pills). */
function fromDom(el: HTMLElement): string {
  let out = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
    } else if (node instanceof HTMLElement) {
      const path = node.getAttribute("data-token");
      if (path) out += `{{${path}}}`;
      else if (node.tagName === "BR") out += "\n";
      else out += node.textContent ?? "";
    }
  });
  return out;
}

/** Popover to pick a token; inserts the raw {{path}} at the end of the value. */
function TokenChooser({ onPick }: { onPick: (path: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const groups = EMAIL_TOKENS.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.label + i.path).toLowerCase().includes(q.toLowerCase())),
  })).filter((g) => g.items.length);
  return (
    <div className="relative">
      <Button size="sm" variant="secondary" iconLeft="braces" onClick={() => setOpen((o) => !o)}>
        Daten einfügen
      </Button>
      {open ? (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[calc(100%+6px)] z-30 max-h-[300px] w-[288px] overflow-y-auto rounded-lg border border-edge bg-surface-card p-3 shadow-lg">
            <p className="mb-2 text-2xs leading-normal text-content-muted">
              Wählen Sie einen Wert. Kundeo setzt ihn beim Senden automatisch ein.
            </p>
            <Input size="sm" iconLeft="search" placeholder="Wert suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="mt-3 flex flex-col gap-3">
              {groups.map((g) => (
                <div key={g.group}>
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-subtle">{g.group}</p>
                  <div className="flex flex-wrap gap-1">
                    {g.items.map((i) => (
                      <button
                        key={i.path}
                        type="button"
                        onClick={() => {
                          onPick(i.path);
                          setOpen(false);
                        }}
                        className="inline-flex h-[22px] cursor-pointer items-center gap-1.5 rounded-full border-0 bg-surface-brand-subtle pl-2.5 pr-2.5 text-xs font-medium text-content-brand"
                      >
                        <Icon name="braces" size={11} />
                        {i.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {!groups.length ? <p className="text-2xs text-content-muted">Kein Treffer.</p> : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

export interface TokenFieldProps {
  value: string;
  onChange: (next: string) => void;
  view: "visual" | "source";
  multiline?: boolean;
  invalid?: boolean;
  placeholder?: string;
  /** Exposed so a Markdown toolbar can operate on the source textarea. */
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  /** Extra controls rendered in the label row (e.g. a Markdown toolbar). */
  toolbar?: React.ReactNode;
  label: string;
}

/**
 * A field that edits a template string with inline `{{token}}` placeholders. In
 * "visual" mode tokens render as pills in a contentEditable surface; in "source"
 * mode the same string is edited raw in a mono field. Both write the identical
 * canonical string — no parallel token array (see email-tokens.ts).
 */
export function TokenField({
  value,
  onChange,
  view,
  multiline = false,
  invalid = false,
  placeholder,
  textareaRef,
  toolbar,
  label,
}: TokenFieldProps) {
  const editableRef = useRef<HTMLDivElement>(null);

  // Re-render the pill HTML only when the incoming value differs from what the
  // DOM currently serializes to — so the caret is preserved while typing.
  useEffect(() => {
    const el = editableRef.current;
    if (!el || view !== "visual") return;
    if (fromDom(el) !== value) el.innerHTML = toHtml(value);
  }, [value, view]);

  const insert = (path: string) => onChange(value ? `${value} {{${path}}}` : `{{${path}}}`);

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-xs font-medium text-content-secondary">{label}</span>
        <div className="ml-auto flex items-center gap-2">
          {toolbar}
          <TokenChooser onPick={insert} />
        </div>
      </div>

      {view === "source" ? (
        multiline ? (
          <Textarea
            ref={textareaRef}
            rows={8}
            invalid={invalid}
            className="font-mono text-xs"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <Input mono invalid={invalid} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
        )
      ) : (
        <div
          ref={editableRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline={multiline}
          aria-label={label}
          onInput={(e) => onChange(fromDom(e.currentTarget))}
          className={cnEditable(multiline, invalid)}
          data-placeholder={placeholder}
        />
      )}
    </div>
  );
}

function cnEditable(multiline: boolean, invalid: boolean): string {
  return [
    "w-full rounded-md border bg-surface-card px-2.5 py-[9px] font-sans text-sm leading-relaxed text-content outline-none transition duration-[120ms] ease-out",
    "empty:before:text-content-subtle empty:before:content-[attr(data-placeholder)]",
    multiline ? "min-h-[160px] whitespace-pre-wrap" : "min-h-[var(--control-height-md)] whitespace-nowrap overflow-x-auto",
    invalid
      ? "border-edge-danger focus:[box-shadow:var(--ring-danger)]"
      : "border-edge focus:border-edge-focus focus:[box-shadow:var(--ring-brand)]",
  ].join(" ");
}
