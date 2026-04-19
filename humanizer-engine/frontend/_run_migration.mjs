/**
 * Direct migration runner.
 * Uses the linked Supabase pooler URL plus SUPABASE_DB_PASSWORD from .env.local
 * so multi-statement migration files can be executed without the SQL editor.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

// Read env from .env.local
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=["']?(.+?)["']?\s*$/);
  if (m) env[m[1]] = m[2];
}

const dbPassword = env.SUPABASE_DB_PASSWORD || '';
const poolerPath = path.join(__dirname, 'supabase', '.temp', 'pooler-url');
const poolerUrl = fs.existsSync(poolerPath) ? fs.readFileSync(poolerPath, 'utf8').trim() : '';
const migrationArg = process.argv[2] || path.join('supabase', 'migrations', '20260419090000_wordcount_realtime_upgrade.sql');
const sqlPath = path.isAbsolute(migrationArg) ? migrationArg : path.join(__dirname, migrationArg);

if (!dbPassword || !poolerUrl) {
  console.error('Missing SUPABASE_DB_PASSWORD in .env.local or supabase/.temp/pooler-url');
  process.exit(1);
}

if (!fs.existsSync(sqlPath)) {
  console.error(`Migration file not found: ${sqlPath}`);
  process.exit(1);
}

const pooler = new URL(poolerUrl);
pooler.password = dbPassword;
const sqlFile = fs.readFileSync(sqlPath, 'utf8');

function formatSqlContext(sql, position) {
  const numericPosition = Number(position);
  if (!Number.isFinite(numericPosition) || numericPosition <= 0) {
    return null;
  }

  const before = sql.slice(0, numericPosition - 1);
  const lines = sql.split('\n');
  const lineNumber = before.split('\n').length;
  const startLine = Math.max(1, lineNumber - 2);
  const endLine = Math.min(lines.length, lineNumber + 2);
  const snippet = [];

  for (let line = startLine; line <= endLine; line += 1) {
    snippet.push(`${String(line).padStart(4, ' ')} | ${lines[line - 1]}`);
  }

  return `At line ${lineNumber}:\n${snippet.join('\n')}`;
}

async function run() {
  const client = new Client({
    connectionString: pooler.toString(),
    ssl: { rejectUnauthorized: false },
  });

  console.log(`\nRunning migration file: ${path.relative(__dirname, sqlPath)}\n`);

  try {
    await client.connect();
    await client.query(sqlFile);
    console.log('Migration complete.');
  } catch (error) {
    console.error('Migration failed:');
    console.error(error.message);
    if (error.detail) console.error(error.detail);
    if (error.hint) console.error(error.hint);
    if (error.where) console.error(error.where);
    const context = formatSqlContext(sqlFile, error.position);
    if (context) console.error(context);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

run();
