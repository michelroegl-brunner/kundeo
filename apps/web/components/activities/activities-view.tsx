"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ActivityItem } from "@/components/ui/activity-item";
import { EmptyState } from "@/components/ui/empty-state";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { setTaskDone } from "@/app/(app)/activities/actions";

type ActivityKind = "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";

export interface TaskRow {
  id: string;
  subject: string;
  context: string;
  dueLabel: string;
  overdue: boolean;
  done: boolean;
  owner: string;
}

export interface FeedRow {
  id: string;
  type: ActivityKind;
  subject: string;
  body?: string;
  author?: string;
  timestamp: string;
}

export interface ActivitiesViewProps {
  tasks: TaskRow[];
  feed: FeedRow[];
}

const TYPE_LABELS: Record<ActivityKind, string> = {
  NOTE: "Notiz",
  CALL: "Anruf",
  EMAIL: "E-Mail",
  MEETING: "Termin",
  TASK: "Aufgabe",
};

export function ActivitiesView({ tasks, feed }: ActivitiesViewProps) {
  const [taskState, setTaskState] = useState<TaskRow[]>(tasks);
  useEffect(() => setTaskState(tasks), [tasks]);

  const [tab, setTab] = useState("open");
  const [type, setType] = useState("");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle(id: string, done: boolean) {
    const previous = taskState;
    setTaskState((ts) => ts.map((t) => (t.id === id ? { ...t, done } : t)));
    startTransition(async () => {
      try {
        await setTaskDone(id, done);
      } catch {
        setTaskState(previous);
        setError("Aufgabe konnte nicht aktualisiert werden.");
      }
    });
  }

  const openCount = taskState.filter((t) => !t.done).length;
  const doneCount = taskState.filter((t) => t.done).length;

  const shown = useMemo(
    () => taskState.filter((t) => (tab === "open" ? !t.done : tab === "done" ? t.done : true)),
    [taskState, tab],
  );
  const shownFeed = useMemo(() => (type ? feed.filter((a) => a.type === type) : feed), [feed, type]);

  const tabs = [
    { id: "open", label: "Offen", icon: "list-checks", count: openCount },
    { id: "done", label: "Erledigt", icon: "circle-check", count: doneCount },
    { id: "all", label: "Alle", count: taskState.length },
  ];

  return (
    <>
      <div className="grid grid-cols-[minmax(0,1fr)_340px] items-start gap-4 max-lg:grid-cols-1">
        <div className="flex flex-col gap-4">
          <Tabs tabs={tabs} value={tab} onChange={setTab} />
          <Card padding="none" title="Aufgaben" subtitle="Zugewiesen an mein Team">
            {shown.length ? (
              <div>
                {shown.map((t, i) => (
                  <div
                    key={t.id}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3",
                      i === shown.length - 1 ? "" : "border-b border-edge-subtle",
                    )}
                  >
                    <Checkbox checked={t.done} onChange={(next) => toggle(t.id, next)} />
                    <div className="min-w-0 flex-1">
                      <p
                        className={cn(
                          "font-sans text-sm font-medium text-content",
                          t.done && "line-through opacity-60",
                        )}
                      >
                        {t.subject}
                      </p>
                      {t.context ? <p className="mt-0.5 font-sans text-xs text-content-muted">{t.context}</p> : null}
                    </div>
                    <span className="flex flex-none items-center gap-3">
                      {t.overdue && !t.done ? (
                        <Badge tone="warning" icon="clock">
                          Überfällig
                        </Badge>
                      ) : null}
                      {t.dueLabel ? (
                        <span
                          className={cn(
                            "whitespace-nowrap font-mono text-xs tabular-nums",
                            t.overdue && !t.done ? "text-danger" : "text-content-muted",
                          )}
                        >
                          {t.dueLabel}
                        </span>
                      ) : null}
                      {t.owner ? <Avatar name={t.owner} size="xs" tone="neutral" /> : null}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                compact
                icon="circle-check"
                title="Keine Aufgaben"
                description="In dieser Ansicht ist nichts offen."
              />
            )}
          </Card>
        </div>

        <Card
          title="Verlauf"
          subtitle="Alle Aktivitäten der Organisation"
          actions={
            <Select
              size="sm"
              fullWidth={false}
              placeholder="Alle Typen"
              value={type}
              onChange={(e) => setType(e.target.value)}
              options={(Object.keys(TYPE_LABELS) as ActivityKind[]).map((k) => ({ value: k, label: TYPE_LABELS[k] }))}
              style={{ width: 130 }}
            />
          }
        >
          {shownFeed.length ? (
            shownFeed.map((a, i) => (
              <ActivityItem
                key={a.id}
                type={a.type}
                subject={a.subject}
                body={a.body}
                author={a.author}
                timestamp={a.timestamp}
                last={i === shownFeed.length - 1}
              />
            ))
          ) : (
            <EmptyState
              compact
              icon="activity"
              title="Keine Aktivitäten"
              description="Für diesen Typ ist nichts erfasst."
            />
          )}
        </Card>
      </div>

      {error ? (
        <div className="fixed bottom-6 right-6 z-50">
          <Toast tone="danger" title="Aktualisierung fehlgeschlagen" description={error} onClose={() => setError(null)} />
        </div>
      ) : null}
    </>
  );
}
