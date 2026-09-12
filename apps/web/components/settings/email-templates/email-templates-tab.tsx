"use client";

import { useEffect, useMemo, useState } from "react";
import type { ToastProps } from "@/components/ui/toast";
import type { RunFn } from "@/components/settings/settings-view";
import { unknownTokens } from "@/components/settings/email-tokens";
import { formatDate } from "@/lib/format";
import {
  createEmailTemplate,
  updateEmailTemplate,
  duplicateEmailTemplate,
  deleteEmailTemplate,
  sendTestEmail,
} from "@/app/(app)/settings/email-template-actions";
import type { EmailProvider } from "@/lib/email";
import type { EmailTemplateItem, PreviewRecord, TemplateInput } from "@/components/settings/email-templates/types";
import { TemplateList } from "./template-list";
import { TemplateEditor, type Draft, type EditorErrors } from "./template-editor";
import { TemplatePreview } from "./template-preview";
import { TemplateDialog, type DialogKind } from "./delete-dialog";

const EMPTY_DRAFT: Draft = { name: "", category: "", subject: "", body: "", description: "" };
const NEW = "new";

export interface EmailTemplatesTabProps {
  templates: EmailTemplateItem[];
  categories: string[];
  emailProvider: EmailProvider;
  previewRecords: PreviewRecord[];
  pending: boolean;
  run: RunFn;
}

function toDraft(t: EmailTemplateItem): Draft {
  return { name: t.name, category: t.category ?? "", subject: t.subject, body: t.body, description: t.description ?? "" };
}

function toInput(d: Draft): TemplateInput {
  return { name: d.name, category: d.category, subject: d.subject, body: d.body, description: d.description };
}

