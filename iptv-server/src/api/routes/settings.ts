import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { settingsService } from '../../services/settings/index.js';
import { logger } from '../../config/logger.js';
import { prisma } from '../../config/database.js';
import axios from 'axios';

// Validation schemas
const updateSettingSchema = z.object({
  value: z.union([z.string(), z.number(), z.boolean()]),
  type: z.enum(['string', 'number', 'boolean', 'json']).optional(),
});

const updateManySettingsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()])
);

export const settingsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * Get all settings (grouped by category)
   * GET /admin/settings
   */
  fastify.get('/', async (request, reply) => {
    try {
      const settings = await settingsService.getAll();
      return settings;
    } catch (error: any) {
      logger.error({ error }, 'Failed to get settings');
      return reply.status(500).send({ error: 'Failed to retrieve settings' });
    }
  });

  /**
   * Get all settings (flat)
   * GET /admin/settings/flat
   */
  fastify.get('/flat', async (request, reply) => {
    try {
      const settings = await settingsService.getAllFlat();
      return settings;
    } catch (error: any) {
      logger.error({ error }, 'Failed to get flat settings');
      return reply.status(500).send({ error: 'Failed to retrieve settings' });
    }
  });

  /**
   * Get a specific setting
   * GET /admin/settings/:key
   */
  fastify.get('/:key', async (request, reply) => {
    const { key } = request.params as { key: string };

    try {
      const value = await settingsService.get(key);
      if (value === null) {
        return reply.status(404).send({ error: 'Setting not found' });
      }
      return { key, value };
    } catch (error: any) {
      logger.error({ error, key }, 'Failed to get setting');
      return reply.status(500).send({ error: 'Failed to retrieve setting' });
    }
  });

  /**
   * Update a specific setting
   * PUT /admin/settings/:key
   */
  fastify.put('/:key', async (request, reply) => {
    const { key } = request.params as { key: string };

    try {
      const { value, type } = updateSettingSchema.parse(request.body);
      await settingsService.set(key, value, type);

      // If TMDB language was updated, clear TMDB cache
      if (key === 'tmdb.language') {
        logger.info({ language: value }, 'TMDB language setting updated');
      }

      return { success: true, key, value };
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
      }
      logger.error({ error, key }, 'Failed to update setting');
      return reply.status(500).send({ error: 'Failed to update setting' });
    }
  });

  /**
   * Update multiple settings at once
   * PUT /admin/settings
   */
  fastify.put('/', async (request, reply) => {
    try {
      const settings = updateManySettingsSchema.parse(request.body);
      await settingsService.setMany(settings);

      // If TMDB language was updated, log it
      if ('tmdb.language' in settings) {
        logger.info({ language: settings['tmdb.language'] }, 'TMDB language setting updated');
      }

      return { success: true, updated: Object.keys(settings).length };
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return reply.status(400).send({ error: 'Invalid request body', details: error.errors });
      }
      logger.error({ error }, 'Failed to update settings');
      return reply.status(500).send({ error: 'Failed to update settings' });
    }
  });

  /**
   * Delete a setting (reset to default)
   * DELETE /admin/settings/:key
   */
  fastify.delete('/:key', async (request, reply) => {
    const { key } = request.params as { key: string };

    try {
      await settingsService.delete(key);
      return { success: true, key };
    } catch (error: any) {
      logger.error({ error, key }, 'Failed to delete setting');
      return reply.status(500).send({ error: 'Failed to delete setting' });
    }
  });

  /**
   * Reload settings cache
   * POST /admin/settings/reload
   */
  fastify.post('/reload', async (request, reply) => {
    try {
      await settingsService.loadCache();
      return { success: true, message: 'Settings cache reloaded' };
    } catch (error: any) {
      logger.error({ error }, 'Failed to reload settings cache');
      return reply.status(500).send({ error: 'Failed to reload settings' });
    }
  });

  /**
   * Test admin preview line configuration
   * POST /admin/settings/test-preview-line
   * Tests if the configured preview line can successfully access a stream
   */
  fastify.post('/test-preview-line', {
    config: {
      // Allow empty body
    },
    schema: {
      body: {
        type: 'object',
        properties: {
          streamId: { type: 'number' },
          streamType: { type: 'string', enum: ['live', 'vod'] },
          username: { type: 'string' },
          password: { type: 'string' }
        },
        additionalProperties: false
      }
    }
  }, async (request, reply) => {
    try {
      const body = (request.body || {}) as { streamId?: number; streamType?: 'live' | 'vod'; username?: string; password?: string };
      
      // Get preview line credentials from request body first, fall back to saved settings
      let previewUsername = body.username;
      let previewPassword = body.password;
      
      if (!previewUsername || !previewPassword) {
        previewUsername = await settingsService.get('streaming.previewLineUsername') as string | undefined;
        previewPassword = await settingsService.get('streaming.previewLinePassword') as string | undefined;
      }
      
      if (!previewUsername || !previewPassword) {
        return reply.status(400).send({ 
          success: false, 
          error: 'Preview line not configured. Please set username and password first.' 
        });
      }

      // Validate the line exists in database
      const line = await prisma.iptvLine.findFirst({
        where: {
          username: previewUsername as string,
          password: previewPassword as string,
        },
        include: {
          bouquets: {
            include: {
              bouquet: true
            }
          }
        }
      });

      if (!line) {
        return reply.status(400).send({ 
          success: false, 
          error: 'Configured line not found in database. Please check the username and password.' 
        });
      }

      // Check if line is active
      if (line.status !== 'active') {
        return reply.status(400).send({ 
          success: false, 
          error: `Line is not active. Current status: ${line.status}` 
        });
      }

      // Check if line is expired
      if (line.expiresAt && new Date(line.expiresAt) < new Date()) {
        return reply.status(400).send({ 
          success: false, 
          error: 'Line has expired.' 
        });
      }

      // Get the server URL from the request (what the browser is using)
      const protocol = request.headers['x-forwarded-proto'] || request.protocol || 'https';
      const host = request.headers['x-forwarded-host'] || request.headers.host || request.hostname;
      const serverUrl = `${protocol}://${host}`;

      // If streamId provided, test that specific stream
      if (body.streamId) {
        const stream = await prisma.stream.findUnique({
          where: { id: body.streamId },
          include: { category: true }
        });

        if (!stream) {
          return reply.status(404).send({ 
            success: false, 
            error: 'Stream not found' 
          });
        }

        // Check if line has access to this stream via bouquets
        const bouquetIds = line.bouquets.map(b => b.bouquet.id);
        const streamBouquets = await prisma.bouquetStream.findMany({
          where: { streamId: stream.id }
        });
        
        const hasAccess = streamBouquets.length === 0 || 
                          streamBouquets.some(sb => bouquetIds.includes(sb.bouquetId));

        if (!hasAccess) {
          return reply.status(403).send({ 
            success: false, 
            error: 'Line does not have access to this stream. Check bouquet assignments.' 
          });
        }

        // Build stream URL based on type
        let streamUrl: string;
        const streamType = body.streamType || (stream.streamType === 'VOD' ? 'vod' : 'live');
        
        if (streamType === 'vod') {
          streamUrl = `${serverUrl}/movie/${previewUsername}/${previewPassword}/${stream.id}.m3u8`;
        } else {
          streamUrl = `${serverUrl}/live/${previewUsername}/${previewPassword}/${stream.id}.m3u8`;
        }

        // Test the stream URL with a HEAD request
        try {
          const response = await axios.head(streamUrl, { 
            timeout: 10000,
            validateStatus: (status) => status < 500 
          });
          
          return {
            success: true,
            message: 'Stream test successful',
            line: {
              username: line.username,
              status: line.status,
              maxConnections: line.maxConnections,
              bouquetCount: line.bouquets.length,
              expiresAt: line.expiresAt
            },
            stream: {
              id: stream.id,
              name: stream.name,
              type: stream.streamType,
              url: streamUrl
            },
            response: {
              status: response.status,
              contentType: response.headers['content-type']
            }
          };
        } catch (axiosError: any) {
          return {
            success: false,
            error: `Stream test failed: ${axiosError.message}`,
            line: {
              username: line.username,
              status: line.status
            },
            stream: {
              id: stream.id,
              name: stream.name,
              url: streamUrl
            }
          };
        }
      }

      // No stream specified - just validate the line configuration
      return {
        success: true,
        message: 'Preview line is valid and active',
        line: {
          id: line.id,
          username: line.username,
          status: line.status,
          maxConnections: line.maxConnections,
          bouquetCount: line.bouquets.length,
          bouquets: line.bouquets.map(b => ({ id: b.bouquet.id, name: b.bouquet.name })),
          expiresAt: line.expiresAt,
          allowHls: line.allowHls,
          allowMpegts: line.allowMpegts
        }
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to test preview line');
      return reply.status(500).send({ error: 'Failed to test preview line: ' + error.message });
    }
  });

  /**
   * Get available lines for preview selection
   * GET /admin/settings/preview-lines
   */
  fastify.get('/preview-lines', async (request, reply) => {
    try {
      const lines = await prisma.iptvLine.findMany({
        where: {
          status: 'active',
          OR: [
            { expiresAt: null },
            { expiresAt: { gt: new Date() } }
          ]
        },
        select: {
          id: true,
          username: true,
          maxConnections: true,
          expiresAt: true,
          bouquets: {
            select: {
              bouquet: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        },
        orderBy: { username: 'asc' },
        take: 100
      });

      return {
        lines: lines.map(l => ({
          id: l.id,
          username: l.username,
          maxConnections: l.maxConnections,
          expiresAt: l.expiresAt,
          bouquetCount: l.bouquets.length,
          bouquets: l.bouquets.map(b => b.bouquet.name)
        }))
      };
    } catch (error: any) {
      logger.error({ error }, 'Failed to get preview lines');
      return reply.status(500).send({ error: 'Failed to get available lines' });
    }
  });
};

export default settingsRoutes;
