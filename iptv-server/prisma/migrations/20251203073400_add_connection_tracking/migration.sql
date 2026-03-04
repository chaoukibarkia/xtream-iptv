-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('LIVE', 'VOD', 'SERIES', 'RADIO');

-- AlterTable
ALTER TABLE "LineConnection" ADD COLUMN     "contentName" TEXT,
ADD COLUMN     "contentType" "ContentType" NOT NULL DEFAULT 'LIVE',
ADD COLUMN     "episodeId" INTEGER,
ADD COLUMN     "episodeNumber" INTEGER,
ADD COLUMN     "seasonNumber" INTEGER;

-- CreateIndex
CREATE INDEX "LineConnection_startedAt_idx" ON "LineConnection"("startedAt");

-- CreateIndex
CREATE INDEX "LineConnection_contentType_idx" ON "LineConnection"("contentType");
