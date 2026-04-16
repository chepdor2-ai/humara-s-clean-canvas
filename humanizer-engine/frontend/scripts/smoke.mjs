#!/usr/bin/env node

import { setTimeout as delay } from 'node:timers/promises';

function parseArgs(argv) {
  const args = {
    url: process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000',
    timeout: 45000,
    deep: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url' && argv[index + 1]) {
      args.url = argv[index + 1];
      index += 1;
    } else if (arg.startsWith('--url=')) {
      args.url = arg.split('=')[1];
    } else if (arg === '--timeout' && argv[index + 1]) {
      args.timeout = Number(argv[index + 1]);
      index += 1;
    } else if (arg.startsWith('--timeout=')) {
      args.timeout = Number(arg.split('=')[1]);
    } else if (arg === '--deep') {
      args.deep = true;
    }
  }

  return args;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function waitForEndpoint(url, timeoutMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return response;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(1500);
  }

  throw lastError ?? new Error(`Timed out waiting for ${url}`);
}

async function readJson(url) {
  const response = await fetch(url);
  const body = await response.text();
  assert(response.ok, `${url} returned HTTP ${response.status}: ${body.slice(0, 200)}`);

  try {
    return JSON.parse(body);
  } catch (error) {
    throw new Error(`${url} did not return valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.url.replace(/\/$/, '');
const deepSuffix = args.deep ? '?deep=1' : '';

console.log(`\nSmoke testing ${baseUrl}`);

await waitForEndpoint(`${baseUrl}/api/health`, args.timeout);

const homeResponse = await fetch(baseUrl);
assert(homeResponse.ok, `Home page returned HTTP ${homeResponse.status}`);

const health = await readJson(`${baseUrl}/api/health${deepSuffix}`);
assert(typeof health.status === 'string', 'Health payload is missing status.');
assert(['healthy', 'degraded', 'unhealthy'].includes(health.status), `Unexpected health status: ${health.status}`);
assert(health.summary && typeof health.summary === 'object', 'Health payload is missing summary.');
assert(health.checks && typeof health.checks === 'object', 'Health payload is missing checks.');

const status = await readJson(`${baseUrl}/api/v1/status${deepSuffix}`);
assert(status.success === true, 'Status payload did not return success=true.');
assert(status.data && typeof status.data === 'object', 'Status payload is missing data.');
assert(Array.isArray(status.data.engines), 'Status payload is missing engine list.');
assert(status.data.runtime && typeof status.data.runtime === 'object', 'Status payload is missing runtime summary.');

console.log(`Health status: ${health.status}`);
console.log(`Available engines: ${status.data.runtime.available_engine_count}/${status.data.runtime.total_engine_count}`);
console.log('Smoke tests passed.');