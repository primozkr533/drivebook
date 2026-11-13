import { parse } from "node-html-parser";
import sharp from "sharp";
import { describe, expect, it } from "vitest";

describe("runtime dependencies", () => {
  it("sharp resizes a generated PNG to WebP", async () => {
    const png = await sharp({
      create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 80, b: 20 } },
    })
      .png()
      .toBuffer();

    const webp = await sharp(png).resize({ width: 1200, withoutEnlargement: true }).webp().toBuffer();
    const meta = await sharp(webp).metadata();

    expect(meta.format).toBe("webp");
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(800);
  });

  it("node-html-parser reads an Open Graph meta tag", () => {
    const root = parse('<html><head><meta property="og:title" content="x"></head></html>');
    expect(root.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe("x");
  });
});
