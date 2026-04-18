import { NextResponse } from 'next/server';

const HF_SPACES = [
  process.env.HUMARIN_API_URL || 'https://maguna956-humarin-paraphraser.hf.space',
  process.env.OXYGEN3_API_URL || 'https://maguna956-oxygen3-humanizer.hf.space',
];

export async function GET() {
  const results = await Promise.allSettled(
    HF_SPACES.map((url) =>
      fetch(`${url}/health`, { method: 'GET', signal: AbortSignal.timeout(8000) })
        .then((r) => ({ url, status: r.status, ok: r.ok }))
        .catch((err) => ({ url, status: 0, ok: false, error: String(err) }))
    )
  );

  const summary = results.map((r) => (r.status === 'fulfilled' ? r.value : r.reason));
  const allOk = summary.every((s) => s.ok);

  return NextResponse.json({ ok: allOk, spaces: summary, ts: new Date().toISOString() }, { status: allOk ? 200 : 207 });
}
