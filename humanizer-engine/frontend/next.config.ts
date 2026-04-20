import type { NextConfig } from "next";
import path from "path";

const isVercel = process.env.VERCEL === '1';
const engineRoot = path.resolve(/* turbopackIgnore: true */ process.cwd(), "..");

const nextConfig: NextConfig = {
  ...(isVercel ? {} : { outputFileTracingRoot: engineRoot }),
  turbopack: isVercel ? {} : { root: engineRoot },
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  compress: true,
  poweredByHeader: false,
  async redirects() {
    return [
      {
        source: '/:path*',
        has: [{ type: 'host', value: 'humaragpt.com' }],
        destination: 'https://www.humaragpt.com/:path*',
        statusCode: 301,
      },
    ];
  },
  webpack: (config) => {
    // Resolve compromise & openai from ts-engine/node_modules
    // (avoids needing to install them separately in frontend)
    config.resolve.modules = [
      ...(config.resolve.modules || []),
      path.resolve(/* turbopackIgnore: true */ process.cwd(), "..", "ts-engine", "node_modules"),
    ];
    return config;
  },
};

export default nextConfig;
