/**
 * Email sending behind a swappable interface (per CLAUDE.md: external
 * dependencies sit behind an interface so self-host uses a simple default and a
 * hosted edition swaps the implementation via config, not code).
 *
 * Three transports, selected by env (`KUNDEO_EMAIL_PROVIDER`, or auto-detected
 * from which credentials are present):
 *  - **log** (default): no config; records the mail to the run log / console so
 *    a fresh self-host instance runs automations end to end with no mail server.
 *  - **smtp**: external SMTP via nodemailer (host/port/user/pass) — works with
 *    any provider, including Microsoft 365 SMTP.
 *  - **m365**: Microsoft 365 through the Graph API with an app registration
 *    (client-credentials OAuth), the modern path as basic-auth SMTP is retired.
 *
 * All network transports are dispatched from the engine's post-commit outbox,
 * never inside a run's database transaction.
 */

/** A binary attachment (e.g. a FreeFinance offer/invoice PDF). */
export interface EmailAttachment {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface EmailMessage {
  organizationId: string;
  to: string;
  subject: string;
  /** Plain-text body (the template body with tokens substituted). */
  text: string;
  /** Optional HTML body (the Markdown template rendered). Sent when present. */
  html?: string;
  /** The named template the automation selected, for the log line. */
  templateName?: string;
  /** Optional file attachments (e.g. a document PDF). */
  attachments?: EmailAttachment[];
}

/** Which transport this process would use — for UI notices (e.g. the log warning). */
export type EmailProvider = "log" | "smtp" | "m365";

export interface EmailResult {
  /** true = handed to a transport; false = recorded only (no transport). */
  delivered: boolean;
  /** Plain-German detail for the run-step message. */
  detail: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailResult>;
}

const env = (k: string): string | undefined => {
  const v = process.env[k];
  return v && v.trim() ? v.trim() : undefined;
};

/** Default sender: no SMTP required. Records the mail without delivering it. */
class LogEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<EmailResult> {
    const att = message.attachments?.length ? ` attachments=${message.attachments.map((a) => `${a.filename}(${a.bytes.byteLength}B)`).join(",")}` : "";
    console.info(
      `[email:log] org=${message.organizationId} to=${message.to} ` +
        `template=${message.templateName ?? "—"} subject=${JSON.stringify(message.subject)}${att}`,
    );
    return { delivered: false, detail: "E-Mail im Protokoll vermerkt (kein E-Mail-Versand konfiguriert)" };
  }
}

/** External SMTP via nodemailer. Config from KUNDEO_SMTP_* env. */
class SmtpEmailSender implements EmailSender {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private transport: any;
  constructor(
    private readonly cfg: { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string },
  ) {}

  private async ensureTransport() {
    if (this.transport) return this.transport;
    const nodemailer = await import("nodemailer");
    this.transport = nodemailer.createTransport({
      host: this.cfg.host,
      port: this.cfg.port,
      secure: this.cfg.secure,
      auth: this.cfg.user ? { user: this.cfg.user, pass: this.cfg.pass } : undefined,
    });
    return this.transport;
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    const transport = await this.ensureTransport();
    await transport.sendMail({
      from: this.cfg.from,
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.attachments?.length
        ? { attachments: message.attachments.map((a) => ({ filename: a.filename, content: Buffer.from(a.bytes), contentType: a.contentType })) }
        : {}),
    });
    return { delivered: true, detail: `E-Mail über SMTP an ${message.to} gesendet` };
  }
}

