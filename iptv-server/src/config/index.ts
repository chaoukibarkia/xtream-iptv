import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  HOST: z.string().default('0.0.0.0'),
  
  // Database
  DATABASE_URL: z.string(),
  
  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),
  
  // JWT
  JWT_SECRET: z.string().min(32),
  
  // Server Info
  SERVER_URL: z.string().default('http://localhost'),
  SERVER_PORT: z.string().default('3000'),
  SERVER_HTTPS_PORT: z.string().default('443'),
  RTMP_PORT: z.string().default('1935'),
  TIMEZONE: z.string().default('UTC'),
  
  // FFmpeg
  FFMPEG_PATH: z.string().default('/usr/bin/ffmpeg'),
  HLS_SEGMENT_PATH: z.string().default('/media/hls'),
  HLS_OUTPUT_DIR: z.string().default('/media/hls-segments'),
  
  // Media Storage
  MEDIA_PATH: z.string().default('/media'),
  
  // Multi-Server
  SERVER_ID: z.string().optional(),
  SERVER_NAME: z.string().optional(),
  SERVER_API_KEY: z.string().optional(),
  MAIN_PANEL_URL: z.string().optional(),
  
  // Load Balancer
  USE_REDIRECT: z.string().default('false'),
  
  // Logging
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Admin API
  ADMIN_API_KEY: z.string().min(16, 'ADMIN_API_KEY must be at least 16 characters'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment variables');
}

export const config = {
  env: parsed.data.NODE_ENV,
  port: parseInt(parsed.data.PORT, 10),
  host: parsed.data.HOST,
  
  database: {
    url: parsed.data.DATABASE_URL,
  },
  
  redis: {
    url: parsed.data.REDIS_URL,
  },
  
  jwt: {
    secret: parsed.data.JWT_SECRET,
  },
  
  server: {
    url: parsed.data.SERVER_URL,
    port: parsed.data.SERVER_PORT,
    httpsPort: parsed.data.SERVER_HTTPS_PORT,
    rtmpPort: parsed.data.RTMP_PORT,
    timezone: parsed.data.TIMEZONE,
  },
  
  ffmpeg: {
    path: parsed.data.FFMPEG_PATH,
    hlsSegmentPath: parsed.data.HLS_SEGMENT_PATH,
  },
  
  media: {
    path: parsed.data.MEDIA_PATH,
    moviesPath: `${parsed.data.MEDIA_PATH}/movies`,
    seriesPath: `${parsed.data.MEDIA_PATH}/series`,
    subtitlesPath: `${parsed.data.MEDIA_PATH}/subtitles`,
    tempPath: `${parsed.data.MEDIA_PATH}/temp`,
  },
  
  multiServer: {
    serverId: parsed.data.SERVER_ID ? parseInt(parsed.data.SERVER_ID, 10) : undefined,
    serverName: parsed.data.SERVER_NAME,
    serverApiKey: parsed.data.SERVER_API_KEY,
    mainPanelUrl: parsed.data.MAIN_PANEL_URL,
  },
  
  loadBalancer: {
    useRedirect: parsed.data.USE_REDIRECT === 'true',
  },
  
  logging: {
    level: parsed.data.LOG_LEVEL,
  },

  admin: {
    apiKey: parsed.data.ADMIN_API_KEY,
  },
} as const;

export type Config = typeof config;
