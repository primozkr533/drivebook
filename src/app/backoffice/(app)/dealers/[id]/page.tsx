import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Plate } from "@/components/signature/Plate";
import { Arrow, Badge, ButtonLink, Card, CardHeader, Container, Grid, PageHeader, Stack, Text } from "@/components/ui";
import { dealerSiteOrigin } from "@/lib/config";
import { formatDate, formatIsoDate, ljubljanaNow } from "@/lib/date";
import { getSurfaceBasePath, requireBackofficeUser } from "@/server/auth/permissions";
import { getDealerDetail } from "@/server/data/backoffice/dealers";
import { listPlans } from "@/server/data/backoffice/plans";
import type { DealerStatus } from "@/server/data/context";
import {
  changeDealerSlugAction,
  extendLicenceAction,
  recordDpaSignedAction,
  resendOwnerInvitationAction,
  setDealerStatusAction,
  updateDealerAction,
  type DealerChange,
} from "../actions";
import {
  DealerButtonForm,
  DealerDpaForm,
  DealerLicenceForm,
  DealerProfileForm,
  DealerSlugForm,
  type DealerFormErrors,
} from "./DealerDetailForms";

const statusTone = { active: "ok", suspended: "danger", read_only: "warn" } as const satisfies Record<DealerStatus, string>;
const ownerTone = { invited: "warn", active: "ok", deactivated: "neutral" } as const;
const changes: DealerChange[] = ["profile", "slug", "status", "licence", "dpa", "invite"];
const errorKeys = ["required", "unknown", "format", "invalid", "notFound", "notInvited", "rateLimited", "forbidden"] as const;
const licenceColumns = ["createdAt", "plan", "previousValidUntil", "validUntil", "note"] as const;

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const single = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

function Detail({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <dt className="type-utility text-muted">{label}</dt>
      <dd className="text-body text-ink" data-testid={testId}>
        {children}
      </dd>
    </div>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ id }, t] = await Promise.all([params, getTranslations("backoffice")]);
  const dealer = await getDealerDetail(id);
  return { title: dealer?.name ?? t("dealers.title") };
}

