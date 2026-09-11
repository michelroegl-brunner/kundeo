import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "@kundeo/db";

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
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
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
