import { devOutbox } from "@/db/schema";
import { db } from "@/server/data/db";

export type DevOutboxRow = {
  channel: "sms" | "email";
  recipient: string;
  sender: string;
  subject?: string | null;
  textBody: string;
  htmlBody?: string | null;
};

export async function insertDevOutbox(row: DevOutboxRow): Promise<{ id: string }> {
  const [inserted] = await db()
    .insert(devOutbox)
    .values({
      channel: row.channel,
      recipient: row.recipient,
      sender: row.sender,
      subject: row.subject ?? null,
      textBody: row.textBody,
      htmlBody: row.htmlBody ?? null,
    })
    .returning({ id: devOutbox.id });
  return inserted;
}
