import { FastifyPluginAsync } from 'fastify';
import { prisma } from '../../config/database.js';
import { logger } from '../../config/logger.js';
import { z } from 'zod';
import { EncodingMode } from '@prisma/client';
import { verifyToken } from './auth.js';

// Validation schemas - using .nullish() to accept both null and undefined
const createProfileSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().nullish(),
  
  // Encoding mode
  encodingMode: z.nativeEnum(EncodingMode).default('SOFTWARE'),
  
  // Video settings
  videoCodec: z.string().default('h264'),
  videoPreset: z.string().default('medium'),
  videoBitrate: z.number().int().positive().nullish(),
  videoBitrateMode: z.enum(['cbr', 'vbr', 'crf']).default('cbr'),
  crfValue: z.number().int().min(0).max(51).nullish(),
  maxBitrate: z.number().int().positive().nullish(),
  bufferSize: z.number().int().positive().nullish(),
  
  // Resolution
  resolutionWidth: z.number().int().positive().nullish(),
  resolutionHeight: z.number().int().positive().nullish(),
  resolutionPreset: z.enum(['480p', '720p', '1080p', '4k', 'original']).nullish(),
  scalingAlgorithm: z.enum(['bilinear', 'bicubic', 'lanczos', 'spline']).default('lanczos'),
  
  // Frame rate
  frameRate: z.number().positive().nullish(),
  frameRateMode: z.enum(['cfr', 'vfr', 'passthrough']).default('cfr'),
  
  // GOP
  gopSize: z.number().int().min(1).max(600).default(60),
  bFrames: z.number().int().min(0).max(16).default(2),
  
  // Audio settings
  audioCodec: z.string().default('aac'),
  audioBitrate: z.number().int().positive().default(128),
  audioSampleRate: z.number().int().positive().default(48000),
  audioChannels: z.number().int().min(1).max(8).default(2),
  
  // NVENC
  nvencEnabled: z.boolean().default(false),
  nvencPreset: z.string().nullish(),
  nvencRcMode: z.string().nullish(),
  nvencTuning: z.string().nullish(),
  nvencBFrames: z.number().int().nullish(),
  nvencLookahead: z.number().int().nullish(),
  
  // QSV
  qsvEnabled: z.boolean().default(false),
  qsvPreset: z.string().nullish(),
  
  // VAAPI
  vaapiEnabled: z.boolean().default(false),
  vaapiDevice: z.string().nullish(),
  
  // Additional
  additionalParams: z.string().nullish(),
  customUserAgent: z.string().nullish(),  // Custom User-Agent for fetching source streams
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true),
  requiresGpu: z.boolean().default(false),
  estimatedCpuLoad: z.number().min(0).max(100).default(50),
});

const updateProfileSchema = createProfileSchema.partial();

// Resolution presets
const resolutionPresets = {
  '480p': { width: 854, height: 480 },
  '720p': { width: 1280, height: 720 },
  '1080p': { width: 1920, height: 1080 },
  '4k': { width: 3840, height: 2160 },
  'original': { width: null, height: null },
};

