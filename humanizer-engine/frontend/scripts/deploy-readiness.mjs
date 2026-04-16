#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const frontendDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    profile: 'deploy',
    skipLint: false,
    skipBuild: false,
  };

  for (const arg of argv) {
    if (arg.startsWith('--profile=')) {
      args.profile = arg.split('=')[1];
    } else if (arg === '--skip-lint') {
      args.skipLint = true;
    } else if (arg === '--skip-build') {
      args.skipBuild = true;
    }
  }

  return args;
}

function runStep(label, runner) {
  console.log(`\n== ${label} ==`);
  runner();
}

function runCommand(command) {
  execSync(command, {
    cwd: frontendDir,
    stdio: 'inherit',
  });
}

const args = parseArgs(process.argv.slice(2));
const requiredFiles = ['package.json', 'next.config.ts', '.env.example', 'vercel.json'];

console.log('\nFrontend deploy readiness');
console.log(`Working directory: ${frontendDir}`);
console.log(`Profile: ${args.profile}`);

runStep('Required files', () => {
  const missing = requiredFiles.filter((fileName) => !fs.existsSync(path.join(frontendDir, fileName)));
  if (missing.length) {
    throw new Error(`Missing required files: ${missing.join(', ')}`);
  }
  console.log(`Verified ${requiredFiles.length} required files.`);
});

runStep('Environment contract', () => {
  execFileSync(process.execPath, [path.join(frontendDir, 'scripts', 'check-env.mjs'), `--profile=${args.profile}`], {
    cwd: frontendDir,
    stdio: 'inherit',
  });
});

if (!args.skipLint) {
  runStep('Automation lint', () => runCommand('npm run lint:automation'));
}

if (!args.skipBuild) {
  runStep('Build', () => runCommand('npm run build'));
}

console.log('\nDeployment readiness checks passed.');