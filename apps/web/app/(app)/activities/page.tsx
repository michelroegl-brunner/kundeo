import { scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { ActivitiesView, type FeedRow, type TaskRow } from "@/components/activities/activities-view";

export const dynamic = "force-dynamic";

type ActivityKind = "NOTE" | "CALL" | "EMAIL" | "MEETING" | "TASK";

function fmtDateTime(value: Date): string {
  return value.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ActivitiesPage() {
  const { activities, members } = await scoped(async (db) => {
    const [activities, members] = await Promise.all([
      db.activity.findMany({
        include: {
          contact: { select: { firstName: true, lastName: true } },
          deal: { select: { title: true } },
        },
        orderBy: { createdAt: "desc" },
      }),
      db.member.findMany({ include: { user: { select: { id: true, name: true } } } }),
    ]);
    return { activities, members };
  });

  if (activities.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="activity"
          title="Noch keine Aktivitäten"
          description="Notizen, Anrufe, Termine und Aufgaben aus der gesamten Organisation erscheinen hier."
        />
      </Card>
    );
  }

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const now = Date.now();

  const tasks: TaskRow[] = activities
    .filter((a) => a.type === "TASK")
    .map((a) => ({
      id: a.id,
      subject: a.subject,
      context: a.deal?.title ?? (a.contact ? `${a.contact.firstName} ${a.contact.lastName}` : ""),
      dueLabel: a.dueAt ? formatDate(a.dueAt) : "",
      overdue: a.dueAt ? a.dueAt.getTime() < now && !a.completedAt : false,
      done: a.completedAt != null,
      owner: (a.authorId && nameById.get(a.authorId)) || "",
    }));

  const feed: FeedRow[] = activities.map((a) => ({
    id: a.id,
    type: a.type as ActivityKind,
    subject: a.subject,
    body: a.body ?? undefined,
    author: (a.authorId && nameById.get(a.authorId)) || undefined,
    timestamp: fmtDateTime(a.createdAt),
  }));

  return <ActivitiesView tasks={tasks} feed={feed} />;
}
