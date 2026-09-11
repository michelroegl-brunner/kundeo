"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "@kundeo/auth";
import { ensureActiveOrgId } from "@/lib/session";

export type ActionResult = { ok: boolean; error?: string };

/** The organization roles configured on the Better Auth org plugin. */
type OrgRole = "member" | "admin" | "owner";
const ROLES: OrgRole[] = ["member", "admin", "owner"];
const asRole = (role: string): OrgRole => (ROLES.includes(role as OrgRole) ? (role as OrgRole) : "member");

function message(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

/** Invites a person into the active organization (creates an Invitation; sends
 * email only if the instance has an email sender configured). */
export async function inviteMember(email: string, role: string): Promise<ActionResult> {
  const organizationId = await ensureActiveOrgId();
  if (!organizationId) return { ok: false, error: "Keine aktive Organisation" };
  try {
    await auth.api.createInvitation({
      body: { email: email.trim(), role: asRole(role), organizationId, resend: true },
      headers: await headers(),
    });
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Einladung konnte nicht versendet werden.") };
  }
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  try {
    await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Einladung konnte nicht zurückgezogen werden.") };
  }
}

export async function updateMemberRole(memberId: string, role: string): Promise<ActionResult> {
  const organizationId = await ensureActiveOrgId();
  if (!organizationId) return { ok: false, error: "Keine aktive Organisation" };
  try {
    await auth.api.updateMemberRole({
      body: { memberId, role: asRole(role), organizationId },
      headers: await headers(),
    });
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Rolle konnte nicht geändert werden.") };
  }
}

export async function removeMember(memberIdOrEmail: string): Promise<ActionResult> {
  const organizationId = await ensureActiveOrgId();
  if (!organizationId) return { ok: false, error: "Keine aktive Organisation" };
  try {
    await auth.api.removeMember({
      body: { memberIdOrEmail, organizationId },
      headers: await headers(),
    });
    revalidatePath("/team");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: message(e, "Mitglied konnte nicht entfernt werden.") };
  }
}
