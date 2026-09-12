"use client";

import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tag } from "@/components/ui/tag";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import type { EmailTemplateItem } from "@/components/settings/email-templates/types";

const SORTS = [
  { value: "name", label: "Name (A–Z)" },
  { value: "updated", label: "Zuletzt geändert" },
];

export interface TemplateListProps {
  visible: EmailTemplateItem[];
  total: number;
  categories: string[];
  selectedId: string | null;
  dirtyIds: Set<string>;
  newDraftName: string | null;
  query: string;
  category: string;
  sort: string;
  expanded: Set<string>;
  onQuery: (v: string) => void;
  onCategory: (v: string) => void;
  onSort: (v: string) => void;
  onToggleExpand: (id: string) => void;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TemplateList(props: TemplateListProps) {
  const { visible, total, categories, selectedId, dirtyIds, newDraftName, expanded } = props;

  return (
    <Card
      title="Vorlagen"
      subtitle={`${total} ${total === 1 ? "Vorlage" : "Vorlagen"}`}
      padding="none"
      actions={
        <Button size="sm" variant="secondary" iconLeft="plus" onClick={props.onNew}>
          Neue Vorlage
        </Button>
      }
      footer={
        <p className="text-2xs text-content-muted">
          {total} {total === 1 ? "Vorlage" : "Vorlagen"} · Vorlagen in Verwendung lassen sich nicht löschen.
        </p>
      }
    >
      <div className="flex flex-col gap-2 border-b border-edge-subtle p-3">
        <Input size="sm" iconLeft="search" placeholder="Vorlage suchen …" value={props.query} onChange={(e) => props.onQuery(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <Select
            size="sm"
            value={props.category}
            onChange={(e) => props.onCategory(e.target.value)}
            placeholder="Alle Kategorien"
            options={categories}
          />
          <Select size="sm" value={props.sort} onChange={(e) => props.onSort(e.target.value)} options={SORTS} />
        </div>
      </div>

      <div className="flex flex-col gap-1 p-2">
        {newDraftName !== null ? (
          <button
            type="button"
            onClick={() => props.onSelect("new")}
            className={
              "flex items-center gap-3 rounded-md border p-3 text-left " +
              (selectedId === "new" ? "border-edge-brand bg-surface-brand-subtle" : "border-edge")
            }
          >
            <span className="grid h-[30px] w-[30px] flex-none place-items-center rounded-md bg-surface-brand-subtle text-content-brand">
              <Icon name="mail" size={16} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-semibold text-content-brand">{newDraftName || "Neue Vorlage"}</span>
                <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--amber-500)" }} />
              </span>
              <span className="mt-0.5 block text-2xs text-content-muted">Noch nicht gespeichert</span>
            </span>
          </button>
        ) : null}

        {visible.map((t) => {
          const active = t.id === selectedId;
          const inUse = t.usages.length > 0;
          const dirty = dirtyIds.has(t.id);
          const open = expanded.has(t.id);
          return (
            <div key={t.id} className="flex flex-col">
              <div
                className={
                  "flex items-center gap-3 rounded-md border p-3 " +
                  (active ? "border-edge-brand bg-surface-brand-subtle" : "border-edge")
                }
              >
                <span
                  className={
                    "grid h-[30px] w-[30px] flex-none place-items-center rounded-md " +
                    (inUse ? "bg-surface-brand-subtle text-content-brand" : "bg-surface-sunken text-content-muted")
                  }
                >
                  <Icon name="mail" size={16} />
                </span>
                <button type="button" onClick={() => props.onSelect(t.id)} className="min-w-0 flex-1 text-left">
                  <span className="flex items-center gap-1.5">
                    <span className={"truncate text-sm font-medium " + (active ? "text-content-brand" : "text-content")}>
                      {t.name}
                    </span>
                    {dirty ? <span className="h-1.5 w-1.5 flex-none rounded-full" style={{ background: "var(--amber-500)" }} /> : null}
                    {t.category ? <Tag>{t.category}</Tag> : null}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-content-muted">{t.subject}</span>
                </button>
                {inUse ? (
                  <button
                    type="button"
                    onClick={() => props.onToggleExpand(t.id)}
                    className="cursor-pointer border-0 bg-transparent p-0"
                    title="Verwendungen"
                  >
                    <Badge tone="brand" icon="workflow">
                      {t.usages.length === 1 ? "In 1 Automation" : `In ${t.usages.length} Automationen`}
                    </Badge>
                  </button>
                ) : (
                  <Badge tone="neutral">Nicht verwendet</Badge>
                )}
                <span className="w-[104px] text-right font-mono text-2xs text-content-muted">Geändert {formatDate(t.updatedAt)}</span>
                <IconButton icon="pencil" label="Bearbeiten" size="sm" onClick={() => props.onSelect(t.id)} />
                <IconButton icon="copy" label="Duplizieren" size="sm" onClick={() => props.onDuplicate(t.id)} />
                <IconButton icon="trash-2" label="Löschen" size="sm" onClick={() => props.onDelete(t.id)} />
              </div>

              {open && inUse ? (
                <div className="ml-[54px] rounded-b-md border border-t-0 border-edge-brand p-3">
                  <p className="mb-1.5 text-2xs font-semibold uppercase tracking-wide text-content-subtle">Verwendet in</p>
                  <div className="flex flex-col gap-1.5">
                    {t.usages.map((u, i) => (
                      <div key={`${u.workflowId}-${i}`} className="flex items-center gap-2">
                        <Link href="/automationen" className="min-w-0 flex-1 truncate text-xs text-content-brand hover:underline">
                          {u.workflowName}
                        </Link>
                        <span className="font-mono text-2xs text-content-subtle">Schritt {u.stepIndex} · E-Mail senden</span>
                        <Badge tone={u.enabled ? "success" : "neutral"}>{u.enabled ? "Aktiv" : "Inaktiv"}</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {visible.length === 0 && newDraftName === null ? (
          total === 0 ? (
            <EmptyState
              icon="mail"
              title="Noch keine E-Mail-Vorlagen"
              description="Legen Sie eine Vorlage an, damit Automationen mit der Aktion „E-Mail senden“ darauf verweisen können."
              action={
                <Button size="sm" iconLeft="plus" onClick={props.onNew}>
                  Neue Vorlage
                </Button>
              }
            />
          ) : (
            <EmptyState compact icon="search" title="Keine Vorlage gefunden" description="Passen Sie Suche oder Kategorie an." />
          )
        ) : null}
      </div>
    </Card>
  );
}
