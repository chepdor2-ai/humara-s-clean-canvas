import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * Vercel Serverless Function - AI Detection API Endpoint
 * TypeScript version of the detector endpoint
 */

interface DetectRequest {
  text: string;
}

interface DetectorResult {
  detector: string;
  ai_score: number;
  human_score: number;
  status: string;
}

interface DetectResponse {
  detectors: DetectorResult[];
  summary: {
    overall_human_score: number;
    overall_ai_score: number;
    detection_count: number;
  };
  error?: string;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
): Promise<VercelResponse> {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text } = req.body as DetectRequest;

    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'No text provided' });
    }

    // TODO: Integrate with actual AI detectors
    // For now, return mock detection results
    const detectors: DetectorResult[] = [
      { detector: 'GPTZero', ai_score: 85.3, human_score: 14.7, status: 'success' },
      { detector: 'Turnitin', ai_score: 92.1, human_score: 7.9, status: 'success' },
      { detector: 'Originality.AI', ai_score: 88.5, human_score: 11.5, status: 'success' },
      { detector: 'Winston AI', ai_score: 90.2, human_score: 9.8, status: 'success' },
      { detector: 'Copyleaks', ai_score: 87.6, human_score: 12.4, status: 'success' },
      { detector: 'ZeroGPT', ai_score: 91.3, human_score: 8.7, status: 'success' },
      { detector: 'Crossplag', ai_score: 89.0, human_score: 11.0, status: 'success' }
    ];

    const avgHumanScore = detectors.reduce((sum, d) => sum + d.human_score, 0) / detectors.length;
    const avgAiScore = detectors.reduce((sum, d) => sum + d.ai_score, 0) / detectors.length;

    const response: DetectResponse = {
      detectors,
      summary: {
        overall_human_score: Math.round(avgHumanScore * 10) / 10,
        overall_ai_score: Math.round(avgAiScore * 10) / 10,
        detection_count: detectors.length
      }
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error('Detect API error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      detectors: [],
      summary: {
        overall_human_score: 0,
        overall_ai_score: 0,
        detection_count: 0
      }
    });
  }
}
