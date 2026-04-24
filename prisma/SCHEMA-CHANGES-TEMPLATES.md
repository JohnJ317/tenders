// ============================================================
// TEMPLATES DE PROPOSITIONS — Ajouter à schema.prisma
// ============================================================

model ProposalTemplate {
  id                  String   @id @default(uuid()) @db.Uuid
  cabinetId           String   @map("cabinet_id") @db.Uuid
  code                String   // audit_financier, commissariat, passation_marches, conseil, audit_it, formation
  label               String
  description         String?  @db.Text

  // Prompts personnalisés (markdown autorisé)
  understandingPrompt String   @map("understanding_prompt") @db.Text
  methodologyPrompt   String   @map("methodology_prompt") @db.Text
  planningPrompt      String   @map("planning_prompt") @db.Text
  teamPrompt          String   @map("team_prompt") @db.Text

  // Structure type (facultative)
  typicalTeamSize     Int?     @default(5) @map("typical_team_size")
  typicalDurationMonths Int?   @map("typical_duration_months")

  isActive            Boolean  @default(true) @map("is_active")
  isSystem            Boolean  @default(false) @map("is_system")  // true si template par défaut

  createdAt           DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt           DateTime @updatedAt @map("updated_at") @db.Timestamptz(6)

  cabinet             Cabinet  @relation(fields: [cabinetId], references: [id], onDelete: Cascade)

  @@unique([cabinetId, code])
  @@index([cabinetId])
  @@map("proposal_templates")
}

// ============================================================
// Ajouter dans model Cabinet :
//   proposalTemplates ProposalTemplate[]
//
// Ajouter dans model TenderProposal :
//   templateCode      String?  @map("template_code")
// ============================================================
