"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { authClient } from "@kundeo/auth/client";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const data = new FormData(e.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));

    const res =
      mode === "signup"
        ? await authClient.signUp.email({ email, password, name: String(data.get("name")) })
        : await authClient.signIn.email({ email, password, rememberMe });

    setLoading(false);
    if (res.error) {
      setError(res.error.message ?? "Anmeldung nicht möglich. Bitte erneut versuchen.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="flex w-[380px] max-w-full flex-col gap-5">
      <div className="flex flex-col items-center gap-3">
        <Image src="/kundeo-icon.svg" alt="Kundeo" width={44} height={44} priority />
        <h1 className="text-xl font-semibold tracking-tight text-content">
          {mode === "signup" ? "Konto erstellen" : "Anmelden"}
        </h1>
        <p className="text-center text-sm text-content-secondary">
          {mode === "signup"
            ? "Konto für Ihre Kundeo-Instanz einrichten"
            : "Bei Ihrer Kundeo-Instanz anmelden"}
        </p>
      </div>

      <Card padding="lg">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          {mode === "signup" ? (
            <Field label="Name" htmlFor="name">
              <Input id="name" name="name" size="lg" iconLeft="user" required autoComplete="name" />
            </Field>
          ) : null}
          <Field label="E-Mail" htmlFor="email">
            <Input id="email" name="email" type="email" size="lg" iconLeft="mail" required autoComplete="email" />
          </Field>
          <Field label="Passwort" htmlFor="password">
            <Input
              id="password"
              name="password"
              type="password"
              size="lg"
              iconLeft="lock"
              required
              minLength={8}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
            />
          </Field>

          {mode === "login" ? (
            <Checkbox label="Angemeldet bleiben" checked={rememberMe} onChange={(v) => setRememberMe(v)} />
          ) : null}

          {error ? <p className="text-xs text-danger">{error}</p> : null}

          <Button type="submit" size="lg" fullWidth loading={loading} disabled={loading}>
            {mode === "signup" ? "Registrieren" : "Anmelden"}
          </Button>
        </form>

        <p className="mt-4 text-center text-sm text-content-muted">
          {mode === "signup" ? (
            <>
              Bereits ein Konto?{" "}
              <Link href="/login" className="text-link hover:underline">
                Anmelden
              </Link>
            </>
          ) : (
            <>
              Noch kein Konto?{" "}
              <Link href="/signup" className="text-link hover:underline">
                Registrieren
              </Link>
            </>
          )}
        </p>
      </Card>

      <p className="text-center text-2xs text-content-subtle">
        Selbst gehostet · AGPL-3.0 · Daten bleiben in Ihrer Instanz
      </p>
    </div>
  );
}
