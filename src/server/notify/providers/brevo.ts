import type { EmailProvider } from "./types";

export const BREVO_URL = "https://api.brevo.com/v3/smtp/email";

export type BrevoConfig = { apiKey: string; senderEmail: string; senderName: string };

export function createBrevoProvider(config: BrevoConfig): EmailProvider {
  return {
    name: "brevo",
    async send(msg) {
      const response = await fetch(BREVO_URL, {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          sender: { email: config.senderEmail, name: msg.senderName || config.senderName },
          to: [{ email: msg.to }],
          subject: msg.subject,
          htmlContent: msg.html,
          textContent: msg.text,
        }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { messageId?: string; message?: string; code?: string }
        | null;
      if (!response.ok) {
        const detail = payload?.message ?? payload?.code ?? response.statusText;
        throw new Error(`Brevo send failed (${response.status}): ${detail}`);
      }
      if (!payload?.messageId) throw new Error("Brevo send failed: response has no messageId");
      return { providerMessageId: payload.messageId };
    },
  };
}
