import Image from "next/image";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-6 px-6">
      <Image
        src="/brand/icon.svg"
        alt="Kundeo"
        width={56}
        height={56}
        priority
        className="rounded-2xl"
      />
      <h1 className="text-3xl font-semibold tracking-tight">Kundeo</h1>
      <p className="text-lg text-neutral-600 dark:text-neutral-400">
        Open-Source-CRM für den DACH-Markt. Selbst gehostet oder als gehostete
        Version.
      </p>
      <p className="text-sm" style={{ color: "var(--kundeo-slate)" }}>
        Scaffold ist bereit. Nächster Schritt: Datenbank verbinden und
        Auth-Flow aufsetzen.
      </p>
    </main>
  );
}