// Default profiles for seeding
const defaultProfiles = [
  {
    name: 'Passthrough',
    description: 'No transcoding - direct stream copy',
    encodingMode: 'PASSTHROUGH' as EncodingMode,
    videoCodec: 'copy',
    audioCodec: 'copy',
    isDefault: true,
    requiresGpu: false,
    estimatedCpuLoad: 5,
  },
  {
    name: 'H.264 720p (CPU)',
    description: 'Software encoding to 720p H.264',
    encodingMode: 'SOFTWARE' as EncodingMode,
    videoCodec: 'h264',
    videoPreset: 'medium',
    videoBitrate: 3000,
    resolutionPreset: '720p',
    resolutionWidth: 1280,
    resolutionHeight: 720,
    gopSize: 60,
    audioCodec: 'aac',
    audioBitrate: 128,
    requiresGpu: false,
    estimatedCpuLoad: 60,
  },
  {
    name: 'H.264 1080p (CPU)',
    description: 'Software encoding to 1080p H.264',
    encodingMode: 'SOFTWARE' as EncodingMode,
    videoCodec: 'h264',
    videoPreset: 'medium',
    videoBitrate: 6000,
    resolutionPreset: '1080p',
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    gopSize: 60,
    audioCodec: 'aac',
    audioBitrate: 192,
    requiresGpu: false,
    estimatedCpuLoad: 80,
  },
  {
    name: 'H.264 720p (NVENC)',
    description: 'NVIDIA GPU encoding to 720p H.264',
    encodingMode: 'NVENC' as EncodingMode,
    videoCodec: 'h264',
    videoBitrate: 3000,
    resolutionPreset: '720p',
    resolutionWidth: 1280,
    resolutionHeight: 720,
    gopSize: 60,
    nvencEnabled: true,
    nvencPreset: 'p4',
    nvencRcMode: 'cbr',
    audioCodec: 'aac',
    audioBitrate: 128,
    requiresGpu: true,
    estimatedCpuLoad: 10,
  },
  {
    name: 'H.264 1080p (NVENC)',
    description: 'NVIDIA GPU encoding to 1080p H.264',
    encodingMode: 'NVENC' as EncodingMode,
    videoCodec: 'h264',
    videoBitrate: 6000,
    resolutionPreset: '1080p',
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    gopSize: 60,
    nvencEnabled: true,
    nvencPreset: 'p4',
    nvencRcMode: 'cbr',
    audioCodec: 'aac',
    audioBitrate: 192,
    requiresGpu: true,
    estimatedCpuLoad: 15,
  },
  {
    name: 'H.265 1080p (NVENC)',
    description: 'NVIDIA GPU encoding to 1080p H.265/HEVC',
    encodingMode: 'NVENC' as EncodingMode,
    videoCodec: 'h265',
    videoBitrate: 4000,
    resolutionPreset: '1080p',
    resolutionWidth: 1920,
    resolutionHeight: 1080,
    gopSize: 60,
    nvencEnabled: true,
    nvencPreset: 'p4',
    nvencRcMode: 'cbr',
    audioCodec: 'aac',
    audioBitrate: 192,
    requiresGpu: true,
    estimatedCpuLoad: 15,
  },
];

