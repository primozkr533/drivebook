import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppHeader, Badge, Card, CardHeader, Container, Eyebrow, PageHeader, Shell, Stack, Text } from "@/components/ui";
import { getConfig } from "@/lib/config";
import { formatDate, formatTime } from "@/lib/date";
import { listDevOutbox } from "@/server/notify/outbox";
import { HtmlPreview } from "./HtmlPreview";
import { TextBody } from "./TextBody";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("inbox");
  return { title: t("title") };
}

// Routing already 404s this in production without DEV_INBOX_ENABLED; this guards direct renders.
export default async function DevInboxPage() {
  const { isProduction, devInboxEnabled } = getConfig();
  if (isProduction && !devInboxEnabled) notFound();

  const t = await getTranslations("inbox");
  const messages = await listDevOutbox();

  return (
    <Shell header={<AppHeader />}>
      <Container className="py-10 md:py-16">
        <Stack gap={8}>
          <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
          {messages.length === 0 ? (
            <Card tone="sunken">
              <Text tone="muted">{t("empty")}</Text>
            </Card>
          ) : (
            <Stack gap={4}>
              {messages.map((m) => {
                const sentAt = `${formatDate(m.createdAt)} ${formatTime(m.createdAt)}`;
                return (
                  <Card key={m.id} data-testid="inbox-message">
                    <CardHeader
                      title={m.subject ?? t("noSubject")}
                      meta={<Badge tone={m.channel === "email" ? "ink" : "neutral"}>{t(`channel.${m.channel}`)}</Badge>}
                    >
                      <Text size="small" tone="muted" className="tabular">
                        {t("sentAt")}: {sentAt}
                      </Text>
                    </CardHeader>
                    <Stack gap={4}>
                      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {(["recipient", "sender"] as const).map((key) => (
                          <div key={key} className="flex flex-col gap-1">
                            <Eyebrow as="dt">{t(key)}</Eyebrow>
                            <dd className="break-all text-body text-ink">{m[key]}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="flex flex-col gap-2 border-t border-dashed border-line pt-4">
                        <Eyebrow>{t("textBody")}</Eyebrow>
                        <TextBody text={m.textBody} />
                      </div>
                      {m.htmlBody && (
                        <HtmlPreview html={m.htmlBody} showLabel={t("showHtml")} hideLabel={t("hideHtml")} title={t("htmlPreview")} />
                      )}
                    </Stack>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Stack>
      </Container>
    </Shell>
  );
}
