"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Icon } from "@/components/ui/icon";
import { renderString } from "@/lib/email/render-template";
import { renderMarkdown } from "@/lib/email/markdown";
import { sampleTokenValues } from "@/components/settings/email-tokens";
import type { EmailProvider } from "@/lib/email";
import type { PreviewRecord } from "@/components/settings/email-templates/types";

export interface TemplatePreviewProps {
  subject: string;
  body: string;
  emailProvider: EmailProvider;
  previewRecords: PreviewRecord[];
  onTestSend: () => void;
  testing: boolean;
  canTest: boolean;
}

/** The right column: renders the mail with sample or real data, plus test send. */
export function TemplatePreview({
  subject,
  body,
  emailProvider,
  previewRecords,
  onTestSend,
  testing,
  canTest,
}: TemplatePreviewProps) {
  const [useReal, setUseReal] = useState(false);
  const [recordId, setRecordId] = useState<string>(previewRecords[0]?.id ?? "");

  const values = useMemo(() => {
    if (useReal) {
      const rec = previewRecords.find((r) => r.id === recordId) ?? previewRecords[0];
      return rec?.values ?? sampleTokenValues();
    }
    return sampleTokenValues();
  }, [useReal, recordId, previewRecords]);

  const renderedSubject = renderString(subject, values);
  const bodyHtml = useMemo(() => renderMarkdown(renderString(body, values)), [body, values]);
  const to = values["contact.email"] || "—";

  return (
    <Card title="Vorschau" subtitle={useReal ? "Mit echten Daten" : "Mit Beispieldaten"} padding="none">
      <div className="flex flex-col">
        {previewRecords.length ? (
          <div className="flex flex-col gap-2 border-b border-edge-subtle p-4">
            <Switch
              label="Echten Datensatz wählen"
              hint="Ersetzt die Beispielwerte durch einen Datensatz aus Ihrer Organisation"
              checked={useReal}
              onChange={setUseReal}
            />
            {useReal ? (
              <Select
                size="sm"
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                options={previewRecords.map((r) => ({ value: r.id, label: r.label }))}
              />
            ) : null}
          </div>
        ) : null}

        <div className="p-4">
          <div className="overflow-hidden rounded-md border border-edge">
            <div className="flex flex-col gap-1 bg-surface-page px-4 py-3">
              <div className="flex gap-2">
                <span className="w-[52px] text-2xs font-semibold uppercase tracking-wide text-content-subtle">An</span>
                <span className="font-mono text-xs text-content-secondary">{to}</span>
              </div>
              <div className="flex gap-2">
                <span className="w-[52px] text-2xs font-semibold uppercase tracking-wide text-content-subtle">Betreff</span>
                <span className="text-xs font-medium text-content">{renderedSubject || "—"}</span>
              </div>
            </div>
            <div
              className="mail-preview px-4 py-4 text-sm leading-relaxed text-content"
              // Body is Markdown rendered by renderMarkdown, which HTML-escapes all
              // template text first and allows only a safe tag subset.
              dangerouslySetInnerHTML={{ __html: bodyHtml || "<p class='text-content-subtle'>—</p>" }}
            />
          </div>

          {emailProvider === "log" ? (
            <div
              className="mt-4 flex gap-3 rounded-md p-3"
              style={{ background: "var(--surface-warning-subtle)", border: "1px solid var(--amber-500)" }}
            >
              <Icon name="triangle-alert" size={16} color="var(--amber-600)" />
              <p className="text-2xs leading-normal text-content">
                Versandart „Protokoll“ aktiv. Eine Test-E-Mail wird nur ins Protokoll geschrieben — siehe
                KUNDEO_EMAIL_PROVIDER.
              </p>
            </div>
          ) : null}

          <div className="mt-4">
            <Button variant="secondary" iconLeft="send" loading={testing} disabled={!canTest} onClick={onTestSend}>
              Test-E-Mail senden
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