export const transcodingRoutes: FastifyPluginAsync = async (fastify) => {
  // Admin auth check
  fastify.addHook('preHandler', async (request, reply) => {
    const authHeader = request.headers.authorization;
    const apiKey = request.headers['x-api-key'];
    
    // Check for API key first (for admin API access)
    if (apiKey === process.env.ADMIN_API_KEY) {
      // API key auth - find admin user
      const adminUser = await prisma.user.findFirst({
        where: { role: 'ADMIN' },
      });
      if (adminUser) {
        (request as any).adminUser = adminUser;
        return;
      }
    }
    
    // Bearer token auth
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
    
    const token = authHeader.substring(7);

    // Verify token using imported function (now async)
    const tokenData = await verifyToken(token);

    if (!tokenData) {
      return reply.code(401).send({ error: 'Invalid or expired token' });
    }
    
    const adminUser = await prisma.user.findFirst({
      where: { id: tokenData.userId, role: 'ADMIN' },
    });
    
    if (!adminUser) {
      return reply.code(403).send({ error: 'Admin access required' });
    }
    
    (request as any).adminUser = adminUser;
  });

  // ============================================
  // TRANSCODING PROFILES
  // ============================================

  // Get all profiles
  fastify.get('/profiles', async (request, reply) => {
    try {
      const profiles = await prisma.transcodingProfile.findMany({
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          _count: {
            select: { streams: true },
          },
        },
      });

      return {
        profiles: profiles.map(p => ({
          ...p,
          streamCount: p._count.streams,
        })),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch transcoding profiles');
      return reply.code(500).send({ error: 'Failed to fetch profiles' });
    }
  });

  // Get single profile
  fastify.get('/profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const profile = await prisma.transcodingProfile.findUnique({
        where: { id: parseInt(id) },
        include: {
          streams: {
            select: { id: true, name: true, streamType: true },
            take: 10,
          },
          _count: {
            select: { streams: true },
          },
        },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      return { profile };
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch transcoding profile');
      return reply.code(500).send({ error: 'Failed to fetch profile' });
    }
  });

  // Create profile
  fastify.post('/profiles', async (request, reply) => {
    try {
      const data = createProfileSchema.parse(request.body);
      
      // If this is set as default, unset other defaults
      if (data.isDefault) {
        await prisma.transcodingProfile.updateMany({
          where: { isDefault: true },
          data: { isDefault: false },
        });
      }

      // Apply resolution preset
      if (data.resolutionPreset && resolutionPresets[data.resolutionPreset]) {
        const preset = resolutionPresets[data.resolutionPreset];
        data.resolutionWidth = preset.width ?? undefined;
        data.resolutionHeight = preset.height ?? undefined;
      }

      // Determine requiresGpu based on encoding mode
      if (data.encodingMode === 'NVENC' || data.encodingMode === 'QSV' || data.encodingMode === 'VAAPI') {
        data.requiresGpu = true;
      }

      const profile = await prisma.transcodingProfile.create({
        data,
      });

      logger.info(`Created transcoding profile: ${profile.name}`);
      return reply.code(201).send({ profile });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'Profile name already exists' });
      }
      logger.error('Failed to create transcoding profile:', error);
      return reply.code(400).send({ error: error.message || 'Failed to create profile' });
    }
  });

  // Update profile
  fastify.put('/profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const data = updateProfileSchema.parse(request.body);
      
      // If this is set as default, unset other defaults
      if (data.isDefault) {
        await prisma.transcodingProfile.updateMany({
          where: { isDefault: true, id: { not: parseInt(id) } },
          data: { isDefault: false },
        });
      }

      // Apply resolution preset
      if (data.resolutionPreset && resolutionPresets[data.resolutionPreset as keyof typeof resolutionPresets]) {
        const preset = resolutionPresets[data.resolutionPreset as keyof typeof resolutionPresets];
        data.resolutionWidth = preset.width ?? undefined;
        data.resolutionHeight = preset.height ?? undefined;
      }

      // Determine requiresGpu based on encoding mode
      if (data.encodingMode) {
        data.requiresGpu = ['NVENC', 'QSV', 'VAAPI'].includes(data.encodingMode);
      }

      const profile = await prisma.transcodingProfile.update({
        where: { id: parseInt(id) },
        data,
      });

      logger.info(`Updated transcoding profile: ${profile.name}`);
      return { profile };
    } catch (error: any) {
      if (error.code === 'P2025') {
        return reply.code(404).send({ error: 'Profile not found' });
      }
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'Profile name already exists' });
      }
      logger.error('Failed to update transcoding profile:', error);
      return reply.code(400).send({ error: error.message || 'Failed to update profile' });
    }
  });

  // Delete profile
  fastify.delete('/profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      // Check if profile is in use
      const profile = await prisma.transcodingProfile.findUnique({
        where: { id: parseInt(id) },
        include: { _count: { select: { streams: true } } },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      if (profile._count.streams > 0) {
        return reply.code(400).send({ 
          error: `Cannot delete profile - it is used by ${profile._count.streams} stream(s)` 
        });
      }

      await prisma.transcodingProfile.delete({
        where: { id: parseInt(id) },
      });

      logger.info(`Deleted transcoding profile: ${profile.name}`);
      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete transcoding profile');
      return reply.code(500).send({ error: 'Failed to delete profile' });
    }
  });

  // Duplicate profile
  fastify.post('/profiles/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = (request.body as { name?: string }) || {};
    
    try {
      const original = await prisma.transcodingProfile.findUnique({
        where: { id: parseInt(id) },
      });

      if (!original) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      // Create a copy with a new name
      const { id: _, createdAt, updatedAt, ...profileData } = original;
      const newProfile = await prisma.transcodingProfile.create({
        data: {
          ...profileData,
          name: name || `${original.name} (Copy)`,
          isDefault: false, // Duplicates should never be default
        },
      });

      logger.info(`Duplicated transcoding profile: ${original.name} -> ${newProfile.name}`);
      return reply.code(201).send({ profile: newProfile });
    } catch (error: any) {
      if (error.code === 'P2002') {
        return reply.code(409).send({ error: 'A profile with this name already exists' });
      }
      logger.error('Failed to duplicate transcoding profile:', error);
      return reply.code(500).send({ error: 'Failed to duplicate profile' });
    }
  });

  // Seed default profiles
  fastify.post('/profiles/seed', async (request, reply) => {
    try {
      const created = [];
      
      for (const profile of defaultProfiles) {
        const existing = await prisma.transcodingProfile.findUnique({
          where: { name: profile.name },
        });
        
        if (!existing) {
          const newProfile = await prisma.transcodingProfile.create({
            data: profile,
          });
          created.push(newProfile);
        }
      }

      logger.info(`Seeded ${created.length} default transcoding profiles`);
      return { 
        message: `Created ${created.length} default profiles`,
        profiles: created,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to seed transcoding profiles');
      return reply.code(500).send({ error: 'Failed to seed profiles' });
    }
  });

  // Generate FFmpeg command preview
  fastify.post('/profiles/:id/preview', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { inputUrl } = (request.body as { inputUrl?: string }) || {};
    
    try {
      const profile = await prisma.transcodingProfile.findUnique({
        where: { id: parseInt(id) },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      const command = generateFfmpegCommand(profile, inputUrl || 'input.ts', 'output.m3u8');
      return { command };
    } catch (error) {
      logger.error({ err: error }, 'Failed to generate FFmpeg command');
      return reply.code(500).send({ error: 'Failed to generate command' });
    }
  });

  // Get compatible servers for a profile
  fastify.get('/profiles/:id/compatible-servers', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const profile = await prisma.transcodingProfile.findUnique({
        where: { id: parseInt(id) },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }

      // Build server query based on profile requirements
      const whereClause: any = {
        canTranscode: true,
        status: 'ONLINE',
      };

      if (profile.encodingMode === 'NVENC' || profile.nvencEnabled) {
        whereClause.hasNvenc = true;
      } else if (profile.encodingMode === 'QSV' || profile.qsvEnabled) {
        whereClause.hasQsv = true;
      } else if (profile.encodingMode === 'VAAPI' || profile.vaapiEnabled) {
        whereClause.hasVaapi = true;
      }

      const servers = await prisma.server.findMany({
        where: whereClause,
        select: {
          id: true,
          name: true,
          status: true,
          hasNvenc: true,
          nvencGpuModel: true,
          hasQsv: true,
          hasVaapi: true,
          currentTranscodes: true,
          maxTranscodes: true,
          cpuUsage: true,
        },
        orderBy: [
          { currentTranscodes: 'asc' },
          { cpuUsage: 'asc' },
        ],
      });

      return { 
        profile: { id: profile.id, name: profile.name, requiresGpu: profile.requiresGpu },
        servers,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get compatible servers');
      return reply.code(500).send({ error: 'Failed to get compatible servers' });
    }
  });

  // ============================================
  // HELPER: Get servers with GPU info
  // ============================================
  
  fastify.get('/servers/capabilities', async (request, reply) => {
    try {
      const servers = await prisma.server.findMany({
        where: { canTranscode: true },
        select: {
          id: true,
          name: true,
          status: true,
          hasNvenc: true,
          nvencGpuModel: true,
          nvencMaxSessions: true,
          hasQsv: true,
          qsvModel: true,
          hasVaapi: true,
          vaapiDevice: true,
          currentTranscodes: true,
          maxTranscodes: true,
          cpuUsage: true,
          memoryUsage: true,
        },
        orderBy: { name: 'asc' },
      });

      return { servers };
    } catch (error) {
      logger.error({ err: error }, 'Failed to get server capabilities');
      return reply.code(500).send({ error: 'Failed to get server capabilities' });
    }
  });

  // ============================================
  // ABR PROFILES (Adaptive Bitrate)
  // ============================================

  // Get all ABR profiles
  fastify.get('/abr-profiles', async (request, reply) => {
    try {
      const profiles = await prisma.abrProfile.findMany({
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
        include: {
          _count: {
            select: { streams: true },
          },
        },
      });

      return {
        profiles: profiles.map(p => ({
          ...p,
          streamCount: p._count.streams,
        })),
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch ABR profiles');
      return reply.code(500).send({ error: 'Failed to fetch ABR profiles' });
    }
  });

  // Get single ABR profile
  fastify.get('/abr-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      const profile = await prisma.abrProfile.findUnique({
        where: { id: parseInt(id) },
        include: {
          _count: {
            select: { streams: true },
          },
        },
      });

      if (!profile) {
        return reply.code(404).send({ error: 'ABR profile not found' });
      }

      return { profile };
    } catch (error) {
      logger.error({ err: error }, 'Failed to fetch ABR profile');
      return reply.code(500).send({ error: 'Failed to fetch ABR profile' });
    }
  });

  // Create ABR profile
  fastify.post('/abr-profiles', async (request, reply) => {
    try {
      const data = request.body as any;
      
      const profile = await prisma.abrProfile.create({
        data: {
          name: data.name,
          description: data.description,
          isDefault: data.isDefault || false,
          isActive: data.isActive ?? true,
          variants: data.variants || [],
          videoCodec: data.videoCodec || 'libx264',
          audioCodec: data.audioCodec || 'aac',
          audioSampleRate: data.audioSampleRate || 48000,
          audioChannels: data.audioChannels || 2,
          gopSize: data.gopSize || 60,
          bFrames: data.bFrames || 2,
          hlsSegmentDuration: data.hlsSegmentDuration || 4,
          hlsPlaylistSize: data.hlsPlaylistSize || 5,
          hlsDeleteThreshold: data.hlsDeleteThreshold || 1,
          requiresGpu: data.requiresGpu ?? false,
          additionalParams: data.additionalParams,
        },
      });

      logger.info({ profileId: profile.id }, 'Created ABR profile');
      return reply.code(201).send({ profile });
    } catch (error) {
      logger.error({ err: error }, 'Failed to create ABR profile');
      return reply.code(500).send({ error: 'Failed to create ABR profile' });
    }
  });

  // Update ABR profile
  fastify.put('/abr-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const data = request.body as any;
    
    try {
      const profile = await prisma.abrProfile.update({
        where: { id: parseInt(id) },
        data: {
          name: data.name,
          description: data.description,
          isDefault: data.isDefault,
          isActive: data.isActive,
          variants: data.variants,
          videoCodec: data.videoCodec,
          audioCodec: data.audioCodec,
          audioSampleRate: data.audioSampleRate,
          audioChannels: data.audioChannels,
          gopSize: data.gopSize,
          bFrames: data.bFrames,
          hlsSegmentDuration: data.hlsSegmentDuration,
          hlsPlaylistSize: data.hlsPlaylistSize,
          hlsDeleteThreshold: data.hlsDeleteThreshold,
          requiresGpu: data.requiresGpu,
          additionalParams: data.additionalParams,
        },
      });

      logger.info({ profileId: profile.id }, 'Updated ABR profile');
      return { profile };
    } catch (error) {
      logger.error({ err: error }, 'Failed to update ABR profile');
      return reply.code(500).send({ error: 'Failed to update ABR profile' });
    }
  });

  // Delete ABR profile
  fastify.delete('/abr-profiles/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    
    try {
      // Check if any streams are using this profile
      const streamCount = await prisma.stream.count({
        where: { abrProfileId: parseInt(id) },
      });

      if (streamCount > 0) {
        return reply.code(400).send({
          error: `Cannot delete profile: ${streamCount} stream(s) are using it`,
        });
      }

      await prisma.abrProfile.delete({
        where: { id: parseInt(id) },
      });

      logger.info({ profileId: id }, 'Deleted ABR profile');
      return { success: true };
    } catch (error) {
      logger.error({ err: error }, 'Failed to delete ABR profile');
      return reply.code(500).send({ error: 'Failed to delete ABR profile' });
    }
  });

  // Duplicate ABR profile
  fastify.post('/abr-profiles/:id/duplicate', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };
    
    try {
      const original = await prisma.abrProfile.findUnique({
        where: { id: parseInt(id) },
      });

      if (!original) {
        return reply.code(404).send({ error: 'ABR profile not found' });
      }

      const profile = await prisma.abrProfile.create({
        data: {
          name: name || `${original.name} (Copy)`,
          description: original.description,
          isDefault: false,
          isActive: original.isActive,
          variants: original.variants as any,
          videoCodec: original.videoCodec,
          audioCodec: original.audioCodec,
          audioSampleRate: original.audioSampleRate,
          audioChannels: original.audioChannels,
          gopSize: original.gopSize,
          bFrames: original.bFrames,
          hlsSegmentDuration: original.hlsSegmentDuration,
          hlsPlaylistSize: original.hlsPlaylistSize,
          hlsDeleteThreshold: original.hlsDeleteThreshold,
          requiresGpu: original.requiresGpu,
          additionalParams: original.additionalParams,
        },
      });

      logger.info({ originalId: id, newId: profile.id }, 'Duplicated ABR profile');
      return reply.code(201).send({ profile });
    } catch (error) {
      logger.error({ err: error }, 'Failed to duplicate ABR profile');
      return reply.code(500).send({ error: 'Failed to duplicate ABR profile' });
    }
  });

  // Seed default ABR profiles
  fastify.post('/abr-profiles/seed-defaults', async (request, reply) => {
    try {
      const defaultProfiles = [
        {
          name: 'Standard ABR (720p/480p/360p)',
          description: 'Standard adaptive bitrate profile with three quality tiers',
          isDefault: true,
          isActive: true,
          variants: [
            { name: '720p', width: 1280, height: 720, bitrate: 2500, maxBitrate: 3500 },
            { name: '480p', width: 854, height: 480, bitrate: 1200, maxBitrate: 1600 },
            { name: '360p', width: 640, height: 360, bitrate: 600, maxBitrate: 800 },
          ],
          videoCodec: 'libx264',
          audioCodec: 'aac',
          audioBitrate: 128,
          audioSampleRate: 48000,
          audioChannels: 2,
          gopSize: 60,
          bFrames: 2,
          hlsSegmentDuration: 4,
          hlsPlaylistSize: 5,
          hlsDeleteThreshold: 1,
          keyframeInterval: 2,
          sceneDetection: false,
          requiresGpu: false,
        },
        {
          name: 'High Quality ABR (1080p/720p/480p)',
          description: 'High quality profile for HD content',
          isDefault: false,
          isActive: true,
          variants: [
            { name: '1080p', width: 1920, height: 1080, bitrate: 5000, maxBitrate: 6500 },
            { name: '720p', width: 1280, height: 720, bitrate: 2500, maxBitrate: 3500 },
            { name: '480p', width: 854, height: 480, bitrate: 1200, maxBitrate: 1600 },
          ],
          videoCodec: 'libx264',
          audioCodec: 'aac',
          audioBitrate: 192,
          audioSampleRate: 48000,
          audioChannels: 2,
          gopSize: 60,
          bFrames: 2,
          hlsSegmentDuration: 4,
          hlsPlaylistSize: 5,
          hlsDeleteThreshold: 1,
          keyframeInterval: 2,
          sceneDetection: false,
          requiresGpu: false,
        },
        {
          name: 'NVENC ABR (1080p/720p/480p)',
          description: 'GPU-accelerated encoding with NVIDIA NVENC',
          isDefault: false,
          isActive: true,
          variants: [
            { name: '1080p', width: 1920, height: 1080, bitrate: 5000, maxBitrate: 6500 },
            { name: '720p', width: 1280, height: 720, bitrate: 2500, maxBitrate: 3500 },
            { name: '480p', width: 854, height: 480, bitrate: 1200, maxBitrate: 1600 },
          ],
          videoCodec: 'h264_nvenc',
          audioCodec: 'aac',
          audioBitrate: 192,
          audioSampleRate: 48000,
          audioChannels: 2,
          gopSize: 60,
          bFrames: 2,
          hlsSegmentDuration: 4,
          hlsPlaylistSize: 5,
          hlsDeleteThreshold: 1,
          keyframeInterval: 2,
          sceneDetection: false,
          requiresGpu: true,
        },
        {
          name: 'Low Latency ABR',
          description: 'Low latency profile for live streaming',
          isDefault: false,
          isActive: true,
          variants: [
            { name: '720p', width: 1280, height: 720, bitrate: 2500, maxBitrate: 3500 },
            { name: '480p', width: 854, height: 480, bitrate: 1200, maxBitrate: 1600 },
            { name: '360p', width: 640, height: 360, bitrate: 600, maxBitrate: 800 },
          ],
          videoCodec: 'libx264',
          audioCodec: 'aac',
          audioBitrate: 128,
          audioSampleRate: 48000,
          audioChannels: 2,
          gopSize: 30,
          bFrames: 0,
          hlsSegmentDuration: 2,
          hlsPlaylistSize: 3,
          hlsDeleteThreshold: 1,
          keyframeInterval: 1,
          sceneDetection: false,
          requiresGpu: false,
        },
      ];

      let created = 0;
      for (const profile of defaultProfiles) {
        const existing = await prisma.abrProfile.findFirst({
          where: { name: profile.name },
        });
        if (!existing) {
          await prisma.abrProfile.create({ data: profile });
          created++;
        }
      }

      return {
        message: created > 0 ? `Created ${created} default ABR profile(s)` : 'Default ABR profiles already exist',
        created,
      };
    } catch (error) {
      logger.error({ err: error }, 'Failed to seed default ABR profiles');
      return reply.code(500).send({ error: 'Failed to seed default ABR profiles' });
    }
  });
};

