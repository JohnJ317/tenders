import 'dotenv/config';
import {
  PrismaClient,
  Role,
  Grade,
  ActivityType,
  Country,
  TenderSource,
  TenderStage,
  TenderType,
  EventType,
  EventStage,
  PricingCoefficientCategory,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_COEFFICIENTS } from '../src/modules/pricing-coefficients/default-coefficients';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Clean slate (ordre : enfants d'abord)
  await prisma.competitiveIntel.deleteMany();
  await prisma.tenderPricing.deleteMany();
  await prisma.pricingCoefficient.deleteMany();
  await prisma.tenderDocument.deleteMany();
  await prisma.tenderTransition.deleteMany();
  await prisma.tender.deleteMany();
  await prisma.eventDocument.deleteMany();
  await prisma.eventTransition.deleteMany();
  await prisma.event.deleteMany();
  await prisma.grilleHoraire.deleteMany();
  await prisma.activity.deleteMany();
  await prisma.user.deleteMany();
  await prisma.cabinet.deleteMany();

  // ---- Cabinet ----
  const cabinet = await prisma.cabinet.create({
    data: {
      name: 'Cabinet Kouassi & Associés',
      country: Country.CI,
      currency: 'XOF',
      vatRate: 0.18,
      language: 'fr',
      status: 'ACTIVE',
    },
  });
  console.log(`✅ Cabinet: ${cabinet.name}`);

  const passwordHash = await bcrypt.hash('admin123', 12);
  const admin = await prisma.user.create({
    data: {
      cabinetId: cabinet.id,
      email: 'admin@kouassi-associes.ci',
      passwordHash,
      firstName: 'Kouamé', lastName: 'Kouassi',
      role: Role.ADMIN_CABINET, grade: Grade.ASSOCIE,
    },
  });
  const manager = await prisma.user.create({
    data: {
      cabinetId: cabinet.id,
      email: 'manager@kouassi-associes.ci',
      passwordHash,
      firstName: 'Aminata', lastName: 'Diallo',
      role: Role.MANAGER, grade: Grade.MANAGER,
    },
  });
  console.log('✅ 2 users');

  await prisma.activity.createMany({
    data: [
      { cabinetId: cabinet.id, type: ActivityType.CAC, label: 'Commissariat aux comptes' },
      { cabinetId: cabinet.id, type: ActivityType.AUDIT_CONTRACTUEL, label: 'Audit contractuel' },
      { cabinetId: cabinet.id, type: ActivityType.AUDIT_BAILLEUR, label: 'Audit projets bailleurs (BM, BAD, UE)' },
      { cabinetId: cabinet.id, type: ActivityType.EC_ETATS_FINANCIERS, label: 'Établissement états financiers SYSCOHADA' },
      { cabinetId: cabinet.id, type: ActivityType.CONSEIL_FISCAL, label: 'Conseil fiscal' },
    ],
  });
  console.log('✅ 5 activités');

  const today = new Date('2026-01-01');
  await prisma.grilleHoraire.createMany({
    data: [
      { cabinetId: cabinet.id, grade: Grade.ASSOCIE,   hourlyRate: 75_000, dailyRate: 600_000, effectiveFrom: today },
      { cabinetId: cabinet.id, grade: Grade.MANAGER,   hourlyRate: 45_000, dailyRate: 360_000, effectiveFrom: today },
      { cabinetId: cabinet.id, grade: Grade.SENIOR,    hourlyRate: 28_000, dailyRate: 224_000, effectiveFrom: today },
      { cabinetId: cabinet.id, grade: Grade.JUNIOR,    hourlyRate: 18_000, dailyRate: 144_000, effectiveFrom: today },
      { cabinetId: cabinet.id, grade: Grade.ASSISTANT, hourlyRate: 10_000, dailyRate:  80_000, effectiveFrom: today },
    ],
  });
  console.log('✅ Grille horaire');

  // ---- Coefficients standards (systèmes) ----
  await prisma.pricingCoefficient.createMany({
    data: DEFAULT_COEFFICIENTS.map((c) => ({
      ...c,
      cabinetId: cabinet.id,
      isSystem: true,
      isActive: true,
    })),
  });
  console.log(`✅ ${DEFAULT_COEFFICIENTS.length} coefficients de pricing`);

  // ---- AO démos ----
  const tendersData = [
    {
      reference: 'MINSANTE-AO-2026-042',
      title: 'Audit comptable et financier - Ministère de la Santé CI (2026-2028)',
      clientName: 'Ministère de la Santé - République de Côte d\'Ivoire',
      sector: 'Santé publique', source: TenderSource.SIGMAP, type: TenderType.OPEN,
      country: Country.CI, stage: TenderStage.QUALIFICATION, isOpen: true,
      publishedAt: new Date('2026-04-01'), submissionDeadline: new Date('2026-05-15'),
      budgetIndicative: 85_000_000, leadUserId: admin.id, createdById: admin.id,
    },
    {
      reference: 'SGBCI-CAC-2026',
      title: 'Commissariat aux comptes SGBCI - mandat triennal',
      clientName: 'SGBCI', sector: 'Banque et services financiers',
      source: TenderSource.PRIVATE, type: TenderType.RESTRICTED,
      country: Country.CI, stage: TenderStage.SUBMITTED, isOpen: true,
      publishedAt: new Date('2026-03-10'), submissionDeadline: new Date('2026-04-10'),
      budgetIndicative: 120_000_000, ourProposedAmount: 115_000_000,
      leadUserId: admin.id, createdById: admin.id,
    },
    {
      reference: 'WB-PADES-3-2026',
      title: 'Audit projet PADES Phase 3 - Éducation secondaire',
      clientName: 'Banque Mondiale', sector: 'Éducation',
      source: TenderSource.WORLD_BANK, type: TenderType.AMI,
      country: Country.CI, stage: TenderStage.PREPARING, isOpen: true,
      publishedAt: new Date('2026-02-20'), submissionDeadline: new Date('2026-05-05'),
      budgetIndicative: 45_000_000, leadUserId: manager.id, createdById: admin.id,
    },
    {
      title: 'Due diligence acquisition société TELEDIFFUSION CI',
      clientName: 'Confidentiel', sector: 'Médias / Télécoms',
      source: TenderSource.PRIVATE, type: TenderType.DIRECT,
      country: Country.CI, stage: TenderStage.WATCHING, isOpen: true,
      leadUserId: admin.id, createdById: admin.id,
    },
    {
      reference: 'SOTRA-EVAL-2025',
      title: 'Évaluation entreprise publique SOTRA',
      clientName: 'Ministère des Transports', sector: 'Transport',
      source: TenderSource.SIGMAP, type: TenderType.OPEN,
      country: Country.CI, stage: TenderStage.LOST, isOpen: false,
      publishedAt: new Date('2025-11-01'), submissionDeadline: new Date('2025-12-15'),
      budgetIndicative: 35_000_000, ourProposedAmount: 34_500_000,
      lostReason: 'Concurrent à 26M FCFA, notre offre jugée sur-dimensionnée.',
      leadUserId: manager.id, createdById: manager.id,
    },
    {
      reference: 'AFD-EDUC-2025-12',
      title: 'Audit bailleur AFD - Programme éducation primaire',
      clientName: 'AFD', sector: 'Éducation',
      source: TenderSource.AFD, type: TenderType.RESTRICTED,
      country: Country.CI, stage: TenderStage.WON, isOpen: false,
      publishedAt: new Date('2025-09-01'), submissionDeadline: new Date('2025-10-15'),
      budgetIndicative: 50_000_000, ourProposedAmount: 48_000_000, wonAmount: 45_000_000,
      startDate: new Date('2026-01-15'),
      leadUserId: admin.id, createdById: admin.id,
    },
  ];

  const createdTenders: any[] = [];
  for (const t of tendersData) {
    const created = await prisma.tender.create({ data: { ...t, cabinetId: cabinet.id } });
    await prisma.tenderTransition.create({
      data: {
        tenderId: created.id, fromStage: null, toStage: created.stage,
        note: 'Seed initial', performedById: t.createdById ?? null,
      },
    });
    createdTenders.push(created);
  }
  console.log(`✅ ${createdTenders.length} AO démo`);

  // ---- Events démos ----
  const eventsData = [
    {
      title: 'Conférence ONECCA Afrique 2026', type: EventType.CONFERENCE,
      startsAt: new Date('2026-06-15T09:00:00Z'), endsAt: new Date('2026-06-17T17:00:00Z'),
      location: 'Sofitel Ivoire', city: 'Abidjan', country: Country.CI,
      stage: EventStage.REGISTERED, registrationCost: 450_000, expectedLeads: 15,
      leadUserId: admin.id, createdById: admin.id,
    },
    {
      title: 'Salon SARA 2026', type: EventType.SALON,
      startsAt: new Date('2026-09-25T09:00:00Z'), endsAt: new Date('2026-10-04T18:00:00Z'),
      location: 'Parc des Expositions', city: 'Abidjan', country: Country.CI,
      stage: EventStage.IDENTIFIED, registrationCost: 250_000, expectedLeads: 8,
      leadUserId: manager.id, createdById: manager.id,
    },
    {
      title: 'Formation IFRS 17 Assurances - CGAF', type: EventType.TRAINING,
      startsAt: new Date('2026-03-10T09:00:00Z'), endsAt: new Date('2026-03-12T17:00:00Z'),
      location: 'Centre CGAF', city: 'Abidjan', country: Country.CI,
      stage: EventStage.ATTENDED, registrationCost: 1_200_000,
      leadUserId: manager.id, createdById: admin.id,
    },
  ];
  for (const e of eventsData) {
    const created = await prisma.event.create({ data: { ...e, cabinetId: cabinet.id } });
    await prisma.eventTransition.create({
      data: {
        eventId: created.id, fromStage: null, toStage: created.stage,
        note: 'Seed initial', performedById: e.createdById ?? null,
      },
    });
  }
  console.log(`✅ ${eventsData.length} manifestations démo`);

  // ---- Simulation pricing démo pour SGBCI (AO en SUBMITTED) ----
  const sgbci = createdTenders.find((t) => t.reference === 'SGBCI-CAC-2026');
  if (sgbci) {
    // Récupère les coefs qu'on va appliquer
    const coefs = await prisma.pricingCoefficient.findMany({
      where: {
        cabinetId: cabinet.id,
        code: { in: ['SECTOR_BANK_INSURANCE', 'COMPLEXITY_HIGH', 'RECURRENCE_FIRST'] },
      },
    });
    const coefSnap = coefs.map((c) => ({
      code: c.code, label: c.label, category: c.category, multiplier: Number(c.multiplier),
    }));
    const combinedMultiplier = coefSnap.reduce((acc, c) => acc * c.multiplier, 1);

    // Charges : typique CAC banque
    const hours = { associe: 60, manager: 120, senior: 400, junior: 300, assistant: 120 };
    const rates = { associe: 75_000, manager: 45_000, senior: 28_000, junior: 18_000, assistant: 10_000 };
    const labor = Object.entries(hours).reduce((a, [k, h]) => a + h * (rates as any)[k], 0);
    const baseCost = labor + 2_500_000 + 0;
    const adjustedCost = baseCost * combinedMultiplier;

    await prisma.tenderPricing.create({
      data: {
        tenderId: sgbci.id, name: 'Simulation initiale',
        associeHours: 60, managerHours: 120, seniorHours: 400, juniorHours: 300, assistantHours: 120,
        travelCost: 2_500_000, otherCosts: 0, otherCostsLabel: null,
        coefficientsSnapshot: coefSnap,
        floorMarginRate: 0.10, targetMarginRate: 0.25, ceilingMarginRate: 0.40,
        baseCost, adjustedCost,
        floorPrice: Math.round(adjustedCost / 0.90),
        targetPrice: Math.round(adjustedCost / 0.75),
        ceilingPrice: Math.round(adjustedCost / 0.60),
        currency: 'XOF', notes: 'Simulation de seed — première itération prix SGBCI',
        createdById: admin.id,
      },
    });
    console.log('✅ Simulation pricing démo pour SGBCI');
  }

  // ---- Competitive intel démo ----
  const sotra = createdTenders.find((t) => t.reference === 'SOTRA-EVAL-2025');
  if (sotra) {
    await prisma.competitiveIntel.createMany({
      data: [
        {
          tenderId: sotra.id, competitorName: 'Cabinet Oyono',
          competitorPrice: 26_000_000, currency: 'XOF',
          isWinner: true, source: 'OFFICIAL_NOTIFICATION',
          notes: 'A gagné avec offre 25% sous budget indicatif',
          createdById: admin.id,
        },
        {
          tenderId: sotra.id, competitorName: 'Deloitte CI',
          competitorPrice: null, currency: 'XOF',
          isWinner: false, source: 'RUMOR',
          notes: 'Présent sur l\'appel d\'offres, prix non communiqué',
          createdById: admin.id,
        },
      ],
    });
    console.log('✅ Competitive intel démo');
  }

  console.log('\n🎉 Seed terminé.');
  console.log('\n🔑 Identifiants: admin@kouassi-associes.ci / admin123');
}

main()
  .catch((e) => { console.error('❌ Seed error:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
