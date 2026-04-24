// ============================================================
// SPRINT A — Ressources : Consultants + Références
// Ajouter ces éléments à ~/Documents/offre/prisma/schema.prisma
// ============================================================

// 1. ENUMS — Ajouter après les autres enums
enum ConsultantKind {
  INTERNAL   // Salarié du cabinet
  EXTERNAL   // Freelance / collaboration ponctuelle
  PARTNER    // Partenaire régulier, expert associé
}

enum ReferenceStatus {
  COMPLETED  // Projet terminé (référence vendable)
  ONGOING    // Projet en cours
  LOST       // AO perdu (archive interne)
  ARCHIVED   // Archivé (ancien, peu pertinent)
}

// 2. MODELS — Ajouter à la fin du fichier

model Consultant {
  id              String            @id @default(uuid()) @db.Uuid
  cabinetId       String            @map("cabinet_id") @db.Uuid
  kind            ConsultantKind    @default(INTERNAL)
  fullName        String            @map("full_name") @db.VarChar(200)
  title           String?           @db.VarChar(300)
  email           String?           @db.VarChar(200)
  phone           String?           @db.VarChar(50)
  yearsExperience Int?              @map("years_experience")
  skills          String[]          @default([])
  sectors         String[]          @default([])
  languages       String[]          @default([])
  cvFileKey       String?           @map("cv_file_key") @db.VarChar(500)
  cvFileName      String?           @map("cv_file_name") @db.VarChar(300)
  dailyRate       Decimal?          @map("daily_rate") @db.Decimal(12, 2)
  currency        String            @default("XOF") @db.VarChar(3)
  isActive        Boolean           @default(true) @map("is_active")
  notes           String?           @db.Text
  createdAt       DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  cabinet         Cabinet           @relation(fields: [cabinetId], references: [id], onDelete: Cascade)
  references      ReferenceMember[]

  @@index([cabinetId, kind])
  @@index([cabinetId, isActive])
  @@map("consultants")
}

model Reference {
  id              String            @id @default(uuid()) @db.Uuid
  cabinetId       String            @map("cabinet_id") @db.Uuid
  projectName     String            @map("project_name") @db.VarChar(500)
  clientName      String            @map("client_name") @db.VarChar(300)
  country         String?           @db.VarChar(50)
  sector          String?           @db.VarChar(200)
  description     String            @db.Text
  outcome         String?           @db.Text
  budget          Decimal?          @db.Decimal(15, 2)
  currency        String            @default("XOF") @db.VarChar(3)
  startDate       DateTime?         @map("start_date") @db.Date
  endDate         DateTime?         @map("end_date") @db.Date
  durationMonths  Int?              @map("duration_months")
  status          ReferenceStatus   @default(COMPLETED)
  tags            String[]          @default([])
  attachments     String[]          @default([])
  createdAt       DateTime          @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt       DateTime          @updatedAt @map("updated_at") @db.Timestamptz(6)

  cabinet         Cabinet           @relation(fields: [cabinetId], references: [id], onDelete: Cascade)
  members         ReferenceMember[]

  @@index([cabinetId, status])
  @@index([cabinetId, sector])
  @@map("references")
}

// Table pivot : un consultant peut être sur plusieurs références, et inversement
model ReferenceMember {
  referenceId  String     @map("reference_id") @db.Uuid
  consultantId String     @map("consultant_id") @db.Uuid
  role         String?    @db.VarChar(200)
  reference    Reference  @relation(fields: [referenceId], references: [id], onDelete: Cascade)
  consultant   Consultant @relation(fields: [consultantId], references: [id], onDelete: Cascade)

  @@id([referenceId, consultantId])
  @@map("reference_members")
}

// 3. AJOUTS DANS LE MODEL Cabinet
// Trouve ton model Cabinet et ajoute ces 2 lignes dans la section des relations :
//   consultants  Consultant[]
//   references   Reference[]
