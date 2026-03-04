import { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { prisma } from '../../config/database.js';
import { verifyToken } from './auth.js';
import { config } from '../../config/index.js';
import { z } from 'zod';
import { logger } from '../../config/logger.js';
import { promises as fs } from 'fs';
import path from 'path';
import { ApplicationPlatform, UserRole } from '@prisma/client';
import { pipeline } from 'stream/promises';
import { createWriteStream } from 'fs';

interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
}

const uploadSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(['ANDROID', 'IOS', 'WEB', 'WINDOWS', 'MAC']),
  version: z.string().min(1),
  uploadNotes: z.string().optional(),
});

const updateActiveSchema = z.object({
  applicationId: z.number(),
  isActive: z.boolean(),
});

const applicationsRoutes: FastifyPluginAsync = async (fastify) => {
  // Use /media/applications for persistent storage (bind-mounted from host)
  const uploadsDir = '/media/applications';

  async function ensureUploadsDir() {
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir, { recursive: true });
    }
  }

  async function authenticateAdmin(request: FastifyRequest, reply: any) {
    const apiKey = request.headers['x-api-key'];
    const authHeader = request.headers['authorization'];

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const tokenData = await verifyToken(token);

      if (tokenData) {
        const user = await prisma.user.findUnique({
          where: { id: tokenData.userId },
          select: { id: true, username: true, role: true },
        });

        if (user) {
          (request as any).user = user as AuthUser;
          return;
        }
      }
    }

    if (!apiKey || typeof apiKey !== 'string') {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    if (apiKey !== config.admin.apiKey) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const adminUser = await prisma.user.findFirst({
      where: { role: UserRole.ADMIN },
      select: { id: true, username: true, role: true },
    });

    if (adminUser) {
      (request as any).user = adminUser as AuthUser;
    }
  }

  fastify.post('/api/admin/applications/upload', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    try {
      await ensureUploadsDir();

      // Parse multipart form data
      const parts = request.parts();
      
      let name: string | null = null;
      let platform: string | null = null;
      let version: string | null = null;
      let uploadNotes: string | null = null;
      let fileBuffer: Buffer | null = null;
      let originalFilename: string | null = null;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'name') name = part.value as string;
          else if (part.fieldname === 'platform') platform = part.value as string;
          else if (part.fieldname === 'version') version = part.value as string;
          else if (part.fieldname === 'uploadNotes') uploadNotes = part.value as string;
        } else if (part.type === 'file') {
          originalFilename = part.filename;
          const chunks: Buffer[] = [];
          for await (const chunk of part.file) {
            chunks.push(chunk);
          }
          fileBuffer = Buffer.concat(chunks);
        }
      }

      // Validate required fields
      if (!name || !platform || !version) {
        return reply.status(400).send({ error: 'Missing required fields: name, platform, version' });
      }

      if (!fileBuffer || !originalFilename) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // Validate schema
      const data = uploadSchema.parse({ name, platform, version, uploadNotes });

      const fileExtension = path.extname(originalFilename || '');
      const platformToExtension: Record<string, string> = {
        ANDROID: '.apk',
        IOS: '.ipa',
        WEB: '.zip',
        WINDOWS: '.exe',
        MAC: '.dmg',
      };

      const expectedExtension = platformToExtension[data.platform];
      if (fileExtension.toLowerCase() !== expectedExtension) {
        return reply.status(400).send({
          error: `Invalid file type for ${data.platform}. Expected ${expectedExtension}`,
        });
      }

      const safeFileName = `${data.name}_${data.version}${fileExtension}`;
      const filePath = path.join(uploadsDir, safeFileName);

      // Write file to disk
      await fs.writeFile(filePath, fileBuffer);

      const stats = await fs.stat(filePath);

      const application = await prisma.application.create({
        data: {
          name: data.name,
          platform: data.platform,
          version: data.version,
          fileName: safeFileName,
          filePath: filePath,
          fileSize: stats.size,
          isActive: false,
          uploadNotes: data.uploadNotes,
          uploadedBy: (request as any).user?.id,
        },
      });

      logger.info({
        name: data.name,
        platform: data.platform,
        version: data.version,
        uploadedBy: (request as any).user?.id,
      }, 'Application uploaded successfully');

      return reply.send({
        success: true,
        message: 'Application uploaded successfully',
        data: {
          id: application.id,
          name: data.name,
          platform: data.platform,
          version: data.version,
          fileName: safeFileName,
          fileSize: stats.size,
        },
      });
    } catch (error: any) {
      logger.error({ error }, 'Error uploading application');
      return reply.status(500).send({ error: error.message || 'Failed to upload application' });
    }
  });

  fastify.get('/api/admin/applications', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    try {
      const applications = await prisma.application.findMany({
        orderBy: [
          { platform: 'asc' },
          { createdAt: 'desc' },
        ],
      });

      return reply.send({ applications });
    } catch (error: any) {
      logger.error({ error }, 'Error fetching applications');
      return reply.status(500).send({ error: 'Failed to fetch applications' });
    }
  });

  fastify.put('/api/admin/applications/:id/active', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };
      const body = updateActiveSchema.parse(request.body);

      const application = await prisma.application.findUnique({
        where: { id: parseInt(id) },
      });

      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      if (body.isActive) {
        await prisma.application.updateMany({
          where: {
            platform: application.platform,
            id: { not: parseInt(id) },
          },
          data: { isActive: false },
        });
      }

      const updatedApplication = await prisma.application.update({
        where: { id: parseInt(id) },
        data: { isActive: body.isActive },
      });

      logger.info({
        applicationId: parseInt(id),
        platform: application.platform,
        isActive: body.isActive,
      }, 'Application active status updated');

      return reply.send({ application: updatedApplication });
    } catch (error: any) {
      logger.error({ error }, 'Error updating application status');
      return reply.status(500).send({ error: 'Failed to update application status' });
    }
  });

  fastify.delete('/api/admin/applications/:id', {
    preHandler: [authenticateAdmin],
  }, async (request, reply) => {
    try {
      const { id } = request.params as { id: string };

      const application = await prisma.application.findUnique({
        where: { id: parseInt(id) },
      });

      if (!application) {
        return reply.status(404).send({ error: 'Application not found' });
      }

      try {
        await fs.unlink(application.filePath);
      } catch (error) {
        logger.warn({ filePath: application.filePath }, 'Failed to delete application file');
      }

      await prisma.application.delete({
        where: { id: parseInt(id) },
      });

      logger.info({ applicationId: parseInt(id) }, 'Application deleted successfully');

      return reply.send({ success: true, message: 'Application deleted successfully' });
    } catch (error: any) {
      logger.error({ error }, 'Error deleting application');
      return reply.status(500).send({ error: 'Failed to delete application' });
    }
  });

  fastify.get('/api/public/applications/:platform/latest', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };

      const application = await prisma.application.findFirst({
        where: {
          platform: platform.toUpperCase() as ApplicationPlatform,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!application) {
        return reply.status(404).send({ error: 'No active application found for this platform' });
      }

      const publicUrl = `/apps/${platform.toLowerCase()}/${application.fileName}`;

      return reply.send({
        name: application.name,
        platform: application.platform,
        version: application.version,
        downloadUrl: publicUrl,
        fileSize: application.fileSize,
        uploadNotes: application.uploadNotes,
      });
    } catch (error: any) {
      logger.error({ error }, 'Error fetching latest application');
      return reply.status(500).send({ error: 'Failed to fetch latest application' });
    }
  });

  // Download latest executable by platform - always serves the newest active version
  // URLs: /apps/android/latest, /apps/ios/latest, /apps/windows/latest, /apps/mac/latest
  fastify.get('/apps/:platform/latest', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };

      const application = await prisma.application.findFirst({
        where: {
          platform: platform.toUpperCase() as ApplicationPlatform,
          isActive: true,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (!application) {
        return reply.status(404).send({ error: `No active application found for platform: ${platform}` });
      }

      const filePath = path.join(uploadsDir, application.fileName);

      try {
        await fs.access(filePath);
      } catch {
        logger.error({ filePath, application: application.id }, 'Application file not found on disk');
        return reply.status(404).send({ error: 'Application file not found' });
      }

      const stats = await fs.stat(filePath);

      // Set appropriate content type based on platform
      const contentTypes: Record<string, string> = {
        ANDROID: 'application/vnd.android.package-archive',
        IOS: 'application/octet-stream',
        WINDOWS: 'application/x-msdownload',
        MAC: 'application/x-apple-diskimage',
        WEB: 'application/zip',
      };

      reply.header('Content-Type', contentTypes[application.platform] || 'application/octet-stream');
      reply.header('Content-Length', stats.size);
      reply.header('Content-Disposition', `attachment; filename="${application.fileName}"`);
      reply.header('Cache-Control', 'no-cache'); // Don't cache so users always get latest
      reply.header('X-App-Version', application.version);
      reply.header('X-App-Name', application.name);

      const fileBuffer = await fs.readFile(filePath);
      return reply.send(fileBuffer);
    } catch (error: any) {
      logger.error({ error }, 'Error serving latest application');
      return reply.status(500).send({ error: 'Failed to serve application file' });
    }
  });

  // Download specific file by filename
  fastify.get('/apps/:platform/:filename', async (request, reply) => {
    try {
      const { platform, filename } = request.params as { platform: string; filename: string };

      // Skip if this is the "latest" route (handled above)
      if (filename === 'latest') {
        return; // Already handled by the route above
      }

      const filePath = path.join(uploadsDir, filename);

      try {
        await fs.access(filePath);
      } catch {
        return reply.status(404).send({ error: 'File not found' });
      }

      const stats = await fs.stat(filePath);

      reply.header('Content-Type', 'application/octet-stream');
      reply.header('Content-Length', stats.size);
      reply.header('Content-Disposition', `attachment; filename="${filename}"`);
      reply.header('Cache-Control', 'public, max-age=86400');

      const stream = await fs.readFile(filePath);
      return reply.send(stream);
    } catch (error: any) {
      logger.error({ error }, 'Error serving application file');
      return reply.status(500).send({ error: 'Failed to serve application file' });
    }
  });
};

export default applicationsRoutes;
