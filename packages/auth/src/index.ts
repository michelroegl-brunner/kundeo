import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "@kundeo/db";

/**
 * Microsoft Entra ID (Azure AD) login is enabled only when all three vars are
 * set. A self-host instance with none of them configured boots with
 * email/password exactly as before — the feature is additive and off by default.
 *
 * `tenantId` MUST be a tenant GUID or verified domain, never "common": "common"
 * would let any Microsoft account worldwide complete the flow (and, on
 * self-host, auto-create an org). The single-tenant lock is mandatory.
 */
const entra = {
  clientId: process.env.ENTRA_CLIENT_ID,
  clientSecret: process.env.ENTRA_CLIENT_SECRET,
  tenantId: process.env.ENTRA_TENANT_ID,
};
const entraEnabled = Boolean(entra.clientId && entra.clientSecret && entra.tenantId);

/** Feature flags for the UI (server-only; surface to clients via props). */
export const authFeatures = { entra: entraEnabled };

/**
 * Better Auth server instance. Owns the user/session/account/verification and
 * organization/member/invitation tables (see @kundeo/db schema).
 *
 * The `organization` plugin is the tenant boundary: a signed-in user belongs to
 * one or more organizations, and the active org is stored on the session as
 * `activeOrganizationId`. Request handlers read that and pass it to withOrg().
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    // Self-hosters without SMTP configured can start with this off.
    requireEmailVerification: false,
  },
  account: {
    accountLinking: {
      // Entra asserts the email and we single-tenant-lock, so an Entra login is
      // safe to auto-link to an existing same-email user. Never add an untrusted
      // provider here.
      enabled: true,
      trustedProviders: ["microsoft"],
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  socialProviders: entraEnabled
    ? {
        microsoft: {
          clientId: entra.clientId!,
          clientSecret: entra.clientSecret!,
          tenantId: entra.tenantId!,
          authority: "https://login.microsoftonline.com",
          // Force account choice rather than silently reusing a cached one.
          prompt: "select_account",
          // Skip the Graph profile-photo fetch: it returns a base64 blob that can
          // blow HTTP header limits. (The small `picture` claim is kept as image.)
          disableProfilePhoto: true,
          // Entra managed users may omit the `email` claim; the provider's default
          // mapping leaves email undefined in that case, which fails our unique,
          // required User.email. Fall back to the UPN-style preferred_username.
          mapProfileToUser: (profile) => ({
            email: profile.email ?? profile.preferred_username,
          }),
        },
      }
    : undefined,
  plugins: [
    organization({
      // A user always operates inside an organization; creating one on signup
      // keeps both self-host (single org) and hosted (many orgs) simple.
      allowUserToCreateOrganization: true,
      organizationLimit: 10,
      creatorRole: "owner",
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
