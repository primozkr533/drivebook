import { randomUUID } from "node:crypto";
import { insertDevOutbox } from "../outbox";
import { countSmsSegments } from "./segments";
import { isValidAlphaSender } from "./twilio";
import type { EmailProvider, SmsProvider } from "./types";

const FAKE_SMS_SENDER = "DriveBook";

export function createFakeEmailProvider(): EmailProvider {
  return {
    name: "fake",
    async send(msg) {
      await insertDevOutbox({
        channel: "email",
        recipient: msg.to,
        sender: msg.senderName,
        subject: msg.subject,
        textBody: msg.text,
        htmlBody: msg.html,
      });
      return { providerMessageId: `fake-${randomUUID()}` };
    },
  };
}

export function createFakeSmsProvider(fromNumber?: string): SmsProvider {
  return {
    name: "fake",
    async send(msg) {
      const sender = isValidAlphaSender(msg.alphaSender) ? msg.alphaSender : (fromNumber ?? FAKE_SMS_SENDER);
      await insertDevOutbox({ channel: "sms", recipient: msg.to, sender, textBody: msg.body });
      return { providerMessageId: `fake-${randomUUID()}`, segments: countSmsSegments(msg.body) };
    },
  };
}