// Helper function to generate FFmpeg command from profile
function generateFfmpegCommand(profile: any, input: string, output: string): string {
  const args: string[] = ['ffmpeg', '-i', input];

  if (profile.encodingMode === 'PASSTHROUGH') {
    args.push('-c:v', 'copy', '-c:a', 'copy');
  } else {
    // Video codec
    if (profile.encodingMode === 'NVENC' && profile.nvencEnabled) {
      const nvencCodec = profile.videoCodec === 'h265' ? 'hevc_nvenc' : 'h264_nvenc';
      args.push('-c:v', nvencCodec);
      
      if (profile.nvencPreset) args.push('-preset', profile.nvencPreset);
      if (profile.nvencRcMode) args.push('-rc', profile.nvencRcMode);
      if (profile.nvencTuning) args.push('-tune', profile.nvencTuning);
      if (profile.nvencBFrames !== null) args.push('-b_ref_mode', 'middle');
    } else if (profile.encodingMode === 'QSV' && profile.qsvEnabled) {
      const qsvCodec = profile.videoCodec === 'h265' ? 'hevc_qsv' : 'h264_qsv';
      args.push('-c:v', qsvCodec);
      if (profile.qsvPreset) args.push('-preset', profile.qsvPreset);
    } else if (profile.encodingMode === 'VAAPI' && profile.vaapiEnabled) {
      const vaapiCodec = profile.videoCodec === 'h265' ? 'hevc_vaapi' : 'h264_vaapi';
      args.push('-c:v', vaapiCodec);
    } else {
      // Software encoding
      const softCodec = profile.videoCodec === 'h265' ? 'libx265' : 
                        profile.videoCodec === 'vp9' ? 'libvpx-vp9' :
                        profile.videoCodec === 'av1' ? 'libsvtav1' : 'libx264';
      args.push('-c:v', softCodec);
      args.push('-preset', profile.videoPreset || 'medium');
    }

    // Video bitrate
    if (profile.videoBitrateMode === 'crf' && profile.crfValue !== null) {
      args.push('-crf', String(profile.crfValue));
    } else if (profile.videoBitrate) {
      args.push('-b:v', `${profile.videoBitrate}k`);
      if (profile.videoBitrateMode === 'vbr' && profile.maxBitrate) {
        args.push('-maxrate', `${profile.maxBitrate}k`);
        if (profile.bufferSize) args.push('-bufsize', `${profile.bufferSize}k`);
      }
    }

    // Resolution
    if (profile.resolutionWidth && profile.resolutionHeight) {
      args.push('-vf', `scale=${profile.resolutionWidth}:${profile.resolutionHeight}:flags=${profile.scalingAlgorithm || 'lanczos'}`);
    }

    // Frame rate
    if (profile.frameRate) {
      args.push('-r', String(profile.frameRate));
    }

    // GOP
    args.push('-g', String(profile.gopSize || 60));
    if (profile.bFrames !== null) {
      args.push('-bf', String(profile.bFrames));
    }

    // Audio
    if (profile.audioCodec === 'copy') {
      args.push('-c:a', 'copy');
    } else {
      const audioCodec = profile.audioCodec === 'aac' ? 'aac' :
                         profile.audioCodec === 'opus' ? 'libopus' :
                         profile.audioCodec === 'mp3' ? 'libmp3lame' : 'aac';
      args.push('-c:a', audioCodec);
      args.push('-b:a', `${profile.audioBitrate || 128}k`);
      args.push('-ar', String(profile.audioSampleRate || 48000));
      args.push('-ac', String(profile.audioChannels || 2));
    }
  }

  // Additional params
  if (profile.additionalParams) {
    args.push(...profile.additionalParams.split(' ').filter(Boolean));
  }

  // Output
  args.push(output);

  return args.join(' ');
}

