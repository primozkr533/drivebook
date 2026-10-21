import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDealerContext } from "@/server/data/context";
import type { DealerSession } from "@/server/auth/session";

const mocks = vi.hoisted(() => ({
  session: null as DealerSession | null,
  withDealerMutation: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (location: string) => {
    throw new Error(`redirect ${location}`);
  },
}));
vi.mock("@/server/auth/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/auth/session")>()),
  getDealerContextFromSession: async () => mocks.session,
}));
// The real services run; only the write itself is replaced, so "saved nothing" means no mutation was attempted.
vi.mock("@/server/data/mutate", () => ({ withDealerMutation: mocks.withDealerMutation }));

const { DealerReadOnlyError } = await import("@/server/auth/permissions");
const { saveDealerProfile, saveSmsSettings } = await import("@/app/dealer-admin/(app)/settings/dealer/actions");

const ctx = createDealerContext({ id: "d-1", slug: "alpha", status: "active" });

const signIn = (role: "owner" | "salesperson") => {
  mocks.session = { ctx, user: { id: `u-${role}`, email: `${role}@alpha.si`, role }, sessionId: "s" };
};

const form = (entries: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
};

const profile = {
  name: "Avto Novak",
  addressLine: "Celovška 10",
  postalCode: "1000",
  city: "Ljubljana",
  phone: "01 234 56 78",
  email: "info@novak.si",
  googleMapsUrl: "https://maps.app.goo.gl/abc123",
  privacyPolicyUrl: "",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.withDealerMutation.mockResolvedValue(undefined);
  signIn("owner");
});

describe("saveDealerProfile", () => {
  it("saves the Owner's profile and reports it saved", async () => {
    expect(await saveDealerProfile({}, form(profile))).toEqual({ values: profile, saved: true });
    expect(mocks.withDealerMutation).toHaveBeenCalledTimes(1);
    expect(mocks.withDealerMutation.mock.calls[0][2]).toMatchObject({
      action: "dealer.settings.profile.update",
      data: { name: "Avto Novak", phone: "+38612345678", mapsUrl: "https://maps.app.goo.gl/abc123" },
    });
  });

  it.each([
    ["email", "not-an-email"],
    ["googleMapsUrl", "https://example.com/maps"],
  ])("returns the %s field error and saves nothing", async (field, value) => {
    const values = { ...profile, [field]: value };
    expect(await saveDealerProfile({}, form(values))).toEqual({ values, field, error: "invalid" });
    expect(mocks.withDealerMutation).not.toHaveBeenCalled();
  });

  it("a save after a failed attempt drops the previous error", async () => {
    const failed = await saveDealerProfile({}, form({ ...profile, email: "x" }));
    const state = await saveDealerProfile(failed, form(profile));
    expect(state).toEqual({ values: profile, saved: true });
  });

  it("returns forbidden for a Salesperson and saves nothing", async () => {
    signIn("salesperson");
    expect(await saveDealerProfile({}, form(profile))).toEqual({ error: "forbidden" });
    expect(mocks.withDealerMutation).not.toHaveBeenCalled();
  });

  it("returns readOnly when the dealer is restricted", async () => {
    mocks.withDealerMutation.mockRejectedValue(new DealerReadOnlyError());
    expect(await saveDealerProfile({}, form(profile))).toMatchObject({ error: "readOnly" });
  });

  it("redirects to login without a session", async () => {
    mocks.session = null;
    await expect(saveDealerProfile({}, form(profile))).rejects.toThrow(/redirect .*login/);
    expect(mocks.withDealerMutation).not.toHaveBeenCalled();
  });
});

describe("saveSmsSettings", () => {
  const sms = { smsSenderName: "Novak", smsNotificationsEnabled: "on", notificationPhone: "041 555 218" };

  it("saves the SMS settings with the switch mapped to a boolean", async () => {
    expect(await saveSmsSettings({}, form(sms))).toEqual({ values: sms, saved: true });
    expect(mocks.withDealerMutation.mock.calls[0][2]).toMatchObject({
      action: "dealer.settings.sms.update",
      data: { smsSenderName: "Novak", smsNotificationsEnabled: true, notificationPhone: "+38641555218" },
    });
  });

  it("treats a missing switch as off", async () => {
    const values = { smsSenderName: "", smsNotificationsEnabled: "", notificationPhone: "" };
    expect(await saveSmsSettings({}, form({}))).toEqual({ values, saved: true });
    expect(mocks.withDealerMutation.mock.calls[0][2]).toMatchObject({ data: { smsNotificationsEnabled: false } });
  });

  it("rejects a 12-character sender and saves nothing", async () => {
    const values = { ...sms, smsSenderName: "AvtoNovak12" + "3" };
    expect(await saveSmsSettings({}, form(values))).toEqual({ values, field: "smsSenderName", error: "too_long" });
    expect(mocks.withDealerMutation).not.toHaveBeenCalled();
  });

  it("returns forbidden for a Salesperson and saves nothing", async () => {
    signIn("salesperson");
    expect(await saveSmsSettings({}, form(sms))).toEqual({ error: "forbidden" });
    expect(mocks.withDealerMutation).not.toHaveBeenCalled();
  });
});
