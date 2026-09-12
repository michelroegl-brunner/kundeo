"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { authClient } from "@kundeo/auth/client";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

/** Microsoft logo (the four-square glyph). Lucide has no brand mark. */
function MicrosoftLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export function AuthScreen({
  mode,
  entraEnabled = false,
}: {
  mode: "login" | "signup";
  entraEnabled?: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [entraLoading, setEntraLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(true);

  // The OAuth callback redirects back here with ?error=… on failure.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("error")) {
      setError("Anmeldung mit Microsoft fehlgeschlagen. Bitte erneut versuchen.");
    }
  }, []);

  async function onEntra() {
    setError(null);
    setEntraLoading(true);
    const res = await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: "/dashboard",
    });
    // On success the browser is redirected to Microsoft; we only land here on error.
    if (res?.error) {
      setEntraLoading(false);
      setError("Anmeldung mit Microsoft fehlgeschlagen. Bitte erneut versuchen.");
    }
  }

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
        {entraEnabled ? (
          <div className="mb-4 flex flex-col gap-4">
            <Button
              type="button"
              variant="secondary"
              size="lg"
              fullWidth
              loading={entraLoading}
              disabled={loading || entraLoading}
              onClick={onEntra}
            >
              {!entraLoading ? <MicrosoftLogo /> : null}
              Mit Microsoft anmelden
            </Button>
            <div className="flex items-center gap-3 text-2xs text-content-subtle">
              <span className="h-px flex-1 bg-edge" />
              oder
              <span className="h-px flex-1 bg-edge" />
            </div>
          </div>
        ) : null}

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
