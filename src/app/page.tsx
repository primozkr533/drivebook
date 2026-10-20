import { ButtonLink, Container, Heading, Kicker, Rule, Text, Wordmark } from "@/components/ui";

// Placeholder until host-based routing lands (phase 1: routing ticket).
export default function Home() {
  return (
    <Container width="measure" className="flex min-h-dvh flex-col justify-center gap-8 py-section">
      <Wordmark size="lg" />
      <Rule weight="heavy" />
      <Kicker>drivebook.si</Kicker>
      <Heading as="h1" size="3xl">
        Testne vožnje, <em>brez praznih terminov.</em>
      </Heading>
      <Text size="md">Rezervacije testnih voženj in ogledov za avtohiše.</Text>
      <div>
        <ButtonLink href="/design" variant="secondary">
          Temelji oblikovanja
        </ButtonLink>
      </div>
    </Container>
  );
}
