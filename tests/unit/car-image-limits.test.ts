import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isCarImageTooLarge, MAX_CAR_IMAGE_BYTES } from "@/lib/car-image-limits";
import { MAX_CAR_IMAGE_BYTES as SERVER_MAX_CAR_IMAGE_BYTES } from "@/server/cars/images";

describe("car image size limit", () => {
  it("is 10 MB and shared with the server image service", () => {
    expect(MAX_CAR_IMAGE_BYTES).toBe(10 * 1024 * 1024);
    expect(SERVER_MAX_CAR_IMAGE_BYTES).toBe(MAX_CAR_IMAGE_BYTES);
  });

  it("flags files over the limit and passes files at or under it", () => {
    expect(isCarImageTooLarge({ size: MAX_CAR_IMAGE_BYTES + 1 })).toBe(true);
    expect(isCarImageTooLarge({ size: 50 * 1024 * 1024 })).toBe(true);
    expect(isCarImageTooLarge({ size: MAX_CAR_IMAGE_BYTES })).toBe(false);
    expect(isCarImageTooLarge({ size: 6 * 1024 * 1024 })).toBe(false);
    expect(isCarImageTooLarge({ size: 0 })).toBe(false);
    expect(isCarImageTooLarge(null)).toBe(false);
    expect(isCarImageTooLarge(undefined)).toBe(false);
  });

  it("the server-action body limit leaves room above the image limit", () => {
    const config = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    const match = config.match(/bodySizeLimit:\s*"(\d+)mb"/);
    expect(match).not.toBeNull();
    expect(Number(match![1]) * 1024 * 1024).toBeGreaterThan(MAX_CAR_IMAGE_BYTES);
  });
});
