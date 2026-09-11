import { redirect } from "next/navigation";
import { AuthScreen } from "@/components/auth-screen";
import { getSession } from "@/lib/session";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  return <AuthScreen mode="login" />;
}
