import { dealerSiteOrigin, getConfig, type Config } from "@/lib/config";

export function carDeepLink(slug: string, publicId: string, config: Config = getConfig()): string {
  return `${dealerSiteOrigin(slug, config)}/?car=${encodeURIComponent(publicId)}`;
}
