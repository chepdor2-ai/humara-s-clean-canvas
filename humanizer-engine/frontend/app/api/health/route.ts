import { NextResponse } from 'next/server';
import { getRuntimeHealthReport } from '@/lib/ops/runtime-health';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const deep = url.searchParams.get('deep') === '1';
  const report = await getRuntimeHealthReport({ deep });

  return NextResponse.json({
    status: report.status,
    version: report.version,
    timestamp: report.timestamp,
    environment: report.environment,
    deepChecks: report.deepChecks,
    summary: report.summary,
    checks: report.checks,
    engines: report.engines.map(({ id, name, tier, status, detail }) => ({
      id,
      name,
      tier,
      status,
      detail,
    })),
  }, {
    status: report.status === 'unhealthy' ? 503 : 200,
  });
}
