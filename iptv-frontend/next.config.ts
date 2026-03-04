import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: 'standalone',

  // Increase body size limit for large file uploads (APK, IPA, etc.)
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },

  // Image optimization settings
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
        pathname: '/t/p/**',
      },
    ],
  },

  // Environment variables available at build time
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:3001',
    NEXT_PUBLIC_TMDB_IMAGE_BASE: process.env.NEXT_PUBLIC_TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p',
  },

  // Proxy API calls to backend (for dev mode and remote access)
  async rewrites() {
    // Use localhost for rewrites - Next.js runs on server so 127.0.0.1 works
    const backendUrl = process.env.BACKEND_URL || 'http://127.0.0.1:3001';
    return [
      {
        source: '/api-proxy/:path*',
        destination: `${backendUrl}/:path*`,
      },
      // Proxy streaming endpoints - Xtream Codes format
      {
        source: '/live/:username/:password/:streamId.:ext',
        destination: `${backendUrl}/live/:username/:password/:streamId.:ext`,
      },
      {
        source: '/movie/:username/:password/:streamId.:ext',
        destination: `${backendUrl}/movie/:username/:password/:streamId.:ext`,
      },
      {
        source: '/series/:username/:password/:streamId.:ext',
        destination: `${backendUrl}/series/:username/:password/:streamId.:ext`,
      },
      // Admin preview endpoints (for admin panel VOD/stream preview without user credentials)
      {
        source: '/admin-preview/:path*',
        destination: `${backendUrl}/admin-preview/:path*`,
      },
      // HLS segment endpoints
      {
        source: '/hls/:path*',
        destination: `${backendUrl}/hls/:path*`,
      },
      // ABR HLS variant playlists and segments
      {
        source: '/hls-abr/:path*',
        destination: `${backendUrl}/hls-abr/:path*`,
      },
      // VOD HLS segment endpoints
      {
        source: '/vod-hls/:path*',
        destination: `${backendUrl}/vod-hls/:path*`,
      },
      // HLS passthrough for multi-bitrate streams
      {
        source: '/hls-passthrough/:path*',
        destination: `${backendUrl}/hls-passthrough/:path*`,
      },
      // Media files (logos, images) served from backend
      {
        source: '/media/:path*',
        destination: `${backendUrl}/media/:path*`,
      },
      // Flag files (country flags) served from backend
      {
        source: '/flags/:path*',
        destination: `${backendUrl}/flags/:path*`,
      },
      // Application downloads (APK, IPA, EXE, DMG)
      {
        source: '/apps/:path*',
        destination: `${backendUrl}/apps/:path*`,
      },
      // Legacy streaming endpoints
      {
        source: '/stream/:username/:password/:streamId.m3u8',
        destination: `${backendUrl}/:username/:password/:streamId.m3u8`,
      },
      {
        source: '/hlsr/:path*',
        destination: `${backendUrl}/hlsr/:path*`,
      },
    ];
  },
};

export default nextConfig;
