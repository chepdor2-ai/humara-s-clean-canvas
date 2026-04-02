import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Health check endpoint for monitoring
 */
export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  return res.status(200).json({
    status: 'healthy',
    version: '3.0.0',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL_ENV || 'development',
    region: process.env.VERCEL_REGION || 'unknown'
  });
}
