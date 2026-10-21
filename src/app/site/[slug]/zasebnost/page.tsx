import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ButtonLink, Container, Heading, PageHeader, Shell, Stack, Text } from "@/components/ui";
import { BASE_PATH_HEADER, privacyNotice } from "@/components/privacy/notice";
import { brandStyle } from "@/lib/color";
import { resolveDealerSlug } from "@/server/data/dealers";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("privacy");
  return { title: t("title") };
}

export default async function PrivacyPage({ params }: Props) {
  const { slug } = await params;
  const resolved = await resolveDealerSlug(slug);
  if (resolved.kind !== "current") notFound();
  const { dealer } = resolved;
  // The dealer's own notice takes precedence over the platform default.
  if (dealer.privacyPolicyUrl) redirect(dealer.privacyPolicyUrl);

  const t = await getTranslations("privacy");
  const basePath = (await headers()).get(BASE_PATH_HEADER) ?? "";
  const notice = privacyNotice(t, dealer, basePath);

  return (
    <div style={brandStyle(dealer.primaryColor)}>
      <Shell>
        <Container width="narrow" className="py-10 md:py-16">
          <Stack gap={8}>
            <PageHeader title={notice.title} />
            <Stack gap={3}>
              <Text size="lead" tone="ink">
                {notice.controller}
              </Text>
              <Text>{notice.contact}</Text>
              <Text>{notice.processor}</Text>
            </Stack>
            {notice.sections.map((section) => (
              <Stack key={section.heading} gap={2}>
                <Heading size="h3" as="h2">
                  {section.heading}
                </Heading>
                <Text>{section.body}</Text>
              </Stack>
            ))}
            <div>
              <ButtonLink variant="secondary" href={notice.back.href}>
                {notice.back.label}
              </ButtonLink>
            </div>
          </Stack>
        </Container>
      </Shell>
    </div>
  );
}
