import { describe, expect, it } from "vitest";
import { clientIp } from "@/server/auth/client-ip";

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp", () => {
  it("takes the last x-forwarded-for entry, ignoring spoofed earlier ones", () => {
    expect(clientIp(h({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("returns a single entry", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }))).toBe("203.0.113.7");
  });

  it("trims whitespace and skips empty entries", () => {
    expect(clientIp(h({ "x-forwarded-for": " 1.2.3.4 ,  203.0.113.7  , , " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip when x-forwarded-for is missing or blank", () => {
    expect(clientIp(h({ "x-real-ip": " 198.51.100.2 " }))).toBe("198.51.100.2");
    expect(clientIp(h({ "x-forwarded-for": " , ", "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7", "x-real-ip": "198.51.100.2" }))).toBe("203.0.113.7");
  });

  it("returns a fixed fallback when both headers are missing", () => {
    expect(clientIp(h({}))).toBe("unknown");
  });
});
