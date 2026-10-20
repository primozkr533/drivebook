import { prerender } from "react-dom/static";
import { createTranslator } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetConfigForTests } from "@/lib/config";
import { messages } from "./i18n";
import type { DevOutboxMessage } from "@/server/notify/outbox";

vi.mock("next-intl/server", () => ({
  getRequestConfig: <T>(fn: T) => fn,
  getTranslations: async (namespace: "inbox") => {
    const { messages } = await import("./i18n");
    return createTranslator({ locale: "sl", messages, namespace });
  },
}));

const rows: DevOutboxMessage[] = [];
vi.mock("@/server/notify/outbox", () => ({ listDevOutbox: vi.fn(async () => rows) }));

const { default: DevInboxPage } = await import("@/app/dev/inbox/page");
const { splitLinks } = await import("@/app/dev/inbox/TextBody");

const inbox = messages.inbox;

async function render() {
  const { prelude } = await prerender(await DevInboxPage());
  return new Response(prelude).text();
}

const count = (html: string, needle: string) => html.split(needle).length - 1;

beforeEach(() => {
  rows.length = 0;
  vi.stubEnv("BASE_DOMAIN", "drivebook.localhost");
  vi.stubEnv("PUBLIC_URL_SCHEME", "http");
  vi.stubEnv("PUBLIC_URL_PORT", "3000");
  resetConfigForTests();
});

afterEach(() => {
  vi.unstubAllEnvs();
  resetConfigForTests();
});

describe("dev inbox page", () => {
  it("renders each message with channel, recipient, sender, subject, Ljubljana time and linked body", async () => {
    rows.push(
      {
        id: "a",
        channel: "email",
        recipient: "kupec@example.si",
        sender: "Avto Demo",
        subject: "Povabilo v DriveBook",
        textBody: "Nastavite geslo: http://app.drivebook.localhost:3000/set-password?token=abc.\nHvala.",
        htmlBody: "<p>Živjo</p>",
        createdAt: new Date("2026-10-20T08:05:00Z"),
      },
      {
        id: "b",
        channel: "sms",
        recipient: "+38641000000",
        sender: "AvtoDemo",
        subject: null,
        textBody: "Vaša testna vožnja je potrjena.",
        htmlBody: null,
        createdAt: new Date("2026-01-05T23:30:00Z"),
      },
    );
    const html = await render();

    expect(html).toContain(`>${inbox.title}</h1>`);
    expect(count(html, 'data-testid="inbox-message"')).toBe(2);
    expect(count(html, 'data-testid="inbox-link"')).toBe(1);
    expect(html).toContain('href="/_dev/app/set-password?token=abc"');
    expect(html).toContain(">http://app.drivebook.localhost:3000/set-password?token=abc</a>");
    expect(html).toContain(inbox.channel.email);
    expect(html).toContain(inbox.channel.sms);
    expect(html).toContain("kupec@example.si");
    expect(html).toContain("Avto Demo");
    expect(html).toContain("Povabilo v DriveBook");
    expect(html).toContain(inbox.noSubject);
    expect(html).toContain("20. 10. 2026 10:05");
    expect(html).toContain("6. 1. 2026 00:30");
    expect(count(html, inbox.showHtml)).toBe(1);
    expect(html).not.toContain("<iframe");
  });

  it("shows the empty state", async () => {
    const html = await render();
    expect(html).toContain(inbox.empty);
    expect(html).not.toContain('data-testid="inbox-message"');
  });
});

describe("splitLinks", () => {
  it("separates URLs from text and keeps trailing punctuation as text", () => {
    expect(splitLinks("Glej https://drivebook.si/x?a=1). Konec")).toEqual([
      { kind: "text", value: "Glej " },
      { kind: "link", value: "https://drivebook.si/x?a=1" },
      { kind: "text", value: ")." },
      { kind: "text", value: " Konec" },
    ]);
    expect(splitLinks("brez povezav")).toEqual([{ kind: "text", value: "brez povezav" }]);
  });
});