export default async function BackofficeDealerPage({ params, searchParams }: Props) {
  const { user } = await requireBackofficeUser();
  const [{ id }, query, basePath, t] = await Promise.all([
    params,
    searchParams,
    getSurfaceBasePath(),
    getTranslations("backoffice"),
  ]);
  const dealer = await getDealerDetail(id);
  if (!dealer) notFound();
  const canEdit = user.role === "superadmin";
  const plans = canEdit ? await listPlans() : [];

  const errors: DealerFormErrors = Object.fromEntries(errorKeys.map((k) => [k, t(`dealerDetail.errors.${k}`)]));
  const slugErrors: DealerFormErrors = {
    ...errors,
    format: t("slugErrors.format"),
    length: t("slugErrors.length"),
    reserved: t("slugErrors.reserved"),
    taken: t("slugErrors.taken"),
  };
  const saved = changes.find((c) => c === single(query.saved));
  const notice = saved ? t(`dealerDetail.saved.${saved}`) : single(query.invited) === "1" ? t("dealerDetail.invited") : null;
  // The dev aliases serve the backoffice on hosts where dealer subdomains may not resolve.
  const publicHref = basePath ? `/_dev/site/${dealer.slug}` : dealerSiteOrigin(dealer.slug);
  const suspended = dealer.status === "suspended";

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          eyebrow={
            <span data-testid="dealer-status">
              <Badge tone={statusTone[dealer.status]}>{t(`dealers.statuses.${dealer.status}`)}</Badge>
            </span>
          }
          title={<span data-testid="dealer-name">{dealer.name}</span>}
          description={canEdit ? undefined : t("dealerDetail.readOnly")}
          actions={
            <>
              <ButtonLink variant="secondary" href={publicHref} trailing={<Arrow />} data-testid="dealer-public-link">
                {t("dealerDetail.publicPage")}
              </ButtonLink>
              <ButtonLink variant="quiet" href={`${basePath}/dealers`}>
                {t("dealerDetail.back")}
              </ButtonLink>
            </>
          }
        />
        {notice ? (
          <Card tone="sunken" pad="sm" role="status" data-testid="dealer-notice">
            <Text tone="ink">{notice}</Text>
          </Card>
        ) : null}
        <Grid cols={12} from="lg" className="items-start">
          <Stack gap={6} className="lg:col-span-8">
            <Card data-testid="dealer-profile">
              <CardHeader title={t("dealerDetail.profile.title")} />
              {canEdit ? (
                <DealerProfileForm
                  action={updateDealerAction.bind(null, dealer.id)}
                  initial={{ name: dealer.name, planId: dealer.plan.id, notes: dealer.notes ?? "" }}
                  plans={plans.map((p) => ({ id: p.id, name: p.name }))}
                  labels={{
                    name: t("dealerDetail.profile.fields.name"),
                    planId: t("dealerDetail.profile.fields.planId"),
                    notes: t("dealerDetail.profile.fields.notes"),
                    notesHint: t("dealerDetail.profile.notesHint"),
                    submit: t("dealerDetail.profile.submit"),
                    errors,
                  }}
                />
              ) : (
                <dl className="grid gap-6 md:grid-cols-2">
                  <Detail label={t("dealerDetail.profile.fields.name")}>{dealer.name}</Detail>
                  <Detail label={t("dealerDetail.profile.fields.planId")} testId="dealer-plan">
                    {dealer.plan.name}
                  </Detail>
                  <Detail label={t("dealerDetail.profile.fields.notes")}>
                    {dealer.notes ?? t("dealerDetail.profile.noNotes")}
                  </Detail>
                </dl>
              )}
            </Card>

            <Card data-testid="dealer-slug">
              <CardHeader title={t("dealerDetail.slug.title")} meta={<Plate size="sm">{dealer.slug}</Plate>} />
              <Stack gap={6}>
                {canEdit ? (
                  <DealerSlugForm
                    action={changeDealerSlugAction.bind(null, dealer.id)}
                    initial={dealer.slug}
                    labels={{
                      field: t("dealerDetail.slug.field"),
                      hint: t("dealerDetail.slug.hint"),
                      submit: t("dealerDetail.slug.submit"),
                      errors: slugErrors,
                    }}
                  />
                ) : null}
                <Stack gap={3}>
                  <span className="type-utility text-muted">{t("dealerDetail.slug.history")}</span>
                  {dealer.slugHistory.length === 0 ? (
                    <Text size="small" tone="muted">
                      {t("dealerDetail.slug.historyEmpty")}
                    </Text>
                  ) : (
                    <ul className="flex flex-col divide-y divide-line" data-testid="dealer-slug-history">
                      {dealer.slugHistory.map((h) => (
                        <li
                          key={`${h.slug}-${h.replacedAt.toISOString()}`}
                          className="flex flex-wrap items-center justify-between gap-3 py-2"
                          data-testid="dealer-slug-history-row"
                        >
                          <Plate size="sm">{h.slug}</Plate>
                          <Text size="small" tone="muted" className="tabular">
                            {t("dealerDetail.slug.replacedAt", { date: formatDate(h.replacedAt) })}
                          </Text>
                        </li>
                      ))}
                    </ul>
                  )}
                </Stack>
              </Stack>
            </Card>

            <Card data-testid="dealer-licence">
              <CardHeader title={t("dealerDetail.licence.title")} />
              <Stack gap={6}>
                <dl>
                  <Detail label={t("dealerDetail.licence.validUntil")} testId="dealer-licence-current">
                    <span className="tabular">
                      {dealer.licenceValidUntil ? formatIsoDate(dealer.licenceValidUntil) : t("dealerDetail.licence.none")}
                    </span>
                  </Detail>
                </dl>
                {canEdit ? (
                  <Stack gap={3}>
                    <span className="type-utility text-muted">{t("dealerDetail.licence.extendTitle")}</span>
                    <DealerLicenceForm
                      action={extendLicenceAction.bind(null, dealer.id)}
                      labels={{
                        validUntil: t("dealerDetail.licence.fields.validUntil"),
                        note: t("dealerDetail.licence.fields.note"),
                        noteHint: t("dealerDetail.licence.noteHint"),
                        submit: t("dealerDetail.licence.submit"),
                        errors,
                      }}
                    />
                  </Stack>
                ) : null}
                <Stack gap={3}>
                  <span className="type-utility text-muted">{t("dealerDetail.licence.history")}</span>
                  {dealer.licenceHistory.length === 0 ? (
                    <Text size="small" tone="muted">
                      {t("dealerDetail.licence.historyEmpty")}
                    </Text>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-narrow text-left text-small" data-testid="dealer-licence-history">
                        <thead>
                          <tr className="border-b border-line-strong">
                            {licenceColumns.map((c) => (
                              <th key={c} scope="col" className="type-utility px-3 py-2 text-muted">
                                {t(`dealerDetail.licence.columns.${c}`)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dealer.licenceHistory.map((h) => (
                            <tr key={h.id} className="border-b border-line last:border-b-0" data-testid="dealer-licence-row">
                              <td className="tabular px-3 py-2 text-ink-2">{formatDate(h.createdAt)}</td>
                              <td className="px-3 py-2 text-ink-2">{h.planName}</td>
                              <td className="tabular px-3 py-2 text-ink-2">
                                {h.previousValidUntil ? formatIsoDate(h.previousValidUntil) : t("dealerDetail.licence.none")}
                              </td>
                              <td className="tabular px-3 py-2 font-[650] text-ink">{formatIsoDate(h.validUntil)}</td>
                              <td className="px-3 py-2 text-ink-2">{h.note}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Stack>
              </Stack>
            </Card>
          </Stack>

          <Stack gap={6} className="lg:col-span-4">
            <Card data-testid="dealer-status-card">
              <CardHeader title={t("dealerDetail.status.title")} />
              <Stack gap={4}>
                <dl>
                  <Detail label={t("dealerDetail.status.current")}>
                    <Badge tone={statusTone[dealer.status]}>{t(`dealers.statuses.${dealer.status}`)}</Badge>
                  </Detail>
                </dl>
                {canEdit ? (
                  <DealerButtonForm
                    action={setDealerStatusAction.bind(null, dealer.id)}
                    hidden={{ status: suspended ? "active" : "suspended" }}
                    variant={suspended ? "secondary" : "danger"}
                    hint={t(suspended ? "dealerDetail.status.reactivateHint" : "dealerDetail.status.suspendHint")}
                    submit={t(suspended ? "dealerDetail.status.reactivate" : "dealerDetail.status.suspend")}
                    errors={errors}
                    testId={suspended ? "dealer-reactivate" : "dealer-suspend"}
                  />
                ) : null}
              </Stack>
            </Card>

            <Card data-testid="dealer-dpa">
              <CardHeader title={t("dealerDetail.dpa.title")} />
              <Stack gap={4}>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                  <Detail label={t("dealerDetail.dpa.title")} testId="dealer-dpa-state">
                    {dealer.dpaSigned ? t("dealerDetail.dpa.signed") : t("dealerDetail.dpa.notSigned")}
                  </Detail>
                  {dealer.dpaSignedAt ? (
                    <Detail label={t("dealerDetail.dpa.signedAt")} testId="dealer-dpa-date">
                      <span className="tabular">{formatIsoDate(dealer.dpaSignedAt)}</span>
                    </Detail>
                  ) : null}
                </dl>
                {canEdit ? (
                  <DealerDpaForm
                    action={recordDpaSignedAction.bind(null, dealer.id)}
                    initial={dealer.dpaSignedAt ?? ljubljanaNow().dateISO}
                    labels={{ signedAt: t("dealerDetail.dpa.signedAt"), submit: t("dealerDetail.dpa.submit"), errors }}
                  />
                ) : null}
              </Stack>
            </Card>

            <Card data-testid="dealer-owner">
              <CardHeader title={t("dealerDetail.owner.title")} />
              {dealer.owner ? (
                <Stack gap={4}>
                  <dl className="grid gap-4">
                    <Detail label={t("dealerDetail.owner.email")} testId="dealer-owner-email">
                      <span className="break-all">{dealer.owner.email}</span>
                    </Detail>
                    <Detail label={t("dealerDetail.owner.status")}>
                      <span data-testid="dealer-owner-status" data-state={dealer.owner.status}>
                        <Badge tone={ownerTone[dealer.owner.status]}>
                          {t(`dealerDetail.owner.statuses.${dealer.owner.status}`)}
                        </Badge>
                      </span>
                    </Detail>
                  </dl>
                  {canEdit && dealer.owner.status === "invited" ? (
                    <DealerButtonForm
                      action={resendOwnerInvitationAction.bind(null, dealer.id)}
                      variant="secondary"
                      submit={t("dealerDetail.owner.resend")}
                      errors={errors}
                      testId="dealer-resend-invite"
                    />
                  ) : null}
                </Stack>
              ) : (
                <Text size="small" tone="muted">
                  {t("dealerDetail.owner.none")}
                </Text>
              )}
            </Card>
          </Stack>
        </Grid>
      </Stack>
    </Container>
  );
}
