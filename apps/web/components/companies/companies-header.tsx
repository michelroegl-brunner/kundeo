"use client";

import { PageHeader } from "@/components/app-shell";
import { CompanyFormDialog } from "./company-form";
import { createCompany } from "@/app/(app)/companies/actions";

/** Topbar "Firma anlegen" action — always mounted, so the first firm can be created. */
export function CompaniesHeader() {
  return <PageHeader actions={<CompanyFormDialog action={createCompany} />} />;
}
