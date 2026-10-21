export type EmailMessage = {
  to: string;
  senderName: string;
  subject: string;
  html: string;
  text: string;
};

export type SmsMessage = {
  /** E.164 */
  to: string;
  body: string;
  alphaSender?: string;
};

// Both providers throw on failure.
export interface EmailProvider {
  name: string;
  send(msg: EmailMessage): Promise<{ providerMessageId: string }>;
}

export interface SmsProvider {
  name: string;
  send(msg: SmsMessage): Promise<{ providerMessageId: string; segments: number }>;
}
