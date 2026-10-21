import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Badge, ButtonLink, Card, Container, PageHeader, Stack, Text } from "@/components/ui";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { listPlans } from "@/server/data/backoffice/plans";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("backoffice"))("plans.title") };
}

export default async function BackofficePlansPage() {
  const { user } = await requireBackofficeUser();
  const [basePath, t, plans] = await Promise.all([getSurfaceBasePath(), getTranslations("backoffice"), listPlans()]);
  const canEdit = user.role === "superadmin";
  const columns = ["name", "monthlySmsQuota", "maxUsers", "dealerCount", "notes"] as const;

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          title={t("plans.title")}
          description={t("plans.description")}
          actions={
            canEdit ? (
              <ButtonLink href={`${basePath}/plans/new`} data-testid="plan-create">
                {t("plans.create")}
              </ButtonLink>
            ) : undefined
          }
        />
        <Stack gap={3}>
          <Text size="small" tone="muted" data-testid="plans-count">
            {t("plans.count", { count: plans.length })}
          </Text>
          {plans.length === 0 ? (
            <Card tone="sunken" data-testid="plans-empty">
              <Text>{t("plans.empty")}</Text>
            </Card>
          ) : (
            <Card pad="none" className="overflow-x-auto">
              <table className="w-full min-w-narrow text-left text-body" data-testid="plans-table">
                <thead>
                  <tr className="border-b border-line-strong">
                    {columns.map((c) => (
                      <th key={c} scope="col" className="type-utility px-4 py-3 text-muted">
                        {t(`plans.columns.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {plans.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-b-0" data-testid="plan-row">
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-2">
                          <ButtonLink variant="quiet" size="sm" href={`${basePath}/plans/${p.id}`} data-testid="plan-link">
                            {p.name}
                          </ButtonLink>
                          {p.isDefault && <Badge>{t("plans.default")}</Badge>}
                        </span>
                      </td>
                      <td className="tabular px-4 py-3 text-ink-2">{p.monthlySmsQuota}</td>
                      <td className="tabular px-4 py-3 text-ink-2">{p.maxUsers ?? t("plans.unlimitedUsers")}</td>
                      <td className="tabular px-4 py-3 text-ink-2">{p.dealerCount}</td>
                      <td className="px-4 py-3 text-ink-2">{p.notes ?? t("plans.noNotes")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </Stack>
      </Stack>
    </Container>
  );
}
