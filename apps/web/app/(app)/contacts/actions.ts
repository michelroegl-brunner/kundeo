"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scoped } from "@/lib/session";

function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function contactInput(formData: FormData) {
  return {
    salutation: clean(formData.get("salutation")),
    title: clean(formData.get("title")),
    firstName: clean(formData.get("firstName")) ?? "",
    lastName: clean(formData.get("lastName")) ?? "",
    email: clean(formData.get("email")),
    phone: clean(formData.get("phone")),
    position: clean(formData.get("position")),
    companyId: clean(formData.get("companyId")),
    notes: clean(formData.get("notes")),
  };
}

export async function createContact(formData: FormData) {
  const input = contactInput(formData);
  await scoped((db, organizationId) =>
    db.contact.create({ data: { ...input, organizationId } }),
  );
  revalidatePath("/contacts");
  redirect("/contacts");
}

export async function updateContact(id: string, formData: FormData) {
  const input = contactInput(formData);
  await scoped((db) => db.contact.update({ where: { id }, data: input }));
  revalidatePath("/contacts");
  revalidatePath(`/contacts/${id}`);
  redirect("/contacts");
}

export async function deleteContact(id: string) {
  await scoped((db) => db.contact.delete({ where: { id } }));
  revalidatePath("/contacts");
  redirect("/contacts");
}
