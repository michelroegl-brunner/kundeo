import Image from "next/image";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

/** Terminal error screen for an authorization request we must not redirect. */
export function AuthorizeError({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-sunken p-4">
      <div className="w-[420px] max-w-full">
        <Card>
          <div className="flex flex-col items-center gap-3 text-center">
            <Image src="/kundeo-icon.svg" alt="Kundeo" width={40} height={40} priority />
            <Icon name="triangle-alert" size={22} className="text-danger" />
            <h1 className="text-lg font-semibold tracking-tight text-content">Autorisierung fehlgeschlagen</h1>
            <p className="text-sm text-content-secondary">{message}</p>
          </div>
        </Card>
      </div>
    </div>
  );
}
