import { FastifyPluginAsync } from 'fastify';
import { authenticateIptvLine, AuthQuery } from '../middlewares/auth.js';
import { epgGenerator } from '../../services/epg/EpgGenerator.js';

interface BouquetItem {
  bouquet: { id: number };
}

export const epgRoutes: FastifyPluginAsync = async (fastify) => {
  // xmltv.php endpoint (Xtream Codes compatible)
  fastify.get<{ Querystring: AuthQuery }>(
    '/xmltv.php',
    { preHandler: authenticateIptvLine },
    async (request, reply) => {
      const line = request.line || request.user;
      const bouquetIds = line!.bouquets.map((b: BouquetItem) => b.bouquet.id);

      const xmltv = await epgGenerator.generateXmltv(bouquetIds);

      reply.header('Content-Type', 'application/xml');
      reply.header('Content-Disposition', 'attachment; filename="epg.xml"');

      return xmltv;
    }
  );

  // Alternative EPG endpoint
  fastify.get<{ Querystring: AuthQuery }>(
    '/epg/:username/:password',
    {
      preHandler: async (request, reply) => {
        const params = request.params as { username: string; password: string };
        request.query.username = params.username;
        request.query.password = params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const line = request.line || request.user;
      const bouquetIds = line!.bouquets.map((b: BouquetItem) => b.bouquet.id);

      const xmltv = await epgGenerator.generateXmltv(bouquetIds);

      reply.header('Content-Type', 'application/xml');
      reply.header('Content-Disposition', 'attachment; filename="epg.xml"');

      return xmltv;
    }
  );
};

export default epgRoutes;
