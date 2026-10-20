import { afterEach, describe, expect, it, vi } from "vitest";
import { getConfig, resetConfigForTests } from "@/lib/config";
import { BREVO_URL, createBrevoProvider } from "@/server/notify/providers/brevo";
import { getEmailProvider, getSmsProvider } from "@/server/notify/providers";
import { countSmsSegments } from "@/server/notify/providers/segments";
import { createTwilioProvider, isValidAlphaSender, twilioMessagesUrl } from "@/server/notify/providers/twilio";

const originalEnv = process.env;

const ALL_KEYS = {
  TWILIO_ACCOUNT_SID: "AC123",
  TWILIO_AUTH_TOKEN: "token",
  TWILIO_FROM_NUMBER: "+38640123456",
  BREVO_API_KEY: "brevo-key",
  BREVO_SENDER_EMAIL: "noreply@drivebook.si",
  BREVO_SENDER_NAME: "DriveBook",
};

function configWith(env: Record<string, string>) {
  process.env = { ...env } as NodeJS.ProcessEnv;
  resetConfigForTests();
  return getConfig();
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  process.env = originalEnv;
  resetConfigForTests();
  vi.unstubAllGlobals();
});

describe("provider selection", () => {
  it("uses the fake adapters when no keys are set", () => {
    const config = configWith({ APP_ENV: "development" });
    expect(getEmailProvider(config).name).toBe("fake");
    expect(getSmsProvider(config).name).toBe("fake");
  });

  it("uses the real adapters when all keys are set", () => {
    const config = configWith({ APP_ENV: "development", ...ALL_KEYS });
    expect(getEmailProvider(config).name).toBe("brevo");
    expect(getSmsProvider(config).name).toBe("twilio");
  });

  it("uses the fake adapters when keys are set but NOTIFY_FAKE=1", () => {
    const config = configWith({ APP_ENV: "production", AUTH_SECRET: "x".repeat(32), DATABASE_URL: "postgres://x", BASE_DOMAIN: "drivebook.si", NOTIFY_FAKE: "1", ...ALL_KEYS });
    expect(getEmailProvider(config).name).toBe("fake");
    expect(getSmsProvider(config).name).toBe("fake");
  });

  it("uses the fake adapters under APP_ENV=test even with keys", () => {
    const config = configWith({ APP_ENV: "test", ...ALL_KEYS });
    expect(getEmailProvider(config).name).toBe("fake");
    expect(getSmsProvider(config).name).toBe("fake");
  });

  it("falls back per provider when only one provider's keys are complete", () => {
    const { TWILIO_FROM_NUMBER: _omitted, ...partial } = ALL_KEYS;
    const config = configWith({ APP_ENV: "development", ...partial });
    expect(getEmailProvider(config).name).toBe("brevo");
    expect(getSmsProvider(config).name).toBe("fake");
  });

  it("reads getConfig() by default", () => {
    configWith({ APP_ENV: "development", ...ALL_KEYS });
    expect(getEmailProvider().name).toBe("brevo");
  });
});

describe("Brevo adapter", () => {
  const brevo = createBrevoProvider({ apiKey: "brevo-key", senderEmail: "noreply@drivebook.si", senderName: "DriveBook" });
  const msg = { to: "kupec@example.si", senderName: "Avto Demo", subject: "Zadeva", html: "<p>Živjo</p>", text: "Živjo" };

  it("posts to the Brevo API with the api-key header and message body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { messageId: "<abc@brevo>" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(brevo.send(msg)).resolves.toEqual({ providerMessageId: "<abc@brevo>" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(BREVO_URL);
    expect(BREVO_URL).toBe("https://api.brevo.com/v3/smtp/email");
    expect(init.method).toBe("POST");
    expect(init.headers["api-key"]).toBe("brevo-key");
    expect(JSON.parse(init.body)).toEqual({
      sender: { email: "noreply@drivebook.si", name: "Avto Demo" },
      to: [{ email: "kupec@example.si" }],
      subject: "Zadeva",
      htmlContent: "<p>Živjo</p>",
      textContent: "Živjo",
    });
  });

  it("falls back to the configured sender name", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(201, { messageId: "m1" }));
    vi.stubGlobal("fetch", fetchMock);
    await brevo.send({ ...msg, senderName: "" });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).sender.name).toBe("DriveBook");
  });

  it("throws with the provider message on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { code: "unauthorized", message: "Key not found" })));
    await expect(brevo.send(msg)).rejects.toThrow(/Key not found/);
  });
});

