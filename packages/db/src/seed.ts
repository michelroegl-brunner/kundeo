import { PrismaClient } from "../generated/client/index.js";

// Seed connects as the owning role (DIRECT_URL) so it bypasses RLS and can
// create data across organizations. Never use the app role here.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
});

/**
 * Development seed: one demo organization with a default pipeline, a couple of
 * companies, contacts and deals so the UI has something to render.
 * Idempotent-ish: safe to re-run into a fresh dev database.
 */
async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: "demo" },
    update: {},
    create: { id: "org_demo", name: "Demo GmbH", slug: "demo" },
  });

  const pipeline = await prisma.pipeline.create({
    data: {
      organizationId: org.id,
      name: "Vertrieb",
      isDefault: true,
      stages: {
        create: [
          { name: "Lead", order: 0, probability: 10 },
          { name: "Qualifiziert", order: 1, probability: 30 },
          { name: "Angebot", order: 2, probability: 60 },
          { name: "Verhandlung", order: 3, probability: 80 },
        ],
      },
    },
    include: { stages: true },
  });

  const company = await prisma.company.create({
    data: {
      organizationId: org.id,
      name: "Muster AG",
      domain: "muster.de",
      city: "München",
      country: "DE",
      vatId: "DE123456789",
    },
  });

  const contact = await prisma.contact.create({
    data: {
      organizationId: org.id,
      salutation: "Herr",
      title: "Dr.",
      firstName: "Max",
      lastName: "Mustermann",
      email: "max@muster.de",
      companyId: company.id,
    },
  });

  await prisma.deal.create({
    data: {
      organizationId: org.id,
      title: "Jahreslizenz Muster AG",
      amountCents: 1_200_000,
      currency: "EUR",
      pipelineId: pipeline.id,
      stageId: pipeline.stages[2]!.id,
      companyId: company.id,
      contactId: contact.id,
    },
  });

  console.log(`Seeded organization "${org.name}" (${org.slug}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
