"use client";

import { PageHeader } from "@/components/app-shell";
import { ContactFormDialog } from "./contact-form";
import { createContact } from "@/app/(app)/contacts/actions";

/** Topbar "Kontakt anlegen" action — always mounted, so the first contact can be created. */
export function ContactsHeader({ companies }: { companies: { id: string; name: string }[] }) {
  return <PageHeader actions={<ContactFormDialog action={createContact} companies={companies} />} />;
}
