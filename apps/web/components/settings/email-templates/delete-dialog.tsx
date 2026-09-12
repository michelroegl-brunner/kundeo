"use client";

import Link from "next/link";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TemplateUsage } from "@/components/settings/email-templates/types";

export type DialogKind = "blocked" | "confirm" | "unsaved";

export interface TemplateDialogProps {
  kind: DialogKind | null;
  name: string;
  usages: TemplateUsage[];
  pending: boolean;
  onClose: () => void;
  onConfirmDelete: () => void;
  onDiscard: () => void;
}

export function TemplateDialog({ kind, name, usages, pending, onClose, onConfirmDelete, onDiscard }: TemplateDialogProps) {
  if (!kind) return null;

  if (kind === "blocked") {
    const n = usages.length;
    return (
      <Dialog
        open
        width={520}
        title="Vorlage wird verwendet"
        description={`„${name}“ ist in ${n} ${n === 1 ? "Automation" : "Automationen"} als E-Mail-Vorlage hinterlegt und kann nicht gelöscht werden.`}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Schließen
            </Button>
            <Link href="/automationen">
              <Button>Automationen öffnen</Button>
            </Link>
          </>
        }
      >
        <p className="mb-3 text-xs leading-normal text-content-secondary">
          Entfernen Sie die Vorlage zuerst aus diesen Schritten oder hinterlegen Sie dort eine andere Vorlage.
        </p>
        <div className="flex flex-col gap-1.5">
          {usages.map((u, i) => (
            <div key={`${u.workflowId}-${i}`} className="flex items-center gap-2 rounded-md border border-edge p-2.5">
              <span className="min-w-0 flex-1 truncate text-sm text-content">{u.workflowName}</span>
              <span className="font-mono text-2xs text-content-subtle">Schritt {u.stepIndex}</span>
              <Badge tone={u.enabled ? "success" : "neutral"}>{u.enabled ? "Aktiv" : "Inaktiv"}</Badge>
            </div>
          ))}
        </div>
      </Dialog>
    );
  }

  if (kind === "confirm") {
    return (
      <Dialog
        open
        width={440}
        title="Vorlage löschen"
        description={`„${name}“ wird dauerhaft entfernt. Die Vorlage ist in keiner Automation hinterlegt.`}
        onClose={onClose}
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Abbrechen
            </Button>
            <Button variant="danger" loading={pending} onClick={onConfirmDelete}>
              Vorlage löschen
            </Button>
          </>
        }
      />
    );
  }

  // unsaved
  return (
    <Dialog
      open
      width={440}
      title="Ungespeicherte Änderungen"
      description={`„${name}“ enthält Änderungen, die noch nicht gespeichert sind.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="danger" onClick={onDiscard}>
            Änderungen verwerfen
          </Button>
          <Button variant="secondary" onClick={onClose}>
            Weiter bearbeiten
          </Button>
        </>
      }
    />
  );
}
