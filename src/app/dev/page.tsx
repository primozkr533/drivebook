import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AppHeader, Arrow, ButtonLink, Card, CardHeader, Container, Grid, PageHeader, Shell, Stack, Text } from "@/components/ui";
import { DEMO_DEALER_SLUG } from "@/db/demo";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dev");
  return { title: t("title") };
}

const links = [
  { key: "site", href: `/_dev/site/${DEMO_DEALER_SLUG}` },
  { key: "app", href: "/_dev/app" },
  { key: "admin", href: "/_dev/admin" },
  { key: "inbox", href: "/_dev/inbox" },
  { key: "design", href: "/design" },
] as const;

// Reached only via the /_dev dev alias, which is off in production.
export default async function DevIndexPage() {
  const t = await getTranslations("dev");
  return (
    <Shell header={<AppHeader />}>
      <Container className="py-10 md:py-16">
        <Stack gap={8}>
          <PageHeader eyebrow={t("eyebrow")} title={t("title")} description={t("description")} />
          <Grid cols={2} from="md">
            {links.map(({ key, href }) => (
              <Card key={key}>
                <CardHeader title={t(`${key}.title`)}>
                  <Text size="small" tone="muted">
                    {t(`${key}.body`)}
                  </Text>
                </CardHeader>
                <ButtonLink href={href} variant="secondary" trailing={<Arrow />}>
                  {t("open")}
                </ButtonLink>
              </Card>
            ))}
          </Grid>
        </Stack>
      </Container>
    </Shell>
  );
}
