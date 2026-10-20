import { eq } from "drizzle-orm";
import { PgBoss, type Job, type SendOptions } from "pg-boss";
import { messageLog } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { db } from "@/server/data/db";
import { getEmailProvider, getSmsProvider, type EmailMessage, type SmsMessage } from "./providers";

export const EMAIL_QUEUE = "notify.email";
export const SMS_QUEUE = "notify.sms";
export const RETRY_LIMIT = 3;

const RETRY_OPTIONS = { retryLimit: RETRY_LIMIT, retryBackoff: true, retryDelay: 10 } satisfies SendOptions;
const PENDING_PROVIDER = "pending";

export type SendEmailInput = EmailMessage & { dealerId?: string | null; template: string };
export type SendSmsInput = SmsMessage & { dealerId?: string | null; template: string };

export type EmailJobData = { logId: string; payload: EmailMessage };
export type SmsJobData = { logId: string; payload: SmsMessage };
export type NotifyJob<T> = Pick<Job<T>, "data" | "retryCount">;

export type NotifyBoss = Pick<PgBoss, "send">;

export function createBoss(connectionString: string, options: { worker?: boolean } = {}): PgBoss {
  // Only the worker runs pg-boss maintenance; the web server just enqueues.
  const boss = new PgBoss({ connectionString, supervise: options.worker ?? false, schedule: false });
  boss.on("error", (error) => console.error("[notify] pg-boss error", error));
  return boss;
}

export async function ensureQueues(boss: PgBoss): Promise<void> {
  await boss.createQueue(EMAIL_QUEUE, RETRY_OPTIONS);
  await boss.createQueue(SMS_QUEUE, RETRY_OPTIONS);
}

function bossUrl(): string {
  const config = getConfig();
  return config.appEnv === "test" ? config.testDatabaseUrl : config.databaseUrl;
}

let bossPromise: Promise<NotifyBoss> | undefined;
let bossOverride: NotifyBoss | undefined;

export function getBoss(): Promise<NotifyBoss> {
  if (bossOverride) return Promise.resolve(bossOverride);
  bossPromise ??= (async () => {
    const boss = createBoss(bossUrl());
    await boss.start();
    await ensureQueues(boss);
    return boss;
  })().catch((error) => {
    bossPromise = undefined;
    throw error;
  });
  return bossPromise;
}

export function setBossForTests(boss: NotifyBoss | undefined): void {
  bossOverride = boss;
}

export async function stopBossForTests(): Promise<void> {
  const pending = bossPromise;
  bossPromise = undefined;
  if (pending) await ((await pending) as PgBoss).stop({ graceful: false });
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function markFailed(logId: string, error: unknown, provider?: string): Promise<void> {
  await db()
    .update(messageLog)
    .set({ status: "failed", error: errorText(error), ...(provider ? { provider } : {}), updatedAt: new Date() })
    .where(eq(messageLog.id, logId));
}

async function enqueue(
  row: { channel: "email" | "sms"; dealerId?: string | null; template: string; recipient: string; payload: object },
  queue: string,
  jobPayload: EmailMessage | SmsMessage,
): Promise<void> {
  let logId: string | undefined;
  try {
    const [inserted] = await db()
      .insert(messageLog)
      .values({
        channel: row.channel,
        dealerId: row.dealerId ?? null,
        template: row.template,
        recipient: row.recipient,
        provider: PENDING_PROVIDER,
        status: "queued",
        payload: row.payload,
      })
      .returning({ id: messageLog.id });
    logId = inserted.id;
    const boss = await getBoss();
    await boss.send(queue, { logId, payload: jobPayload }, RETRY_OPTIONS);
  } catch (error) {
    console.error(`[notify] Could not queue ${row.channel} "${row.template}"`, error);
    if (logId) await markFailed(logId, error).catch((e) => console.error("[notify] Could not mark message failed", e));
  }
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const { dealerId, template, ...payload } = input;
  // Bodies may carry single-use links, so the log keeps only the subject.
  await enqueue({ channel: "email", dealerId, template, recipient: payload.to, payload: { subject: payload.subject } }, EMAIL_QUEUE, payload);
}

export async function sendSms(input: SendSmsInput): Promise<void> {
  const { dealerId, template, ...payload } = input;
  await enqueue({ channel: "sms", dealerId, template, recipient: payload.to, payload: {} }, SMS_QUEUE, payload);
}

async function recordAttemptError(logId: string, provider: string, error: unknown, retryCount: number): Promise<void> {
  if (retryCount >= RETRY_LIMIT) {
    await markFailed(logId, error, provider);
    return;
  }
  await db()
    .update(messageLog)
    .set({ provider, error: errorText(error), updatedAt: new Date() })
    .where(eq(messageLog.id, logId));
}

export async function handleEmailJob(job: NotifyJob<EmailJobData>): Promise<void> {
  const { logId, payload } = job.data;
  const provider = getEmailProvider();
  try {
    const { providerMessageId } = await provider.send(payload);
    await db()
      .update(messageLog)
      .set({ status: "sent", provider: provider.name, providerMessageId, error: null, updatedAt: new Date() })
      .where(eq(messageLog.id, logId));
  } catch (error) {
    await recordAttemptError(logId, provider.name, error, job.retryCount);
    throw error;
  }
}

export async function handleSmsJob(job: NotifyJob<SmsJobData>): Promise<void> {
  const { logId, payload } = job.data;
  const provider = getSmsProvider();
  try {
    const { providerMessageId, segments } = await provider.send(payload);
    await db()
      .update(messageLog)
      .set({ status: "sent", provider: provider.name, providerMessageId, smsSegments: segments, error: null, updatedAt: new Date() })
      .where(eq(messageLog.id, logId));
  } catch (error) {
    await recordAttemptError(logId, provider.name, error, job.retryCount);
    throw error;
  }
}

export async function startNotificationWorker(boss: PgBoss): Promise<void> {
  await ensureQueues(boss);
  await boss.work<EmailJobData>(EMAIL_QUEUE, async (jobs) => {
    for (const job of jobs) await handleEmailJob(job);
  });
  await boss.work<SmsJobData>(SMS_QUEUE, async (jobs) => {
    for (const job of jobs) await handleSmsJob(job);
  });
}

async function drainQueue<T>(boss: PgBoss, queue: string, handler: (job: NotifyJob<T>) => Promise<void>): Promise<number> {
  let processed = 0;
  for (;;) {
    const jobs = await boss.fetch<T>(queue, { batchSize: 50 });
    if (jobs.length === 0) return processed;
    for (const job of jobs) {
      // Retries run back to back here; the worker spaces them out with pg-boss backoff.
      for (let retryCount = 0; retryCount <= RETRY_LIMIT; retryCount++) {
        try {
          await handler({ data: job.data, retryCount });
          break;
        } catch {}
      }
      await boss.complete(queue, job.id);
      processed++;
    }
  }
}

export async function drainNotificationsForTest(): Promise<number> {
  if (getConfig().appEnv !== "test") throw new Error("drainNotificationsForTest is only available in APP_ENV=test");
  const boss = (await getBoss()) as PgBoss;
  return (await drainQueue(boss, EMAIL_QUEUE, handleEmailJob)) + (await drainQueue(boss, SMS_QUEUE, handleSmsJob));
}
