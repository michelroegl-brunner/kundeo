/**
 * Email sending behind a swappable interface (per CLAUDE.md: external
 * dependencies sit behind an interface so self-host uses a simple default and a
 * hosted edition swaps the implementation via config, not code).
 *
 * The self-host default records the message to the run log / server console
 * without needing SMTP — a fresh single-instance install can run automations
 * end to end with no external service. When an operator configures a real
 * transport (a hosted edition, or a future SMTP sender), `getEmailSender()`
 * returns that instead; nothing else in the engine changes.
 */

export interface EmailMessage {
  organizationId: string;
  to: string;
  subject: string;
  /** Plain-text body. Rich templates arrive with the email-templates feature. */
  text: string;
  /** The named template the automation selected, for the log line. */
  templateName?: string;
}

export interface EmailResult {
  /** true = handed to a transport; false = recorded only (no transport). */
  delivered: boolean;
  /** Plain-German detail for the run-step message. */
  detail: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<EmailResult>;
}

/**
 * Default sender: no SMTP required. It records the mail (server log) and reports
 * that it was logged rather than delivered, so the run protocol stays truthful
 * on a self-host instance without a configured transport.
 */
class LogEmailSender implements EmailSender {
  async send(message: EmailMessage): Promise<EmailResult> {
    console.info(
      `[email] org=${message.organizationId} to=${message.to} ` +
        `template=${message.templateName ?? "—"} subject=${JSON.stringify(message.subject)}`,
    );
    return {
      delivered: false,
      detail: "E-Mail im Protokoll vermerkt (kein E-Mail-Versand konfiguriert)",
    };
  }
}

let sender: EmailSender | null = null;

/**
 * The active email sender for this process. Today it is always the log sender;
 * this is the single seam a hosted edition or an SMTP add-on overrides.
 */
export function getEmailSender(): EmailSender {
  if (!sender) sender = new LogEmailSender();
  return sender;
}

/** Test seam: swap the sender (e.g. a capturing fake). */
export function setEmailSender(next: EmailSender): void {
  sender = next;
}
