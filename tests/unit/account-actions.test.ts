import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  changePassword: vi.fn(),
  confirmTotpSetup: vi.fn(),
  disableTotp: vi.fn(),
  getAccountSummary: vi.fn(),
  startTotpSetup: vi.fn(),
  requireDealerUser: vi.fn(),
  requireBackofficeUser: vi.fn(),
}));

vi.mock("@/server/auth/account", () => ({
  changePassword: mocks.changePassword,
  confirmTotpSetup: mocks.confirmTotpSetup,
  disableTotp: mocks.disableTotp,
  getAccountSummary: mocks.getAccountSummary,
  startTotpSetup: mocks.startTotpSetup,
}));
vi.mock("@/server/auth/permissions", () => ({
  requireDealerUser: mocks.requireDealerUser,
  requireBackofficeUser: mocks.requireBackofficeUser,
}));

const { changePasswordAction, totpAction } = await import("@/components/auth/account-actions");

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireDealerUser.mockResolvedValue({ ctx: {}, user: { id: "dealer-user" }, sessionId: "s1" });
  mocks.requireBackofficeUser.mockResolvedValue({ user: { id: "bo-user" }, sessionId: "s2" });
});

it("changes the password of the session user, keeping the current session", async () => {
  mocks.changePassword.mockResolvedValue({ ok: true });
  const state = await changePasswordAction(
    "dealer",
    {},
    form({ currentPassword: "old", newPassword: "new-password-1", confirmPassword: "new-password-1", userId: "other" }),
  );
  expect(state).toEqual({ status: "changed" });
  expect(mocks.changePassword).toHaveBeenCalledWith("dealer", "dealer-user", {
    currentPassword: "old",
    newPassword: "new-password-1",
    currentSessionId: "s1",
  });
});

it("rejects a mismatched confirmation without calling the service", async () => {
  const state = await changePasswordAction("backoffice", {}, form({ newPassword: "a", confirmPassword: "b" }));
  expect(state).toEqual({ error: "mismatch" });
  expect(mocks.changePassword).not.toHaveBeenCalled();
});

it("passes service errors through", async () => {
  mocks.changePassword.mockResolvedValue({ ok: false, error: "wrong_password" });
  const state = await changePasswordAction("backoffice", {}, form({ newPassword: "x", confirmPassword: "x" }));
  expect(state).toEqual({ error: "wrong_password" });
  expect(mocks.changePassword.mock.calls[0]![1]).toBe("bo-user");
});

it("starts, confirms and disables TOTP for the session user", async () => {
  mocks.getAccountSummary.mockResolvedValue({ totpEnabled: false });
  mocks.startTotpSetup.mockResolvedValue({ secret: "SECRET", qrDataUrl: "data:image/png;base64,AA", keyUri: "otpauth://" });
  const started = await totpAction("dealer", { enabled: false }, form({ intent: "start" }));
  expect(started).toEqual({ enabled: false, setup: { secret: "SECRET", qrDataUrl: "data:image/png;base64,AA" } });
  expect(mocks.startTotpSetup).toHaveBeenCalledWith("dealer", "dealer-user");

  mocks.confirmTotpSetup.mockResolvedValue({ ok: false, error: "invalid_code" });
  expect(await totpAction("dealer", started, form({ intent: "confirm", code: "000000" }))).toEqual({
    ...started,
    error: "invalid_code",
  });

  mocks.confirmTotpSetup.mockResolvedValue({ ok: true });
  expect(await totpAction("dealer", started, form({ intent: "confirm", code: "123456" }))).toEqual({
    enabled: true,
    status: "enabled",
  });
  expect(mocks.confirmTotpSetup).toHaveBeenLastCalledWith("dealer", "dealer-user", "123456");

  mocks.disableTotp.mockResolvedValue({ ok: false, error: "invalid_code" });
  expect(await totpAction("dealer", { enabled: true }, form({ intent: "disable", password: "p", code: "1" }))).toEqual({
    enabled: true,
    error: "invalid_code",
  });

  mocks.disableTotp.mockResolvedValue({ ok: true });
  expect(await totpAction("dealer", { enabled: true }, form({ intent: "disable", password: "p", code: "2" }))).toEqual({
    enabled: false,
    status: "disabled",
  });
  expect(mocks.disableTotp).toHaveBeenLastCalledWith("dealer", "dealer-user", { password: "p", code: "2" });
});

it("does not restart setup when 2FA is already on", async () => {
  mocks.getAccountSummary.mockResolvedValue({ totpEnabled: true });
  expect(await totpAction("backoffice", { enabled: false }, form({ intent: "start" }))).toEqual({ enabled: true });
  expect(mocks.startTotpSetup).not.toHaveBeenCalled();
});
