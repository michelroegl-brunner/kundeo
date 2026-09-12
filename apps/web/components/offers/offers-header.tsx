"use client";

import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";

export function OffersHeader() {
  const router = useRouter();
  return (
    <PageHeader
      actions={
        <Button size="sm" iconLeft="plus" onClick={() => router.push("/offers/new")}>
          Angebot erstellen
        </Button>
      }
    />
  );
}
