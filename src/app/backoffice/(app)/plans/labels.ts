import { getTranslations } from "next-intl/server";
import type { PlanFormLabels } from "./PlanForm";

export async function planFormLabels(submitKey: "add" | "save"): Promise<PlanFormLabels> {
  const t = await getTranslations("backoffice");
  return {
    fields: {
      name: t("plans.fields.name"),
      monthlySmsQuota: t("plans.fields.monthlySmsQuota"),
      maxUsers: t("plans.fields.maxUsers"),
      notes: t("plans.fields.notes"),
    },
    hints: {
      monthlySmsQuota: t("plans.hints.monthlySmsQuota"),
      maxUsers: t("plans.hints.maxUsers"),
      notes: t("plans.hints.notes"),
    },
    submit: t(`plans.${submitKey}`),
    errors: {
      required: t("plans.errors.required"),
      invalid: t("plans.errors.invalid"),
      taken: t("plans.errors.taken"),
      inUse: t("plans.errors.inUse"),
      default: t("plans.errors.default"),
      notFound: t("plans.errors.notFound"),
      forbidden: t("plans.errors.forbidden"),
    },
  };
}
