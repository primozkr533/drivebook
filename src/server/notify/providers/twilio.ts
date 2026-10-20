import type { SmsProvider } from "./types";

export type TwilioConfig = { accountSid: string; authToken: string; fromNumber: string };

// 21212: invalid From; 21612: alphanumeric sender not supported for this destination.
const ALPHA_REJECTED_CODES = new Set([21212, 21612]);

export function isValidAlphaSender(value: string | undefined): value is string {
  return value !== undefined && /^[A-Za-z0-9 ]{1,11}$/.test(value) && /[A-Za-z]/.test(value);
}

export function twilioMessagesUrl(accountSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
}

type TwilioResponse = { sid?: string; num_segments?: string | number; code?: number; message?: string };

class TwilioError extends Error {
  constructor(
    readonly status: number,
    readonly code: number | undefined,
    message: string,
  ) {
    super(message);
  }
}

export function createTwilioProvider(config: TwilioConfig): SmsProvider {
  const authorization = `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;

  async function post(to: string, from: string, body: string) {
    const response = await fetch(twilioMessagesUrl(config.accountSid), {
      method: "POST",
      headers: {
        authorization,
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });
    const payload = (await response.json().catch(() => null)) as TwilioResponse | null;
    if (!response.ok) {
      const detail = payload?.message ?? response.statusText;
      throw new TwilioError(
        response.status,
        payload?.code,
        `Twilio send failed (${response.status}${payload?.code ? `, code ${payload.code}` : ""}): ${detail}`,
      );
    }
    if (!payload?.sid) throw new Error("Twilio send failed: response has no sid");
    return { providerMessageId: payload.sid, segments: Number(payload.num_segments ?? 1) || 1 };
  }

  return {
    name: "twilio",
    async send(msg) {
      if (!isValidAlphaSender(msg.alphaSender)) return post(msg.to, config.fromNumber, msg.body);
      try {
        return await post(msg.to, msg.alphaSender, msg.body);
      } catch (error) {
        if (
          error instanceof TwilioError &&
          error.status === 400 &&
          error.code !== undefined &&
          ALPHA_REJECTED_CODES.has(error.code)
        ) {
          return post(msg.to, config.fromNumber, msg.body);
        }
        throw error;
      }
    },
  };
}
