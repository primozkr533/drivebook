import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Container, PageHeader, Stack } from "@/components/ui";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";
import { CarForm } from "../CarForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cars"))("new.title") };
}

export default async function NewCarPage() {
  await requireDealerUser();
  const [basePath, t] = await Promise.all([getSurfaceBasePath(), getTranslations("cars")]);

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader title={t("new.title")} description={t("new.description")} />
        <CarForm
          listHref={`${basePath}/cars`}
          initial={{ id: "", make: "", model: "", year: "", price: "", avtonetUrl: "", imageUrl: "", currentImageUrl: null }}
        />
      </Stack>
    </Container>
  );
}
