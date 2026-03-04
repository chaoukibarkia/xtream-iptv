import { FastifyPluginAsync } from 'fastify';
import { authenticateIptvLine, AuthQuery } from '../middlewares/auth.js';
import { m3uGenerator } from '../../services/playlist/M3UGenerator.js';

interface PlaylistQuery extends AuthQuery {
  type?: 'm3u' | 'm3u_plus';
  output?: 'ts' | 'm3u8' | 'hls';
}

export const playlistRoutes: FastifyPluginAsync = async (fastify) => {
  // get.php endpoint (Xtream Codes compatible)
  fastify.get<{ Querystring: PlaylistQuery }>(
    '/get.php',
    { preHandler: authenticateIptvLine },
    async (request, reply) => {
      const { type = 'm3u_plus', output = 'ts' } = request.query;
      const line = request.line || request.user;

      const playlist = await m3uGenerator.generateFull(
        {
          id: line!.id,
          username: line!.username,
          password: line!.password,
          bouquets: line!.bouquets,
        },
        { type, output: output === 'hls' ? 'm3u8' : output }
      );

      reply.header('Content-Type', 'audio/x-mpegurl');
      reply.header('Content-Disposition', `attachment; filename="${line!.username}_playlist.m3u"`);
      
      return playlist;
    }
  );

  // Alternative playlist endpoints
  fastify.get<{ Querystring: PlaylistQuery }>(
    '/playlist/:username/:password',
    {
      preHandler: async (request, reply) => {
        const params = request.params as { username: string; password: string };
        request.query.username = params.username;
        request.query.password = params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const { type = 'm3u_plus', output = 'ts' } = request.query;
      const line = request.line || request.user;

      const playlist = await m3uGenerator.generateFull(
        {
          id: line!.id,
          username: line!.username,
          password: line!.password,
          bouquets: line!.bouquets,
        },
        { type, output: output === 'hls' ? 'm3u8' : output }
      );

      reply.header('Content-Type', 'audio/x-mpegurl');
      reply.header('Content-Disposition', `attachment; filename="${line!.username}_playlist.m3u"`);
      
      return playlist;
    }
  );

  // Live TV only playlist
  fastify.get<{ Querystring: PlaylistQuery }>(
    '/live/:username/:password',
    {
      preHandler: async (request, reply) => {
        const params = request.params as { username: string; password: string };
        request.query.username = params.username;
        request.query.password = params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const { type = 'm3u_plus', output = 'ts' } = request.query;
      const line = request.line || request.user;

      const playlist = await m3uGenerator.generateLive(
        {
          id: line!.id,
          username: line!.username,
          password: line!.password,
          bouquets: line!.bouquets,
        },
        { type, output: output === 'hls' ? 'm3u8' : output }
      );

      reply.header('Content-Type', 'audio/x-mpegurl');
      reply.header('Content-Disposition', `attachment; filename="${line!.username}_live.m3u"`);
      
      return playlist;
    }
  );

  // VOD only playlist
  fastify.get<{ Querystring: PlaylistQuery }>(
    '/vod/:username/:password',
    {
      preHandler: async (request, reply) => {
        const params = request.params as { username: string; password: string };
        request.query.username = params.username;
        request.query.password = params.password;
        await authenticateIptvLine(request, reply);
      },
    },
    async (request, reply) => {
      const { type = 'm3u_plus' } = request.query;
      const line = request.line || request.user;

      const playlist = await m3uGenerator.generateVod(
        {
          id: line!.id,
          username: line!.username,
          password: line!.password,
          bouquets: line!.bouquets,
        },
        { type }
      );

      reply.header('Content-Type', 'audio/x-mpegurl');
      reply.header('Content-Disposition', `attachment; filename="${line!.username}_vod.m3u"`);
      
      return playlist;
    }
  );
};

export default playlistRoutes;
