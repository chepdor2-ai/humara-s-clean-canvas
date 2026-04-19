/**
 * Direct migration runner  bypasses Supabase SQL editor's broken statement splitter.
 * Sends the full migration file to Supabase using the REST /query endpoint
 * (Management API) which handles multi-statement PL/pgSQL natively.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

//  Read env from .env.local 
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.+?)["']?\s*$/);
  if (m) env[m[1]] = m[2];
}

const supabaseUrl = (env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || '';
const refMatch = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
const projectRef = refMatch ? refMatch[1] : '';

if (!projectRef || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sqlFile = fs.readFileSync(
  path.join(__dirname, 'supabase', 'migrations', '20260419090000_wordcount_realtime_upgrade.sql'),
  'utf8'
);

//  Execute via Supabase Management API (/query endpoint) 
async function runQuery(sql) {
  const body = JSON.stringify({ query: sql });
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

//  Split migration into named blocks for reporting 
function splitBlocks(sql) {
  const parts = sql.split(/(?=-- .*\n-- \d+\.)/);
  const blocks = [];
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const nameMatch = trimmed.match(/-- (\d+\.\s+\S[^\n]*)/);
    const name = nameMatch ? nameMatch[1].trim() : trimmed.slice(0, 50);
    const hasSQL = /^(CREATE|ALTER|INSERT|UPDATE|DELETE|DO|DROP|GRANT)/im.test(trimmed);
    if (hasSQL) blocks.push({ name, sql: trimmed });
  }
  return blocks;
}

async function run() {
  console.log(`\nRunning migration on project: ${projectRef}\n`);

  const blocks = splitBlocks(sqlFile);
  console.log(`   ${blocks.length} SQL blocks to execute\n`);

  let failed = false;
  for (const block of blocks) {
    process.stdout.write(`  ... ${block.name.padEnd(40)} `);
    try {
      const result = await runQuery(block.sql);
      if (result.status >= 200 && result.status < 300) {
        console.log('OK');
      } else {
        console.log(`FAIL [HTTP ${result.status}]`);
        const msg = typeof result.body === 'object'
          ? (result.body.message || result.body.error || JSON.stringify(result.body).slice(0, 300))
          : String(result.body).slice(0, 300);
        console.error(`     -> ${msg}\n`);
        failed = true;
        break;
      }
    } catch (err) {
      console.log('FAIL');
      console.error(`     -> ${err.message}\n`);
      failed = true;
      break;
    }
  }

  if (failed) {
    console.error('\nMigration stopped at first error. Fix and re-run.\n');
    process.exit(1);
  }

  console.log('\n-- Verification ------------------------------------------------');

  const verifyPlans = await runQuery(
    'SELECT name, daily_words_fast, price_monthly FROM public.plans ORDER BY price_monthly'
  );
  if (verifyPlans.status < 300 && Array.isArray(verifyPlans.body)) {
    console.log('\nPlans:');
    for (const r of verifyPlans.body) {
      const limit = Number(r.daily_words_fast) < 0 ? 'Unlimited' : Number(r.daily_words_fast).toLocaleString();
      console.log(`  ${String(r.name).padEnd(15)} $${Number(r.price_monthly).toFixed(2).padStart(5)}   ${limit} words/day`);
    }
  } else {
    console.log('Plans query:', verifyPlans.status, JSON.stringify(verifyPlans.body).slice(0,200));
  }

  const verifyCron = await runQuery(
    "SELECT jobname, schedule FROM cron.job WHERE jobname = 'humara_purge_document_text'"
  );
  if (verifyCron.status < 300 && Array.isArray(verifyCron.body) && verifyCron.body.length) {
    console.log(`\npg_cron job: OK "${verifyCron.body[0].jobname}" @ ${verifyCron.body[0].schedule}`);
  } else {
    console.log('\npg_cron job: not found  pg_cron may not be enabled. Call SELECT public.purge_expired_document_text() manually.');
  }

  const verifyPub = await runQuery(
    "SELECT tablename FROM pg_publication_tables WHERE pubname = 'supabase_realtime' ORDER BY tablename"
  );
  if (verifyPub.status < 300 && Array.isArray(verifyPub.body)) {
    console.log('\nRealtime tables: ' + verifyPub.body.map(r => r.tablename).join(', '));
  }

  const verifyFns = await runQuery(
    "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_name IN ('increment_usage','get_usage_stats','get_user_id_by_email','purge_expired_document_text') ORDER BY routine_name"
  );
  if (verifyFns.status < 300 && Array.isArray(verifyFns.body)) {
    console.log('\nFunctions:');
    for (const r of verifyFns.body) console.log(`  OK public.${r.routine_name}()`);
  }

  console.log('\nMigration complete!\n');
}

run();
