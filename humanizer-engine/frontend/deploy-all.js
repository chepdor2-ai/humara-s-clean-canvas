#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Comprehensive Deployment Script
 * Runs deploy readiness checks, then optionally pushes, deploys, and smoke-tests.
 */

const { execFileSync, execSync } = require('child_process');
const path = require('path');

console.log('\n🚀 Multi-Platform Deployment Tool\n');
console.log('='.repeat(70));

const frontendDir = path.resolve(__dirname);
const rootDir = path.resolve(__dirname, '..', '..');
const readinessScript = path.join(frontendDir, 'scripts', 'deploy-readiness.mjs');
const smokeScript = path.join(frontendDir, 'scripts', 'smoke.mjs');
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--') && !arg.includes('=')));
const smokeArg = args.find((arg) => arg.startsWith('--smoke-url='));
const smokeUrl = smokeArg ? smokeArg.split('=')[1] : '';

if (flags.has('--help')) {
  console.log('\nUsage: node deploy-all.js [--push] [--vercel-cli] [--smoke-url=https://your-app-url]\n');
  process.exit(0);
}

function runStep(label, runner) {
  console.log(`\n${label}`);
  console.log('-'.repeat(70));
  runner();
}

runStep('1. Deployment readiness', () => {
  execFileSync(process.execPath, [readinessScript, '--profile=deploy'], {
    cwd: frontendDir,
    stdio: 'inherit',
  });
});

if (flags.has('--push')) {
  runStep('2. Push committed changes', () => {
    const workingTree = execSync('git status --porcelain', { cwd: rootDir, encoding: 'utf8' }).trim();
    if (workingTree) {
      throw new Error('Working tree is not clean. Commit or stash your changes before using --push.');
    }
    execSync('git push origin HEAD', { cwd: rootDir, stdio: 'inherit' });
  });
}

if (flags.has('--vercel-cli')) {
  runStep('3. Vercel CLI deploy', () => {
    execSync('npx vercel --prod --yes', { cwd: frontendDir, stdio: 'inherit' });
  });
}

if (smokeUrl) {
  runStep('4. Post-deploy smoke test', () => {
    execFileSync(process.execPath, [smokeScript, `--url=${smokeUrl}`, '--timeout=60000'], {
      cwd: frontendDir,
      stdio: 'inherit',
    });
  });
}

console.log('\nDeployment automation complete.');

if (!flags.has('--vercel-cli') && !smokeUrl) {
  console.log('\nNext steps:');
  console.log('  1. Push your committed changes or run this script again with --push.');
  console.log('  2. Deploy via Vercel dashboard or rerun with --vercel-cli.');
  console.log('  3. Run a post-deploy smoke test with --smoke-url=https://your-app-url.');
}
