-- Add ActivationCode table + enum
-- Uses conditional DDL to avoid errors on partially provisioned databases.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ActivationCodeStatus') THEN
    CREATE TYPE "ActivationCodeStatus" AS ENUM ('UNUSED', 'USED', 'EXPIRED', 'REVOKED');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ActivationCode'
  ) THEN
    CREATE TABLE "ActivationCode" (
      "id" SERIAL NOT NULL,
      "code" VARCHAR(14) NOT NULL,
      "status" "ActivationCodeStatus" NOT NULL DEFAULT 'UNUSED',
      "bouquetIds" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
      "maxConnections" INTEGER NOT NULL DEFAULT 1,
      "subscriptionDays" INTEGER NOT NULL DEFAULT 30,
      "isTrial" BOOLEAN NOT NULL DEFAULT false,
      "codeExpiresAt" TIMESTAMP(3),
      "createdById" INTEGER NOT NULL,
      "usedAt" TIMESTAMP(3),
      "usedByLineId" INTEGER,
      "usedFromIp" TEXT,
      "usedDeviceId" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

      CONSTRAINT "ActivationCode_pkey" PRIMARY KEY ("id")
    );

    CREATE UNIQUE INDEX "ActivationCode_code_key" ON "ActivationCode"("code");
    CREATE UNIQUE INDEX "ActivationCode_usedByLineId_key" ON "ActivationCode"("usedByLineId");

    CREATE INDEX "ActivationCode_code_idx" ON "ActivationCode"("code");
    CREATE INDEX "ActivationCode_status_idx" ON "ActivationCode"("status");
    CREATE INDEX "ActivationCode_createdById_idx" ON "ActivationCode"("createdById");
  END IF;
END $$;

-- Add foreign keys only if the referenced tables exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'User'
  ) THEN
    BEGIN
      ALTER TABLE "ActivationCode"
      ADD CONSTRAINT "ActivationCode_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      -- constraint already exists
      NULL;
    END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'IptvLine'
  ) THEN
    BEGIN
      ALTER TABLE "ActivationCode"
      ADD CONSTRAINT "ActivationCode_usedByLineId_fkey"
      FOREIGN KEY ("usedByLineId") REFERENCES "IptvLine"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
