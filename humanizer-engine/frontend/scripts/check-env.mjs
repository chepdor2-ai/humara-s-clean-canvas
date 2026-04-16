#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');

const PLACEHOLDER_PATTERNS = [
  /^your[_-]/i,
  /^replace[_-]/i,
  /example\.com/i,
  /https?:\/\/your[-.]/i,
  /_here$/i,
  /changeme/i,
];

const PROFILES = {
  ci: {
    required: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
    ],
    recommended: [
      'NEXT_PUBLIC_SITE_URL',
      'ADMIN_EMAILS',
      'NEXT_PUBLIC_ADMIN_EMAILS',
      'HUMARAGPT_API_KEY',
    ],
  },
  deploy: {
    required: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
    ],
    recommended: [
      'NEXT_PUBLIC_SITE_URL',
      'PAYSTACK_SECRET_KEY',
      'NEXT_PUBLIC_PAYSTACK_CALLBACK_URL',
      'ADMIN_EMAILS',
      'NEXT_PUBLIC_ADMIN_EMAILS',
      'EASY_API_KEY',
      'OZONE_API_KEY',
      'OXYGEN3_API_URL',
      'HUMARAGPT_API_KEY',
    ],
  },
  full: {
    required: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
      'OPENAI_API_KEY',
      'NEXT_PUBLIC_SITE_URL',
    ],
    recommended: [
      'PAYSTACK_SECRET_KEY',
      'NEXT_PUBLIC_PAYSTACK_CALLBACK_URL',
      'ADMIN_EMAILS',
      'NEXT_PUBLIC_ADMIN_EMAILS',
      'EASY_API_KEY',
      'OZONE_API_KEY',
      'OXYGEN3_API_URL',
      'T5_API_URL',
      'T5_API_KEY',
      'HUMARIN_API_URL',
      'HUMARIN_API_KEY',
      'DIPPER_API_URL',
      'HUMARAGPT_API_KEY',
    ],
  },
};

const FEATURE_GROUPS = [
  {
    label: 'Payments',
    keys: ['PAYSTACK_SECRET_KEY', 'NEXT_PUBLIC_PAYSTACK_CALLBACK_URL'],
  },
  {
    label: 'Admin access',
    keys: ['ADMIN_EMAILS', 'NEXT_PUBLIC_ADMIN_EMAILS'],
    mode: 'any',
  },
  {
    label: 'Hosted engines',
    keys: ['EASY_API_KEY', 'OZONE_API_KEY', 'OXYGEN3_API_URL'],
  },
];

function parseArgs(argv) {
  const args = { profile: 'deploy', json: false };
  for (const arg of argv) {
    if (arg.startsWith('--profile=')) {
      args.profile = arg.split('=')[1];
    } else if (arg === '--json') {
      args.json = true;
    }
  }
  return args;
}

function parseEnvFile(filePath) {
  const values = {};
  const content = fs.readFileSync(filePath, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    value = value.replace(/^['\"]|['\"]$/g, '');
    values[key] = value;
  }
  return values;
}

function loadRuntimeEnv() {
  const fileOrder = ['.env', '.env.production', '.env.local'];
  const loadedFiles = [];
  const envValues = {};

  for (const fileName of fileOrder) {
    const filePath = path.join(frontendDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    Object.assign(envValues, parseEnvFile(filePath));
    loadedFiles.push(fileName);
  }

  return {
    loadedFiles,
    env: { ...envValues, ...process.env },
  };
}

function isConfigured(value) {
  if (typeof value !== 'string') {
    return false;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function summarizeKeys(keys, runtimeEnv) {
  const configured = [];
  const missing = [];
  for (const key of keys) {
    if (isConfigured(runtimeEnv[key])) {
      configured.push(key);
    } else {
      missing.push(key);
    }
  }
  return { configured, missing };
}

function summarizeFeatureGroups(runtimeEnv) {
  return FEATURE_GROUPS.map((group) => {
    const configuredCount = group.keys.filter((key) => isConfigured(runtimeEnv[key])).length;
    const ready = group.mode === 'any'
      ? configuredCount > 0
      : configuredCount === group.keys.length;

    return {
      label: group.label,
      ready,
      configuredCount,
      totalCount: group.keys.length,
    };
  });
}

const args = parseArgs(process.argv.slice(2));
const profile = PROFILES[args.profile] ? args.profile : 'deploy';
const { loadedFiles, env } = loadRuntimeEnv();
const result = {
  profile,
  loadedFiles,
  required: summarizeKeys(PROFILES[profile].required, env),
  recommended: summarizeKeys(PROFILES[profile].recommended, env),
  features: summarizeFeatureGroups(env),
};

if (args.json) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.required.missing.length === 0 ? 0 : 1);
}

console.log(`\nEnvironment profile: ${profile}`);
console.log(`Config sources: ${loadedFiles.length ? loadedFiles.join(', ') : 'process.env only'}`);
console.log(`Required variables ready: ${result.required.configured.length}/${PROFILES[profile].required.length}`);

if (result.required.missing.length) {
  console.log(`Missing required variables: ${result.required.missing.join(', ')}`);
} else {
  console.log('All required variables are configured.');
}

if (result.recommended.missing.length) {
  console.log(`Missing recommended variables: ${result.recommended.missing.join(', ')}`);
} else {
  console.log('All recommended variables are configured.');
}

for (const feature of result.features) {
  const status = feature.ready ? 'ready' : 'partial';
  console.log(`Feature ${feature.label}: ${status} (${feature.configuredCount}/${feature.totalCount})`);
}

if (result.required.missing.length) {
  console.error('\nEnvironment validation failed.');
  process.exit(1);
}

console.log('\nEnvironment validation passed.');