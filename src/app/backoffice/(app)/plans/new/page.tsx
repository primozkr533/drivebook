import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { ButtonLink, Card, Container, PageHeader, Stack } from "@/components/ui";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { DEFAULT_MONTHLY_SMS_QUOTA } from "@/server/data/backoffice/plans";
import { savePlanAction } from "../actions";
import { planFormLabels } from "../labels";
import { PlanForm } from "../PlanForm";
import { savedFormKey } from "../../saved";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("backoffice"))("plans.newTitle") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function BackofficeNewPlanPage({ searchParams }: Props) {
  const { user } = await requireBackofficeUser();
  const basePath = await getSurfaceBasePath();
  if (user.role !== "superadmin") redirect(`${basePath}/plans`);
  const [query, t, labels] = await Promise.all([searchParams, getTranslations("backoffice"), planFormLabels("add")]);

  return (
    <Container width="narrow" className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          title={t("plans.newTitle")}
          description={t("plans.newDescription")}
          actions={
            <ButtonLink variant="quiet" href={`${basePath}/plans`}>
              {t("plans.back")}
            </ButtonLink>
          }
        />
        <Card>
          <PlanForm
            key={savedFormKey(query)}
            action={savePlanAction.bind(null, null)}
            initial={{ name: "", monthlySmsQuota: String(DEFAULT_MONTHLY_SMS_QUOTA), maxUsers: "", notes: "" }}
            labels={labels}
          />
        </Card>
      </Stack>
    </Container>
  );
}
