import { describe, expect, it } from "vitest";
import type { Car } from "@/components/signature";
import type { PublicDealer } from "@/server/data/dealers";
import { buildDealerPageModel } from "./model";

const dealer: PublicDealer = {
  name: "Avtohiša Demo",
  legalName: "Avtohiša Demo d.o.o.",
  addressLine: "Tržaška cesta 1",
  postalCode: "1000",
  city: "Ljubljana",
  phone: "+386 1 234 56 78",
  email: "info@demo.test",
  websiteUrl: null,
  mapsUrl: null,
  privacyUrl: null,
  primaryColor: "#0055AA",
  logoUrl: null,
  status: "active",
};

const car = (id: string, model: string): Car => ({
  id,
  make: "Make",
  model,
  year: 2022,
  priceEur: 20000,
  avtoNetUrl: `https://www.avto.net/${id}`,
  active: true,
});

const cars = [car("a", "Octavia Combi"), car("b", "Tiguan"), car("c", "Clio")];
const now = { dateISO: "2026-10-20", isoWeekday: 2, minutes: 600 } as const;

const build = (over: Partial<Parameters<typeof buildDealerPageModel>[0]> = {}) =>
  buildDealerPageModel({ dealer, cars, hours: [], now, carParam: undefined, basePath: "", ...over });

describe("buildDealerPageModel", () => {
  it("keeps the data-layer order with nothing selected by default", () => {
    const m = build();
    expect(m.cars.map((c) => c.car.id)).toEqual(["a", "b", "c"]);
    expect(m.cars.some((c) => c.selected)).toBe(false);
  });

  it("moves the ?car match first and selects it", () => {
    const m = build({ carParam: "c" });
    expect(m.cars.map((c) => [c.car.id, c.selected])).toEqual([
      ["c", true],
      ["a", false],
      ["b", false],
    ]);
  });

  it("ignores an unknown or inactive car param", () => {
    const withInactive = [...cars, { ...car("d", "308"), active: false }];
    for (const carParam of ["zzz", "d", ""]) {
      const m = build({ cars: withInactive, carParam });
      expect(m.cars.map((c) => c.car.id)).toEqual(["a", "b", "c"]);
      expect(m.cars.some((c) => c.selected)).toBe(false);
    }
  });

  it("uses the first value of a repeated car param", () => {
    expect(build({ carParam: ["b", "c"] }).cars[0]).toMatchObject({ car: { id: "b" }, selected: true });
  });

  it("shows no cars for a suspended dealer", () => {
    const m = build({ dealer: { ...dealer, status: "suspended" }, carParam: "a" });
    expect(m.suspended).toBe(true);
    expect(m.cars).toEqual([]);
  });

  it("strips spaces from the tel: href", () => {
    expect(build().telHref).toBe("tel:+38612345678");
  });

  it("prefers the dealer's mapsUrl", () => {
    expect(build({ dealer: { ...dealer, mapsUrl: "https://maps.app.goo.gl/x" } }).mapsHref).toBe(
      "https://maps.app.goo.gl/x",
    );
  });

  it("falls back to a Google Maps search of the address", () => {
    expect(build().mapsHref).toBe(
      "https://www.google.com/maps/search/?api=1&query=" +
        encodeURIComponent("Avtohiša Demo, Tržaška cesta 1, 1000 Ljubljana"),
    );
  });

  it("links the dealer's own privacy policy when set", () => {
    expect(build({ dealer: { ...dealer, privacyUrl: "https://demo.si/zasebnost" } }).privacy).toEqual({
      href: "https://demo.si/zasebnost",
      external: true,
    });
  });

  it("falls back to the platform notice under the base path", () => {
    expect(build({ basePath: "/_dev/site/demo" }).privacy).toEqual({ href: "/_dev/site/demo/zasebnost", external: false });
    expect(build().privacy.href).toBe("/zasebnost");
  });

  it("builds all seven lanes with closed days empty and today as a 0-based index", () => {
    const m = build({
      hours: [
        { isoWeekday: 1, opensAt: "13:00", closesAt: "17:00" },
        { isoWeekday: 1, opensAt: "08:00", closesAt: "12:00" },
        { isoWeekday: 6, opensAt: "09:00", closesAt: "12:00" },
      ],
    });
    expect(m.days.map((d) => d.short)).toEqual(["Pon", "Tor", "Sre", "Čet", "Pet", "Sob", "Ned"]);
    expect(m.days[0].ranges).toEqual([
      ["08:00", "12:00"],
      ["13:00", "17:00"],
    ]);
    expect(m.days[6].ranges).toEqual([]);
    expect(m.today).toBe(1);
    expect(m.nowMin).toBe(600);
  });
});
