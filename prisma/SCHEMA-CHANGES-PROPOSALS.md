// ============================================================
// SPRINT B — Proposition auto-générée
// Ajouter ces éléments à ~/Documents/offre/prisma/schema.prisma
// ============================================================

// 1. ENUM (à ajouter avec les autres enums)
enum ProposalStatus {
  DRAFT
  READY
  SUBMITTED
}

// 2. MODEL (à ajouter à la fin du fichier)
model TenderProposal {
  id              String         @id @default(uuid()) @db.Uuid
  tenderId        String         @unique @map("tender_id") @db.Uuid

  // Sélection d'équipe — stocke les IDs des consultants choisis + rationale
  selectedTeam    Json?          @map("selected_team")
  // Format JSON : [{ consultantId, roleInProposal, justification }]

  // Sélection de références — IDs des références choisies + rationale
  selectedRefs    Json?          @map("selected_references")
  // Format JSON : [{ referenceId, relevance }]

  // Sections rédigées (markdown)
  understanding   String?        @db.Text   // Compréhension du projet
  methodology     String?        @db.Text   // Méthodologie
  planning        String?        @db.Text   // Planning
  // L'équipe (teamJustification) et les références (refsJustification) sont dans les JSON ci-dessus

  // Métadonnées
  status          ProposalStatus @default(DRAFT)
  generatedAt     DateTime?      @map("generated_at") @db.Timestamptz(6)
  lastRegenerated Json?          @map("last_regenerated") // { section: 'methodology', at: '...' }
  tokensUsed      Int?           @default(0) @map("tokens_used")

  createdAt       DateTime       @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime       @updatedAt @map("updated_at") @db.Timestamptz(6)

  tender          Tender         @relation(fields: [tenderId], references: [id], onDelete: Cascade)

  @@index([tenderId])
  @@map("tender_proposals")
}

// 3. AJOUT dans le model Tender (relation)
// Ajoute dans le model Tender, section des relations :
//   proposal           TenderProposal?