/** Microsoft 365 via Graph sendMail with an app (client-credentials OAuth). */
class M365GraphEmailSender implements EmailSender {
  private token: { value: string; expiresAt: number } | null = null;
  constructor(
    private readonly cfg: { tenantId: string; clientId: string; clientSecret: string; sender: string },
  ) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    });
    const res = await fetch(`https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) throw new Error(`M365 Token-Anfrage fehlgeschlagen (${res.status})`);
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
    return this.token.value;
  }

  async send(message: EmailMessage): Promise<EmailResult> {
    const token = await this.accessToken();
    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.cfg.sender)}/sendMail`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            subject: message.subject,
            body: message.html
              ? { contentType: "HTML", content: message.html }
              : { contentType: "Text", content: message.text },
            toRecipients: [{ emailAddress: { address: message.to } }],
            ...(message.attachments?.length
              ? {
                  attachments: message.attachments.map((a) => ({
                    "@odata.type": "#microsoft.graph.fileAttachment",
                    name: a.filename,
                    contentType: a.contentType,
                    contentBytes: Buffer.from(a.bytes).toString("base64"),
                  })),
                }
              : {}),
          },
          saveToSentItems: false,
        }),
      },
    );
    if (!res.ok) throw new Error(`Microsoft 365 sendMail fehlgeschlagen (${res.status})`);
    return { delivered: true, detail: `E-Mail über Microsoft 365 an ${message.to} gesendet` };
  }
}

/** Resolve the configured provider, or auto-detect from present credentials. */
function resolveSender(): EmailSender {
  const explicit = (env("KUNDEO_EMAIL_PROVIDER") ?? "").toLowerCase();
  const m365 = {
    tenantId: env("KUNDEO_M365_TENANT_ID"),
    clientId: env("KUNDEO_M365_CLIENT_ID"),
    clientSecret: env("KUNDEO_M365_CLIENT_SECRET"),
    sender: env("KUNDEO_M365_SENDER"),
  };
  const smtpHost = env("KUNDEO_SMTP_HOST");

  const wantM365 = explicit === "m365" || (!explicit && m365.tenantId && m365.clientId && m365.clientSecret && m365.sender);
  if (wantM365) {
    if (!m365.tenantId || !m365.clientId || !m365.clientSecret || !m365.sender) {
      console.warn("[email] KUNDEO_EMAIL_PROVIDER=m365 but M365 credentials incomplete — using log sender");
      return new LogEmailSender();
    }
    return new M365GraphEmailSender({ tenantId: m365.tenantId, clientId: m365.clientId, clientSecret: m365.clientSecret, sender: m365.sender });
  }

  const wantSmtp = explicit === "smtp" || (!explicit && smtpHost);
  if (wantSmtp) {
    if (!smtpHost) {
      console.warn("[email] KUNDEO_EMAIL_PROVIDER=smtp but KUNDEO_SMTP_HOST missing — using log sender");
      return new LogEmailSender();
    }
    const port = Number(env("KUNDEO_SMTP_PORT") ?? "587");
    return new SmtpEmailSender({
      host: smtpHost,
      port: Number.isFinite(port) ? port : 587,
      secure: (env("KUNDEO_SMTP_SECURE") ?? "").toLowerCase() === "true" || port === 465,
      user: env("KUNDEO_SMTP_USER"),
      pass: env("KUNDEO_SMTP_PASS"),
      from: env("KUNDEO_SMTP_FROM") ?? env("KUNDEO_SMTP_USER") ?? "no-reply@localhost",
    });
  }

  return new LogEmailSender();
}

/**
 * Which provider this process would use, without constructing a sender. The
 * settings UI reads this to show the honest "Versandart Protokoll" notice.
 * Mirrors the branching in `resolveSender`.
 */
export function resolveEmailProvider(): EmailProvider {
  const explicit = (env("KUNDEO_EMAIL_PROVIDER") ?? "").toLowerCase();
  const m365Complete = Boolean(
    env("KUNDEO_M365_TENANT_ID") && env("KUNDEO_M365_CLIENT_ID") && env("KUNDEO_M365_CLIENT_SECRET") && env("KUNDEO_M365_SENDER"),
  );
  const smtpHost = env("KUNDEO_SMTP_HOST");

  if (explicit === "m365" || (!explicit && m365Complete)) return m365Complete ? "m365" : "log";
  if (explicit === "smtp" || (!explicit && smtpHost)) return smtpHost ? "smtp" : "log";
  return "log";
}

let sender: EmailSender | null = null;

/** The active email sender for this process (memoized). */
export function getEmailSender(): EmailSender {
  if (!sender) sender = resolveSender();
  return sender;
}

/** Test seam: swap the sender (e.g. a capturing fake) or force re-resolution. */
export function setEmailSender(next: EmailSender | null): void {
  sender = next;
}