export function EmailTemplatesTab({ templates, categories, emailProvider, previewRecords, pending, run }: EmailTemplatesTabProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [view, setView] = useState<"visual" | "source">("visual");
  const [errors, setErrors] = useState<EditorErrors>({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("name");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<{ kind: DialogKind; id: string } | null>(null);
  const [selectAfterName, setSelectAfterName] = useState<string | null>(null);

  // First load: select the first template if there is one and nothing is chosen.
  useEffect(() => {
    if (selectedId === null && templates.length) setSelectedId(templates[0]!.id);
  }, [templates, selectedId]);

  // After a create, select the freshly saved template once it arrives in props.
  useEffect(() => {
    if (!selectAfterName) return;
    const match = templates.find((t) => t.name === selectAfterName);
    if (match) {
      setDrafts((d) => {
        const next = { ...d };
        delete next[NEW];
        return next;
      });
      setSelectedId(match.id);
      setSelectAfterName(null);
    }
  }, [templates, selectAfterName]);

  const dirtyIds = useMemo(() => {
    const set = new Set<string>();
    for (const [id, d] of Object.entries(drafts)) {
      if (id === NEW) continue;
      const t = templates.find((x) => x.id === id);
      if (t && JSON.stringify(d) !== JSON.stringify(toDraft(t))) set.add(id);
    }
    return set;
  }, [drafts, templates]);

  const newDraft = drafts[NEW] ?? null;
  const anyDirty = dirtyIds.size > 0 || (newDraft ? JSON.stringify(newDraft) !== JSON.stringify(EMPTY_DRAFT) : false);

  // Guard against losing unsaved drafts on a full page unload.
  useEffect(() => {
    if (!anyDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [anyDirty]);

  const isNew = selectedId === NEW;
  const selectedTemplate = !isNew && selectedId ? templates.find((t) => t.id === selectedId) ?? null : null;
  const original = selectedTemplate ? toDraft(selectedTemplate) : EMPTY_DRAFT;
  const draft = selectedId ? drafts[selectedId] ?? original : null;
  const dirty = selectedId ? (isNew ? JSON.stringify(draft) !== JSON.stringify(EMPTY_DRAFT) : dirtyIds.has(selectedId)) : false;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = templates.filter((t) => {
      if (category && t.category !== category) return false;
      if (!q) return true;
      return (t.name + " " + t.subject + " " + (t.category ?? "")).toLowerCase().includes(q);
    });
    list.sort((a, b) =>
      sort === "updated" ? b.updatedAt.localeCompare(a.updatedAt) : a.name.localeCompare(b.name, "de"),
    );
    return list;
  }, [templates, query, category, sort]);

  function setField(k: keyof Draft, v: string) {
    if (!selectedId) return;
    const base = drafts[selectedId] ?? original;
    const next = { ...base, [k]: v };
    setDrafts((d) => ({ ...d, [selectedId]: next }));
    setErrors((e) => validateField(k, next, e));
  }

  function validateField(k: keyof Draft, d: Draft, prev: EditorErrors): EditorErrors {
    const e = { ...prev };
    if (k === "name") delete e.name;
    if (k === "subject") {
      const u = unknownTokens(d.subject);
      e.subject = u.length ? `Unbekannter Platzhalter {{${u[0]}}} — bitte über „Daten einfügen“ wählen.` : undefined;
    }
    if (k === "body") {
      const u = unknownTokens(d.body);
      e.body = u.length ? `Unbekannter Platzhalter {{${u[0]}}} — bitte über „Daten einfügen“ wählen.` : undefined;
    }
    return e;
  }

  function fullValidate(d: Draft): EditorErrors {
    const e: EditorErrors = {};
    if (!d.name.trim()) e.name = "Bitte einen Namen angeben.";
    else if (nameConflict(d.name)) e.name = "Eine Vorlage mit diesem Namen existiert bereits.";
    if (!d.subject.trim()) e.subject = "Bitte einen Betreff angeben.";
    else if (unknownTokens(d.subject).length) e.subject = `Unbekannter Platzhalter {{${unknownTokens(d.subject)[0]}}} — bitte über „Daten einfügen“ wählen.`;
    if (!d.body.trim()) e.body = "Bitte einen Inhalt angeben.";
    else if (unknownTokens(d.body).length) e.body = `Unbekannter Platzhalter {{${unknownTokens(d.body)[0]}}} — bitte über „Daten einfügen“ wählen.`;
    return e;
  }

  function nameConflict(name: string): boolean {
    const n = name.trim().toLowerCase();
    return templates.some((t) => t.id !== selectedId && t.name.toLowerCase() === n);
  }

  function select(id: string) {
    setSelectedId(id);
    setView("visual");
    setErrors({});
  }

  function onNew() {
    setDrafts((d) => ({ ...d, [NEW]: { ...EMPTY_DRAFT } }));
    setSelectedId(NEW);
    setView("visual");
    setErrors({});
  }

  function onSave() {
    if (!selectedId || !draft) return;
    const errs = fullValidate(draft);
    if (Object.values(errs).some(Boolean)) {
      setErrors(errs);
      return;
    }
    const input = toInput(draft);
    if (isNew) {
      run(
        () => createEmailTemplate(input),
        { tone: "success", title: "Vorlage angelegt" },
        () => setSelectAfterName(input.name),
      );
    } else {
      const id = selectedId;
      run(
        () => updateEmailTemplate(id, input),
        { tone: "success", title: "Vorlage gespeichert" },
        () =>
          setDrafts((d) => {
            const next = { ...d };
            delete next[id];
            return next;
          }),
      );
    }
  }

  function onDiscard() {
    if (!selectedId) return;
    const id = selectedId;
    setErrors({});
    setDrafts((d) => {
      const next = { ...d };
      delete next[id];
      return next;
    });
    if (isNew) setSelectedId(templates[0]?.id ?? null);
  }

  function onDelete(id: string) {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    setDialog({ kind: t.usages.length > 0 ? "blocked" : "confirm", id });
  }

  function confirmDelete() {
    if (!dialog) return;
    const id = dialog.id;
    run(
      () => deleteEmailTemplate(id),
      { tone: "success", title: "Vorlage gelöscht" },
      () => {
        setDrafts((d) => {
          const next = { ...d };
          delete next[id];
          return next;
        });
        if (selectedId === id) setSelectedId(templates.find((t) => t.id !== id)?.id ?? null);
      },
    );
    setDialog(null);
  }

  function onDuplicate(id: string) {
    const t = templates.find((x) => x.id === id);
    run(() => duplicateEmailTemplate(id), {
      tone: "success",
      title: "Kopie angelegt",
      description: t ? `„${t.name} (Kopie)“ steht jetzt zur Auswahl.` : undefined,
    });
  }

  function onTestSend() {
    if (!selectedId || isNew) return;
    const id = selectedId;
    run(() => sendTestEmail(id), (res): ToastProps => {
      const delivered = (res as { delivered?: boolean }).delivered;
      return delivered
        ? { tone: "success", title: "Test-E-Mail gesendet" }
        : {
            tone: "info",
            title: "Test-E-Mail ins Protokoll geschrieben",
            description: "Kein Mailversand konfiguriert — siehe KUNDEO_EMAIL_PROVIDER.",
          };
    });
  }

  const dialogTemplate = dialog ? templates.find((t) => t.id === dialog.id) : undefined;

  const editorSubtitle = isNew
    ? "Noch nicht gespeichert"
    : selectedTemplate
      ? `Zuletzt geändert ${formatDate(selectedTemplate.updatedAt)} · ${
          selectedTemplate.usages.length
            ? `in ${selectedTemplate.usages.length} ${selectedTemplate.usages.length === 1 ? "Automation" : "Automationen"}`
            : "nicht verwendet"
        }`
      : "";

  const list = (
    <TemplateList
      visible={visible}
      total={templates.length}
      categories={categories}
      selectedId={selectedId}
      dirtyIds={dirtyIds}
      newDraftName={newDraft ? newDraft.name : null}
      query={query}
      category={category}
      sort={sort}
      expanded={expanded}
      onQuery={setQuery}
      onCategory={setCategory}
      onSort={setSort}
      onToggleExpand={(id) =>
        setExpanded((s) => {
          const next = new Set(s);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        })
      }
      onNew={onNew}
      onSelect={select}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    />
  );

  const showEditor = selectedId !== null && draft !== null;

  return (
    <>
      {showEditor ? (
        <div className="grid grid-cols-[264px_minmax(0,1fr)] gap-4 max-md:grid-cols-1">
          <div className="max-md:order-1">{list}</div>
          <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-4 max-xl:grid-cols-1 max-md:order-2">
            <TemplateEditor
              draft={draft!}
              isNew={isNew}
              view={view}
              errors={errors}
              categories={categories}
              dirty={dirty}
              pending={pending}
              subtitle={editorSubtitle}
              onView={setView}
              onField={setField}
              onSave={onSave}
              onDiscard={onDiscard}
              onDelete={() => (isNew ? onDiscard() : onDelete(selectedId!))}
            />
            <TemplatePreview
              subject={draft!.subject}
              body={draft!.body}
              emailProvider={emailProvider}
              previewRecords={previewRecords}
              onTestSend={onTestSend}
              testing={pending}
              canTest={!isNew}
            />
          </div>
        </div>
      ) : (
        list
      )}

      <TemplateDialog
        kind={dialog?.kind ?? null}
        name={dialogTemplate?.name ?? ""}
        usages={dialogTemplate?.usages ?? []}
        pending={pending}
        onClose={() => setDialog(null)}
        onConfirmDelete={confirmDelete}
        onDiscard={() => setDialog(null)}
      />
    </>
  );
}
