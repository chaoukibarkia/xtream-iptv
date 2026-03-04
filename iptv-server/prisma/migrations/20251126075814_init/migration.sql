-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'BANNED', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "StreamType" AS ENUM ('LIVE', 'VOD', 'SERIES', 'RADIO');

-- CreateEnum
CREATE TYPE "ServerType" AS ENUM ('MAIN', 'LOAD_BALANCER', 'EDGE_STREAMER', 'TRANSCODER');

-- CreateEnum
CREATE TYPE "ServerStatus" AS ENUM ('ONLINE', 'OFFLINE', 'MAINTENANCE', 'OVERLOADED', 'DEGRADED');

-- CreateEnum
CREATE TYPE "RouteType" AS ENUM ('ROUND_ROBIN', 'LEAST_CONNECTIONS', 'LEAST_BANDWIDTH', 'GEOGRAPHIC', 'WEIGHTED', 'FAILOVER');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT,
    "maxConnections" INTEGER NOT NULL DEFAULT 1,
    "expirationDate" TIMESTAMP(3),
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "isReseller" BOOLEAN NOT NULL DEFAULT false,
    "isTrial" BOOLEAN NOT NULL DEFAULT false,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "resellerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastActivity" TIMESTAMP(3),
    "allowedOutputs" TEXT[] DEFAULT ARRAY['m3u8', 'ts']::TEXT[],
    "notes" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stream" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "streamType" "StreamType" NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "backupUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "epgChannelId" TEXT,
    "logoUrl" TEXT,
    "transcodeProfile" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "containerExtension" TEXT,
    "duration" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "tmdbId" INTEGER,
    "plot" TEXT,
    "cast" TEXT,
    "director" TEXT,
    "genre" TEXT,
    "rating" DOUBLE PRECISION,
    "backdropPath" TEXT,
    "youtubeTrailer" TEXT,
    "tvArchive" BOOLEAN NOT NULL DEFAULT false,
    "tvArchiveDuration" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Stream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "StreamType" NOT NULL,
    "parentId" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Series" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "cover" TEXT,
    "plot" TEXT,
    "cast" TEXT,
    "director" TEXT,
    "genre" TEXT,
    "releaseDate" TIMESTAMP(3),
    "rating" DOUBLE PRECISION,
    "rating5" DOUBLE PRECISION,
    "tmdbId" INTEGER,
    "backdropPath" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "youtubeTrailer" TEXT,
    "episodeRunTime" TEXT,
    "categoryId" INTEGER NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" SERIAL NOT NULL,
    "seriesId" INTEGER NOT NULL,
    "seasonNumber" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "title" TEXT,
    "plot" TEXT,
    "duration" INTEGER,
    "releaseDate" TIMESTAMP(3),
    "rating" DOUBLE PRECISION,
    "sourceUrl" TEXT NOT NULL,
    "backupUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "containerExtension" TEXT,
    "cover" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bouquet" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bouquet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BouquetStream" (
    "id" SERIAL NOT NULL,
    "bouquetId" INTEGER NOT NULL,
    "streamId" INTEGER NOT NULL,

    CONSTRAINT "BouquetStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserBouquet" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "bouquetId" INTEGER NOT NULL,

    CONSTRAINT "UserBouquet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpgSource" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "lastImport" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EpgSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EpgEntry" (
    "id" SERIAL NOT NULL,
    "streamId" INTEGER NOT NULL,
    "channelId" TEXT NOT NULL,
    "start" TIMESTAMP(3) NOT NULL,
    "end" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "language" TEXT,

    CONSTRAINT "EpgEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Connection" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "streamId" INTEGER NOT NULL,
    "serverId" INTEGER,
    "ipAddress" TEXT NOT NULL,
    "userAgent" TEXT,
    "countryCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Connection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Server" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServerType" NOT NULL,
    "status" "ServerStatus" NOT NULL DEFAULT 'OFFLINE',
    "internalIp" TEXT NOT NULL,
    "externalIp" TEXT NOT NULL,
    "httpPort" INTEGER NOT NULL DEFAULT 80,
    "httpsPort" INTEGER NOT NULL DEFAULT 443,
    "rtmpPort" INTEGER DEFAULT 1935,
    "apiPort" INTEGER NOT NULL DEFAULT 8080,
    "apiKey" TEXT NOT NULL,
    "maxBandwidthMbps" INTEGER NOT NULL DEFAULT 10000,
    "currentBandwidth" INTEGER NOT NULL DEFAULT 0,
    "maxConnections" INTEGER NOT NULL DEFAULT 5000,
    "currentConnections" INTEGER NOT NULL DEFAULT 0,
    "cpuUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "memoryUsage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "region" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "canTranscode" BOOLEAN NOT NULL DEFAULT true,
    "transcodeProfiles" TEXT[] DEFAULT ARRAY['passthrough', 'h264_720p', 'h264_1080p']::TEXT[],
    "supportsHls" BOOLEAN NOT NULL DEFAULT true,
    "supportsMpegts" BOOLEAN NOT NULL DEFAULT true,
    "supportsRtmp" BOOLEAN NOT NULL DEFAULT false,
    "lastHeartbeat" TIMESTAMP(3),
    "lastHealthCheck" TIMESTAMP(3),
    "healthScore" INTEGER NOT NULL DEFAULT 100,
    "failedChecks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Server_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerStream" (
    "id" SERIAL NOT NULL,
    "serverId" INTEGER NOT NULL,
    "streamId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "viewers" INTEGER NOT NULL DEFAULT 0,
    "bandwidth" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "ServerStream_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServerConnection" (
    "id" TEXT NOT NULL,
    "serverId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "streamId" INTEGER NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bandwidth" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ServerConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoadBalancerRule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "matchRegion" TEXT,
    "matchCountry" TEXT,
    "matchStreamType" "StreamType",
    "matchCategoryId" INTEGER,
    "routeType" "RouteType" NOT NULL DEFAULT 'ROUND_ROBIN',
    "targetServerIds" INTEGER[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoadBalancerRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_username_password_idx" ON "User"("username", "password");

-- CreateIndex
CREATE INDEX "User_resellerId_idx" ON "User"("resellerId");

-- CreateIndex
CREATE INDEX "Stream_streamType_categoryId_idx" ON "Stream"("streamType", "categoryId");

-- CreateIndex
CREATE INDEX "Stream_epgChannelId_idx" ON "Stream"("epgChannelId");

-- CreateIndex
CREATE INDEX "Category_type_idx" ON "Category"("type");

-- CreateIndex
CREATE INDEX "Series_categoryId_idx" ON "Series"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_seriesId_seasonNumber_episodeNumber_key" ON "Episode"("seriesId", "seasonNumber", "episodeNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BouquetStream_bouquetId_streamId_key" ON "BouquetStream"("bouquetId", "streamId");

-- CreateIndex
CREATE UNIQUE INDEX "UserBouquet_userId_bouquetId_key" ON "UserBouquet"("userId", "bouquetId");

-- CreateIndex
CREATE INDEX "EpgEntry_streamId_start_end_idx" ON "EpgEntry"("streamId", "start", "end");

-- CreateIndex
CREATE INDEX "EpgEntry_channelId_idx" ON "EpgEntry"("channelId");

-- CreateIndex
CREATE INDEX "Connection_userId_idx" ON "Connection"("userId");

-- CreateIndex
CREATE INDEX "Connection_streamId_idx" ON "Connection"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "Server_name_key" ON "Server"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Server_apiKey_key" ON "Server"("apiKey");

-- CreateIndex
CREATE INDEX "Server_type_status_idx" ON "Server"("type", "status");

-- CreateIndex
CREATE INDEX "Server_region_idx" ON "Server"("region");

-- CreateIndex
CREATE INDEX "ServerStream_streamId_idx" ON "ServerStream"("streamId");

-- CreateIndex
CREATE UNIQUE INDEX "ServerStream_serverId_streamId_key" ON "ServerStream"("serverId", "streamId");

-- CreateIndex
CREATE INDEX "ServerConnection_serverId_idx" ON "ServerConnection"("serverId");

-- CreateIndex
CREATE INDEX "ServerConnection_userId_idx" ON "ServerConnection"("userId");

-- CreateIndex
CREATE INDEX "LoadBalancerRule_isActive_priority_idx" ON "LoadBalancerRule"("isActive", "priority");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stream" ADD CONSTRAINT "Stream_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "Series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BouquetStream" ADD CONSTRAINT "BouquetStream_bouquetId_fkey" FOREIGN KEY ("bouquetId") REFERENCES "Bouquet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BouquetStream" ADD CONSTRAINT "BouquetStream_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBouquet" ADD CONSTRAINT "UserBouquet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserBouquet" ADD CONSTRAINT "UserBouquet_bouquetId_fkey" FOREIGN KEY ("bouquetId") REFERENCES "Bouquet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EpgEntry" ADD CONSTRAINT "EpgEntry_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Connection" ADD CONSTRAINT "Connection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerStream" ADD CONSTRAINT "ServerStream_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerStream" ADD CONSTRAINT "ServerStream_streamId_fkey" FOREIGN KEY ("streamId") REFERENCES "Stream"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServerConnection" ADD CONSTRAINT "ServerConnection_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "Server"("id") ON DELETE CASCADE ON UPDATE CASCADE;
