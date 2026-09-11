import { getSession, scoped } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ContactsList, type ContactRow } from "@/components/contacts/contacts-list";
import { ContactsHeader } from "@/components/contacts/contacts-header";

export const dynamic = "force-dynamic";

export default async function ContactsPage() {
  const session = await getSession();
  const userId = session?.user.id;

  const { contacts, members, companies } = await scoped(async (db) => {
    const [contacts, members, companies] = await Promise.all([
      db.contact.findMany({
        include: {
          company: { select: { name: true, city: true, country: true } },
          tags: { include: { tag: { select: { id: true, name: true, color: true } } } },
        },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      }),
      db.member.findMany({ include: { user: { select: { id: true, name: true } } } }),
      db.company.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { contacts, members, companies };
  });

  if (contacts.length === 0) {
    return (
      <>
        <ContactsHeader companies={companies} />
        <Card>
          <EmptyState
            icon="users"
            title="Noch keine Kontakte"
            description="Sobald Kontakte angelegt sind, erscheinen sie hier als durchsuchbare Liste."
          />
        </Card>
      </>
    );
  }

  const nameById = new Map(members.map((m) => [m.user.id, m.user.name]));
  const weekAgo = Date.now() - 7 * 86_400_000;

  const rows: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    title: c.title,
    firstName: c.firstName,
    lastName: c.lastName,
    position: c.position ?? "",
    company: c.company?.name ?? "",
    city: c.company?.city ?? "",
    country: c.company?.country ?? "",
    email: c.email ?? "",
    ownerName: (c.ownerId && nameById.get(c.ownerId)) || "",
    isMine: c.ownerId === userId,
    isNew: c.createdAt.getTime() >= weekAgo,
    tags: c.tags.map((t) => t.tag),
  }));

  return (
    <>
      <ContactsHeader companies={companies} />
      <ContactsList rows={rows} />
    </>
  );
}
