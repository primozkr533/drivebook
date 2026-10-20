import type { messages } from "@/i18n/request";
import type { PublicDealer } from "@/server/data/dealers";

type PrivacyKey = keyof typeof messages.privacy;
export type PrivacyTranslate = (key: PrivacyKey, values?: Record<string, string>) => string;

export type PrivacyNotice = {
  title: string;
  controller: string;
  contact: string;
  processor: string;
  sections: { heading: string; body: string }[];
  back: { label: string; href: string };
};

export const BASE_PATH_HEADER = "x-drivebook-base-path";

type ControllerFields = Pick<PublicDealer, "legalName" | "addressLine" | "postalCode" | "city" | "email" | "phone">;

export function privacyNotice(t: PrivacyTranslate, dealer: ControllerFields, basePath: string): PrivacyNotice {
  return {
    title: t("title"),
    controller: t("controller", {
      legalName: dealer.legalName,
      address: `${dealer.addressLine}, ${dealer.postalCode} ${dealer.city}`,
    }),
    contact: t("contact", { email: dealer.email, phone: dealer.phone }),
    processor: t("processor"),
    sections: [
      { heading: t("dataHeading"), body: t("dataBody") },
      { heading: t("purposeHeading"), body: t("purposeBody") },
      { heading: t("retentionHeading"), body: t("retentionBody") },
      { heading: t("rightsHeading"), body: t("rightsBody") },
    ],
    back: { label: t("back"), href: `${basePath}/` },
  };
}
