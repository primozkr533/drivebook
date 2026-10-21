import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Badge, ButtonLink, Card, CardHeader, Container, Grid, PageHeader, Stack, Text } from "@/components/ui";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { getPlan } from "@/server/data/backoffice/plans";
import { deletePlanAction, savePlanAction } from "../actions";
import { planFormLabels } from "../labels";
import { DeletePlanForm, PlanForm } from "../PlanForm";
import { savedFormKey } from "../../saved";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("backoffice"))("plans.title") };
}

export default async function BackofficePlanPage({ params, searchParams }: Props) {
  const { user } = await requireBackofficeUser();
  const [{ id }, query, basePath, t, labels] = await Promise.all([
    params,
    searchParams,
    getSurfaceBasePath(),
    getTranslations("backoffice"),
    planFormLabels("save"),
  ]);
  const plan = await getPlan(id);
  if (!plan) notFound();
  const canEdit = user.role === "superadmin";
  const formKey = savedFormKey(query);
  const fields = ["name", "monthlySmsQuota", "maxUsers", "notes"] as const;

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          eyebrow={plan.isDefault ? <Badge>{t("plans.default")}</Badge> : undefined}
          title={t("plans.editTitle", { name: plan.name })}
          description={canEdit ? undefined : t("plans.viewDescription")}
          actions={
            <ButtonLink variant="quiet" href={`${basePath}/plans`}>
              {t("plans.back")}
            </ButtonLink>
          }
        />
        {canEdit ? (
          <Grid cols={12} from="lg" className="items-start">
            <Card className="lg:col-span-8">
              <PlanForm
                key={formKey}
                action={savePlanAction.bind(null, plan.id)}
                initial={{
                  name: plan.name,
                  monthlySmsQuota: String(plan.monthlySmsQuota),
                  maxUsers: String(plan.maxUsers),
                  notes: plan.notes ?? "",
                }}
                labels={labels}
              />
            </Card>
            <Card className="lg:col-span-4">
              <CardHeader title={t("plans.deleteTitle")} />
              <DeletePlanForm
                key={formKey}
                action={deletePlanAction.bind(null, plan.id)}
                labels={{ submit: t("plans.delete"), hint: t("plans.deleteHint"), errors: labels.errors }}
              />
            </Card>
          </Grid>
        ) : (
          <Card data-testid="plan-readonly">
            <dl className="grid gap-6 md:grid-cols-2">
              {fields.map((f) => (
                <div key={f} className="flex flex-col gap-1.5">
                  <dt className="type-utility text-muted">{t(`plans.fields.${f}`)}</dt>
                  <dd>
                    <Text tone="ink" className="tabular" data-testid={`plan-value-${f}`}>
                      {f === "notes" ? (plan.notes ?? t("plans.noNotes")) : plan[f]}
                    </Text>
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        )}
      </Stack>
    </Container>
  );
}
