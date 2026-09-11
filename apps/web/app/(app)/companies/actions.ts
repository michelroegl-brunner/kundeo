"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { scoped } from "@/lib/session";
import { emitEvent } from "@/lib/automations/events";

function clean(v: FormDataEntryValue | null): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length ? s : null;
}

function companyInput(formData: FormData) {
  return {
    name: clean(formData.get("name")) ?? "",
    domain: clean(formData.get("domain")),
    industry: clean(formData.get("industry")),
    vatId: clean(formData.get("vatId")),
    street: clean(formData.get("street")),
    postalCode: clean(formData.get("postalCode")),
    city: clean(formData.get("city")),
    country: clean(formData.get("country")) ?? "DE",
    phone: clean(formData.get("phone")),
    website: clean(formData.get("website")),
    notes: clean(formData.get("notes")),
  };
}

export async function createCompany(formData: FormData) {
  const input = companyInput(formData);
  const company = await scoped((db, organizationId) =>
    db.company.create({ data: { ...input, organizationId } }),
  );
  await emitEvent("company.created", { type: "Company", id: company.id });
  revalidatePath("/companies");
  redirect("/companies");
}

export async function updateCompany(id: string, formData: FormData) {
  const input = companyInput(formData);
  await scoped((db) => db.company.update({ where: { id }, data: input }));
  await emitEvent("company.updated", { type: "Company", id });
  revalidatePath("/companies");
  revalidatePath(`/companies/${id}`);
  redirect("/companies");
}

export async function deleteCompany(id: string) {
  await scoped((db) => db.company.delete({ where: { id } }));
  revalidatePath("/companies");
  redirect("/companies");
}
