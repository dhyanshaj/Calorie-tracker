import { randomUUID } from "node:crypto";
import { AppError } from "./errors";
export type MailConfig = { key?: string; from?: string; publicUrl?: string };
export class Mailer {
  constructor(
    private config: MailConfig,
    private fetcher: typeof fetch = fetch,
  ) {}
  get configured() {
    try {
      const url = new URL(this.config.publicUrl ?? "");
      return (
        !!this.config.key &&
        !!this.config.from &&
        url.pathname === "/" &&
        !url.search &&
        !url.hash &&
        !url.username &&
        !url.password &&
        (url.protocol === "https:" ||
          (process.env.NODE_ENV !== "production" &&
            url.protocol === "http:" &&
            ["localhost", "127.0.0.1"].includes(url.hostname)))
      );
    } catch {
      return false;
    }
  }
  async send(to: string, purpose: "verify" | "reset", token: string) {
    if (!this.configured)
      throw new AppError(
        503,
        "EMAIL_NOT_CONFIGURED",
        "Email delivery is not enabled yet. The app owner must configure the email service and public app address.",
      );
    const url = new URL(`/account/${purpose}`, this.config.publicUrl!);
    url.hash = new URLSearchParams({ token }).toString();
    const subject =
      purpose === "verify"
        ? "Verify your Platewise email"
        : "Reset your Platewise password";
    const action = purpose === "verify" ? "Verify email" : "Reset password";
    let response: Response;
    try {
      response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Bearer ${this.config.key}`,
          "Content-Type": "application/json",
          "Idempotency-Key": randomUUID(),
        },
        body: JSON.stringify({
          from: this.config.from,
          to: [to],
          subject,
          html: `<p>${subject}</p><p><a href="${url.href}">${action}</a></p><p>This link expires ${purpose === "verify" ? "in 24 hours" : "in 15 minutes"} and can be used once. If you did not request it, ignore this email.</p>`,
        }),
      });
    } catch {
      throw new AppError(
        502,
        "EMAIL_UNREACHABLE",
        "The email service could not be reached. Please retry shortly.",
      );
    }
    if (!response.ok)
      throw new AppError(
        502,
        "EMAIL_DELIVERY_FAILED",
        "The email service did not accept the message. Please retry or contact the app owner.",
      );
  }
}
