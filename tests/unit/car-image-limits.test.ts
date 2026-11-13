import { describe, expect, it } from "vitest";
import { isCarImageTooLarge, MAX_CAR_IMAGE_BYTES } from "@/lib/car-image-limits";
import { MAX_CAR_IMAGE_BYTES as SERVER_MAX_CAR_IMAGE_BYTES } from "@/server/cars/images";
import nextConfig from "../../next.config";

const toBytes = (limit: string | number | undefined) => {
  if (typeof limit === "number") return limit;
  const match = limit?.match(/^(\d+)mb$/i);
  return match ? Number(match[1]) * 1024 * 1024 : 0;
};

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

  it("the server-action and proxy body limits leave room above the image limit", () => {
    const { serverActions, proxyClientMaxBodySize } = nextConfig.experimental ?? {};
    const minimum = MAX_CAR_IMAGE_BYTES + 1024 * 1024;
    expect(toBytes(serverActions?.bodySizeLimit)).toBeGreaterThanOrEqual(minimum);
    expect(toBytes(proxyClientMaxBodySize)).toBeGreaterThanOrEqual(minimum);
    expect(proxyClientMaxBodySize).toBe(serverActions?.bodySizeLimit);
  });
});
