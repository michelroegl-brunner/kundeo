# Microsoft Entra ID login (spec)

> Status: **proposed** (not yet implemented). Target: sign in with a Microsoft
> work/school account (Entra ID, formerly Azure AD) alongside the existing
> email/password flow.

Let DACH businesses that already live in Microsoft 365 sign in to Kundeo with
their corporate Entra account — no second password, login governed by their
tenant's Conditional Access / MFA. Self-host-first, additive, env-gated.

## Design decision — social provider now, per-tenant SSO as an additive layer

Better Auth (installed: **1.7.4**) gives two routes to Entra. We build the first
now and leave the second as a hosting-only addition:

1. **Built-in `microsoft` social provider** (`socialProviders.microsoft`) — one
   Entra app registration for the instance, configured from env. Fits the
   self-host model exactly: one org, one admin, one tenant, zero external paid
   service. **This is the spec below.**
2. **`sso` plugin (OIDC), per-org** — each hosted tenant brings *its own* Entra
   tenant, discovered by email domain at sign-in. This is genuinely multi-tenant
   SSO and belongs to the **hosted edition as an additive layer** (see
   [Hosted edition](#hosted-edition-additive-per-tenant-sso)), not core. We do
   not build it now, but nothing here forecloses it.

Rationale (per `CLAUDE.md`): the core feature must work fully on a single
self-hosted instance with no paid dependency. A single app registration keyed by
`ENTRA_TENANT_ID` does that. The per-tenant SSO directory is exactly the kind of
thing "hosting needs but self-host doesn't", so it stays a separate, env-gated
layer rather than a reshape of core auth.

## Scope

**In scope**
- `microsoft` social provider wired into `packages/auth`, gated on env presence.
- "Mit Microsoft anmelden" button on the existing login/signup screen.
- Single-tenant lock (restrict logins to the configured Entra tenant) by default.
- Account linking so an Entra login and an existing email/password user with the
  same verified email resolve to **one** `User`.
- Org assignment for Entra users via the existing `ensureActiveOrgId()` path.
- `.env.example` entries and a short admin setup note.

**Out of scope (this spec)**
- Per-tenant / domain-routed SSO (hosted layer, noted below).
- Provisioning users from Entra groups → Kundeo roles (SCIM / group claims).
- Changing any Prisma table. The existing `account` table already stores OAuth
  links (`providerId`, `accountId`, `idToken`, `accessToken`, …) — **no schema
  change, no migration.**

## Changes by file

### `packages/auth/src/index.ts` — register the provider, gated

The provider is added **only when configured**, so a self-host instance with no
Entra env still boots with email/password exactly as today.

```ts
// read once, near the top
const entra = {
  clientId: process.env.ENTRA_CLIENT_ID,
  clientSecret: process.env.ENTRA_CLIENT_SECRET,
  tenantId: process.env.ENTRA_TENANT_ID, // a GUID or verified domain; NOT "common"
};
const entraEnabled = Boolean(entra.clientId && entra.clientSecret && entra.tenantId);

export const auth = betterAuth({
  // …existing baseURL, secret, database, emailAndPassword, session…
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ["microsoft"], // Entra emails are verified by the IdP
    },
  },
  socialProviders: entraEnabled
    ? {
        microsoft: {
          clientId: entra.clientId!,
          clientSecret: entra.clientSecret!,
          tenantId: entra.tenantId!,        // single-tenant lock (see security)
          authority: "https://login.microsoftonline.com",
          prompt: "select_account",
          // Entra managed users may omit the `email` claim and can send a huge
          // base64 photo. Pin identity to oid/tid and keep email sane.
          mapProfileToUser: (profile) => ({
            email: profile.email ?? profile.preferred_username,
            name: profile.name,
            image: undefined, // discard header-blowing base64 avatar for now
          }),
        },
      }
    : undefined,
});

// Export so the UI can decide whether to render the button (see below).
export const authFeatures = { entra: entraEnabled };
```

Notes:
- Better Auth 1.7 keys Microsoft accounts on the verified **`oid`** claim, not
  `sub`. Since Kundeo has no pre-existing Microsoft accounts, there is no
  `sub → oid` back-migration to worry about.
- `prompt: "select_account"` avoids silent sign-in with the wrong cached account.

### `packages/auth/src/client.ts` — no plugin needed

`signIn.social` is part of the base client; **no new client plugin**. Optionally
re-export the flag for the UI:

```ts
export { authFeatures } from "./index"; // server-only import — see UI note
```

Because `index.ts` imports the Prisma client, it must not be pulled into a client
bundle. Prefer surfacing the flag to the UI via a server component prop (below)
rather than importing `authFeatures` in `"use client"` code.

### `apps/web/components/auth-screen.tsx` — the button

This client component already owns both login and signup. Add a Microsoft button
above the email/password form, shown only when the provider is configured.

```tsx
// entraEnabled is passed down from the server page (see next file)
{entraEnabled && (
  <>
    <button
      type="button"
      onClick={() =>
        authClient.signIn.social({ provider: "microsoft", callbackURL: "/dashboard" })
      }
    >
      Mit Microsoft anmelden
    </button>
    <div className="divider">oder</div>
  </>
)}
```

- German copy: **"Mit Microsoft anmelden"**; divider **"oder"**.
- `callbackURL: "/dashboard"` matches the current post-login `router.push`.
- On error, Better Auth redirects back with an `?error=` param — surface a German
  message ("Anmeldung mit Microsoft fehlgeschlagen").

### `apps/web/app/(auth)/login/page.tsx` + `signup/page.tsx` — pass the flag

These server components read `authFeatures.entra` (safe server-side) and pass
`entraEnabled` into `<AuthScreen />`, keeping the Prisma-bound server module out
of the client bundle.

### `.env.example` — document the vars

```dotenv
# Microsoft Entra ID login (optional; leave unset to disable the button)
# App registration → Overview (client id, tenant id) and Certificates & secrets.
ENTRA_CLIENT_ID=
ENTRA_CLIENT_SECRET=
ENTRA_TENANT_ID=   # your tenant GUID or verified domain — NOT "common"
```

Follows the repo convention: raw `process.env` reads, no env-validation file to
touch. The feature is **off** until all three are set — consistent with how
`KUNDEO_EDITION` is treated as self-host unless explicitly `"hosted"`.

### `apps/web/lib/session.ts` — same-tenant → same-org

`ensureActiveOrgId()` grows a `joinOrCreateSelfHostOrg()` branch so an Entra user
joins the instance's primary org instead of getting a private one. See
[Org assignment](#org-assignment) for the full behaviour and rationale.

## Org assignment

Entra logins flow through `ensureActiveOrgId()` in `apps/web/lib/session.ts`,
which implements **same-tenant → same-org** for self-host:

- **Self-host** (`KUNDEO_EDITION !== "hosted"`): a self-host instance is
  single-tenant (the `ENTRA_TENANT_ID` lock, one company), so its primary org
  *is* the tenant's org. A user who signs in via Entra and has no org yet
  **joins that existing org as a `member`** — a whole company lands in one
  tenant instead of each person getting a private org. The primary org is the
  oldest org that already has a member (`joinOrCreateSelfHostOrg`), which skips a
  seeded/demo org nobody belongs to. When no org exists yet, the caller is the
  first user and bootstraps `"Mein Unternehmen"` as its owner (either sign-in
  path). The join is **gated on an actual Microsoft account** (`providerId
  === "microsoft"`), so an open email/password signup still gets its own org and
  can't auto-join a stranger's data.
- **Hosted**: `ensureActiveOrgId()` never auto-creates or auto-joins; the user
  lands with no org and is bounced to `/login`. Mapping an Entra identity to the
  right existing tenant is part of the hosted SSO layer below.

Why the Entra gate makes the auto-join safe: only accounts from the locked tenant
can authenticate at all, so "any Entra user who reaches this point belongs to the
company" holds. The same auto-join for email/password would be an escalation risk
(open signup), which is why it stays Entra-only.

## Security

- **Single-tenant lock.** Set `tenantId` to the company's tenant GUID, never
  `"common"`. With `"common"` *any* Microsoft account worldwide could complete
  the flow and (self-host) auto-create an org. The env var is mandatory for
  exactly this reason — there is no safe "multi-tenant by default".
- **Account linking is trust-sensitive.** `trustedProviders: ["microsoft"]`
  auto-links an Entra login to an existing same-email user. This is safe only
  because Entra asserts the email and we single-tenant-lock; do **not** add
  untrusted providers to that list.
- **Secret handling.** `ENTRA_CLIENT_SECRET` is an env secret like
  `BETTER_AUTH_SECRET`; it never reaches the client bundle (only `index.ts`, a
  server module, reads it). Entra client secrets expire — document rotation in
  the admin note. (If secret rotation is a pain point for operators, Better Auth
  supports `clientAssertion` / `private_key_jwt` as a later hardening step.)
- No new tenant tables, so **RLS is untouched**. Better Auth's own
  `user`/`account`/`session` tables are written via the RLS-bypassing `prisma`
  singleton as today.
- Worth a `security-review` pass before merge (touches auth + account linking).

## Azure / Entra admin setup (for the operator)

1. Entra admin center → **App registrations** → New registration.
2. Supported account types: **single tenant**.
3. Redirect URI (Web): `${BETTER_AUTH_URL}/api/auth/callback/microsoft`
   (dev: `http://localhost:3000/api/auth/callback/microsoft`).
4. Copy **Application (client) ID** and **Directory (tenant) ID**.
5. **Certificates & secrets** → new client secret → copy the value.
6. API permissions: delegated `openid`, `profile`, `email`, `User.Read` (grant
   admin consent).
7. Set `ENTRA_CLIENT_ID` / `ENTRA_CLIENT_SECRET` / `ENTRA_TENANT_ID` and restart.

The callback path is Better Auth's fixed `/api/auth/callback/microsoft` (the
existing `[...all]` route already handles it — no new route).

## Distribution impact

None beyond env. Docker image, native tarball, and CI are unchanged; the three
`ENTRA_*` vars ride the existing env-based config flow and the feature stays off
when they are absent. No migration to run on start.

## Hosted edition — additive per-tenant SSO (not this spec)

When the hosted edition needs each customer to use their own Entra tenant:

- Use the Better Auth **`sso` plugin** (OIDC), registering one SSO connection per
  org, keyed by the customer's verified email **domain**.
- Store connection config in a per-org row (the `OrgIntegration` +
  `KUNDEO_ENCRYPTION_KEY` AES-GCM pattern already used for FreeFinance fits),
  resolved env-first for self-host, DB-per-tenant for hosted.
- Sign-in becomes domain-routed: user enters email → resolve org → redirect to
  that org's Entra. Org assignment maps the SSO identity to the **existing**
  tenant instead of auto-creating.

This is a separate package/plugin + capability flag, layered on top of — not a
change to — the social provider built here.

## Test plan

- Unit: `mapProfileToUser` handles a managed user with no `email` claim (falls
  back to `preferred_username`) and drops the avatar.
- Manual / Playwright (needs an account **in the locked tenant**): button hidden
  when env unset; full round-trip login; **same-tenant → same-org** (second
  in-tenant user joins the primary org as a member, no new org); same-email
  account linking into one `User`; wrong-tenant account rejected.
- Verify `scoped()` data access works unchanged for an Entra-authenticated
  session (org gets set by `ensureActiveOrgId`).

> **Verified so far (dev):** button render, sign-in handoff to the correct
> tenant/redirect URI/scopes, and the single-tenant lock rejecting a
> cross-tenant account. The full round-trip + join step needs a Microsoft
> account that is a member of `ENTRA_TENANT_ID`'s tenant.

## Open questions

1. Keep avatars? If yes, `mapProfileToUser` must upload the base64 photo to
   storage rather than pass it through (header-size limit). Currently disabled
   via `disableProfilePhoto`.
2. Do we want `domain_hint` prefilled on the sign-in call for a smoother prompt?
3. Self-host with several real orgs: "oldest adopted org" is the primary. If an
   instance intentionally runs multiple orgs, should the join target be
   configurable rather than the oldest?
