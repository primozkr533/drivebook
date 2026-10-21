import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { Container, PageHeader, Stack } from "@/components/ui";
import { getSurfaceBasePath, requireDealerUser } from "@/server/auth/permissions";
import { getCarForAdmin } from "@/server/data/cars";
import { CarForm } from "../CarForm";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getTranslations("cars"))("editPage.title") };
}

type Props = { params: Promise<{ id: string }> };

export default async function EditCarPage({ params }: Props) {
  const { ctx } = await requireDealerUser();
  const [{ id }, basePath, t] = await Promise.all([params, getSurfaceBasePath(), getTranslations("cars")]);
  const car = await getCarForAdmin(ctx, id);
  if (!car) notFound();

  return (
    <Container className="py-10 md:py-16">
      <Stack gap={8}>
        <PageHeader
          eyebrow={t("editPage.title")}
          title={`${car.make} ${car.model}`}
          description={t("editPage.description")}
        />
        <CarForm
          listHref={`${basePath}/cars`}
          initial={{
            id: car.id,
            make: car.make,
            model: car.model,
            year: String(car.year),
            price: String(car.priceEur),
            avtonetUrl: car.avtoNetUrl ?? "",
            imageUrl: "",
            currentImageUrl: car.imageUrl ?? null,
          }}
        />
      </Stack>
    </Container>
  );
}
