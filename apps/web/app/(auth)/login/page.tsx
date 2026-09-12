import { redirect } from "next/navigation";
import { authFeatures } from "@kundeo/auth";
import { AuthScreen } from "@/components/auth-screen";
import { getSession } from "@/lib/session";
import { safeInternalPath } from "@/lib/safe-redirect";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>;
}) {
  const dest = safeInternalPath((await searchParams).redirect) ?? "/dashboard";
  if (await getSession()) redirect(dest);
  return <AuthScreen mode="login" entraEnabled={authFeatures.entra} callbackURL={dest} />;
}
