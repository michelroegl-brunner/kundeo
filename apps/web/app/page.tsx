import { redirect } from "next/navigation";

// The app has no public marketing page in-repo; send everyone to the CRM,
// which redirects to /login when there is no session.
export default function Home() {
  redirect("/dashboard");
}