describe("Twilio adapter", () => {
  const twilio = createTwilioProvider({ accountSid: "AC123", authToken: "secret", fromNumber: "+38640123456" });
  const ok = (segments: string) => jsonResponse(201, { sid: "SM1", num_segments: segments });
  const formOf = (call: unknown[]) => new URLSearchParams((call[1] as RequestInit).body as string);

  it("validates alphanumeric senders", () => {
    expect(isValidAlphaSender("AvtoDemo")).toBe(true);
    expect(isValidAlphaSender("Avto Demo 1")).toBe(true);
    expect(isValidAlphaSender("12345")).toBe(false);
    expect(isValidAlphaSender("AvtoDemoLjubljana")).toBe(false);
    expect(isValidAlphaSender("Avto-Demo")).toBe(false);
    expect(isValidAlphaSender("Šoferček")).toBe(false);
    expect(isValidAlphaSender("")).toBe(false);
    expect(isValidAlphaSender(undefined)).toBe(false);
  });

  it("sends from a valid alphanumeric sender with basic auth and form encoding", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok("2"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(twilio.send({ to: "+38641000000", body: "Pozdrav", alphaSender: "AvtoDemo" })).resolves.toEqual({
      providerMessageId: "SM1",
      segments: 2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(twilioMessagesUrl("AC123"));
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    expect(init.headers.authorization).toBe(`Basic ${Buffer.from("AC123:secret").toString("base64")}`);
    expect(init.headers["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = formOf(fetchMock.mock.calls[0]);
    expect(form.get("From")).toBe("AvtoDemo");
    expect(form.get("To")).toBe("+38641000000");
    expect(form.get("Body")).toBe("Pozdrav");
  });

  it("uses TWILIO_FROM_NUMBER for an invalid alphanumeric sender", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok("1"));
    vi.stubGlobal("fetch", fetchMock);
    await twilio.send({ to: "+38641000000", body: "Pozdrav", alphaSender: "Avto-Demo d.o.o." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(formOf(fetchMock.mock.calls[0]).get("From")).toBe("+38640123456");
  });

  it("uses TWILIO_FROM_NUMBER when no alphanumeric sender is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok("1"));
    vi.stubGlobal("fetch", fetchMock);
    await twilio.send({ to: "+38641000000", body: "Pozdrav" });
    expect(formOf(fetchMock.mock.calls[0]).get("From")).toBe("+38640123456");
  });

  it.each([21212, 21612])("retries once with the number when Twilio rejects the alpha sender (%i)", async (code) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, { code, message: "Invalid From", status: 400 }))
      .mockResolvedValueOnce(ok("3"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(twilio.send({ to: "+38641000000", body: "Pozdrav", alphaSender: "AvtoDemo" })).resolves.toEqual({
      providerMessageId: "SM1",
      segments: 3,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(formOf(fetchMock.mock.calls[0]).get("From")).toBe("AvtoDemo");
    expect(formOf(fetchMock.mock.calls[1]).get("From")).toBe("+38640123456");
  });

  it("does not retry other errors and throws the provider message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(400, { code: 21211, message: "Invalid 'To' Phone Number" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(twilio.send({ to: "+386", body: "x", alphaSender: "AvtoDemo" })).rejects.toThrow(/Invalid 'To' Phone Number/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws when the number retry also fails", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => jsonResponse(400, { code: 21212, message: "Invalid From" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(twilio.send({ to: "+38641000000", body: "x", alphaSender: "AvtoDemo" })).rejects.toThrow(/21212/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("countSmsSegments", () => {
  it("counts GSM-7 messages at 160 / 153", () => {
    expect(countSmsSegments("")).toBe(1);
    expect(countSmsSegments("a".repeat(160))).toBe(1);
    expect(countSmsSegments("a".repeat(161))).toBe(2);
    expect(countSmsSegments("a".repeat(306))).toBe(2);
    expect(countSmsSegments("a".repeat(307))).toBe(3);
  });

  it("counts GSM-7 extension characters as two septets", () => {
    expect(countSmsSegments("€".repeat(80))).toBe(1);
    expect(countSmsSegments("€".repeat(81))).toBe(2);
  });

  it("switches to UCS-2 at 70 / 67 for Slovenian č, š, ž", () => {
    expect(countSmsSegments("č" + "a".repeat(69))).toBe(1);
    expect(countSmsSegments("č" + "a".repeat(70))).toBe(2);
    expect(countSmsSegments("š".repeat(134))).toBe(2);
    expect(countSmsSegments("ž".repeat(135))).toBe(3);
  });
});
