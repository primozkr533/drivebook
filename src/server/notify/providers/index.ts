import { getConfig, type Config } from "@/lib/config";
import { createBrevoProvider } from "./brevo";
import { createFakeEmailProvider, createFakeSmsProvider } from "./fake";
import { createTwilioProvider } from "./twilio";
import type { EmailProvider, SmsProvider } from "./types";

export type { EmailMessage, EmailProvider, SmsMessage, SmsProvider } from "./types";
export { countSmsSegments } from "./segments";

function forceFake(config: Config): boolean {
  return config.appEnv === "test" || config.notifyFake;
}

export function getEmailProvider(config: Config = getConfig()): EmailProvider {
  if (forceFake(config) || !config.brevo) return createFakeEmailProvider();
  return createBrevoProvider(config.brevo);
}

export function getSmsProvider(config: Config = getConfig()): SmsProvider {
  if (forceFake(config) || !config.twilio) return createFakeSmsProvider(config.twilio?.fromNumber);
  return createTwilioProvider(config.twilio);
}
