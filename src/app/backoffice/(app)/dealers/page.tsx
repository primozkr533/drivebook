import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Plate } from "@/components/signature/Plate";
import { Badge, Button, ButtonLink, Card, Container, Input, PageHeader, Select, Stack, Text } from "@/components/ui";
import { formatIsoDate } from "@/lib/date";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { listDealers } from "@/server/data/backoffice/dealers";
import type { DealerStatus } from "@/server/data/context";

const statusFilters = ["active", "suspended"] as const;
const statusTone = { active: "ok", suspended: "danger", read_only: "warn" } as const satisfies Record<DealerStatus, string>;

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("backoffice"))("dealers.title") };
}

export default async function BackofficeDealersPage({ searchParams }: Props) {
  const { user } = await requireBackofficeUser();
  const [query, basePath, t] = await Promise.all([searchParams, getSurfaceBasePath(), getTranslations("backoffice")]);
  const q = single(query.q).trim();
  const status = statusFilters.find((s) => s === single(query.status));
  const dealers = await listDealers({ q: q || undefined, status });
  const columns = ["name", "slug", "status", "licenceValidUntil", "plan"] as const;

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          title={t("dealers.title")}
          description={t("dealers.description")}
          actions={
            user.role === "superadmin" ? (
              <ButtonLink variant="primary" href={`${basePath}/dealers/new`} data-testid="dealer-create">
                {t("dealers.create")}
              </ButtonLink>
            ) : undefined
          }
        />
        <Card pad="sm">
          <form method="get" className="flex flex-col gap-4 md:flex-row md:items-start" data-testid="dealers-filter">
            <div className="md:flex-1">
              <Input
                label={t("dealers.search")}
                hint={t("dealers.searchHint")}
                type="search"
                name="q"
                defaultValue={q}
                data-testid="dealers-q"
              />
            </div>
            <div className="md:w-64">
              <Select label={t("dealers.status")} name="status" defaultValue={status ?? ""} data-testid="dealers-status">
                <option value="">{t("dealers.statusAll")}</option>
                {statusFilters.map((s) => (
                  <option key={s} value={s}>
                    {t(`dealers.statuses.${s}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-4 md:mt-6">
              <Button type="submit" variant="secondary" data-testid="dealers-submit">
                {t("dealers.submit")}
              </Button>
              {(q || status) && (
                <ButtonLink variant="quiet" href={`${basePath}/dealers`}>
                  {t("dealers.reset")}
                </ButtonLink>
              )}
            </div>
          </form>
        </Card>
        <Stack gap={3}>
          <Text size="small" tone="muted" data-testid="dealers-count">
            {t("dealers.count", { count: dealers.length })}
          </Text>
          {dealers.length === 0 ? (
            <Card tone="sunken" data-testid="dealers-empty">
              <Text>{t("dealers.empty")}</Text>
            </Card>
          ) : (
            <Card pad="none" className="overflow-x-auto">
              <table className="w-full min-w-narrow text-left text-body" data-testid="dealers-table">
                <thead>
                  <tr className="border-b border-line-strong">
                    {columns.map((c) => (
                      <th key={c} scope="col" className="type-utility px-4 py-3 text-muted">
                        {t(`dealers.columns.${c}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dealers.map((d) => (
                    <tr key={d.id} className="border-b border-line last:border-b-0" data-testid="dealer-row">
                      <td className="px-4 py-3 font-[650] text-ink">{d.name}</td>
                      <td className="px-4 py-3">
                        <Plate size="sm">{d.slug}</Plate>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={statusTone[d.status]}>{t(`dealers.statuses.${d.status}`)}</Badge>
                      </td>
                      <td className="tabular px-4 py-3 text-ink-2">
                        {d.licenceValidUntil ? formatIsoDate(d.licenceValidUntil) : t("dealers.noLicence")}
                      </td>
                      <td className="px-4 py-3 text-ink-2">{d.planName}</td>
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
