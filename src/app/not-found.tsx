import { getTranslations } from "next-intl/server";
import { AppHeader, Arrow, ButtonLink, Container, PageHeader, Shell } from "@/components/ui";

export default async function NotFound() {
  const t = await getTranslations("errors");
  return (
    <Shell header={<AppHeader />}>
      <Container className="py-10 md:py-16">
        <PageHeader
          eyebrow="404"
          title={t("notFoundTitle")}
          description={t("notFoundBody")}
          actions={
            <ButtonLink href="/" variant="secondary" trailing={<Arrow />}>
              {t("backHome")}
            </ButtonLink>
          }
        />
      </Container>
    </Shell>
  );
}
