#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Quick Deployment Setup for Vercel
 * This script validates deploy readiness and then prints the next steps.
 */

const path = require('path');
const { execFileSync } = require('child_process');

console.log('\n🚀 Vercel Deployment Helper\n');
console.log('=' .repeat(50));

const frontendDir = path.resolve(__dirname);
const readinessScript = path.join(frontendDir, 'scripts', 'deploy-readiness.mjs');

try {
  execFileSync(process.execPath, [readinessScript, '--profile=deploy'], {
    cwd: frontendDir,
    stdio: 'inherit',
  });
} catch (error) {
  console.log('\n❌ Deploy readiness failed. Fix the checks above before deploying.\n');
  process.exit(error.status || 1);
}

console.log('\n' + '='.repeat(50));
console.log('\n✅ Deploy readiness passed.\n');
console.log('📋 Next Steps:\n');
console.log('1. Go to: https://vercel.com/new');
console.log('2. Import the GitHub repository');
console.log('3. Set Root Directory to: humanizer-engine/frontend');
console.log('4. Add environment variables from .env.example');
console.log('5. Deploy and then run: npm run smoke -- --url https://your-app-url');

console.log('=' .repeat(50) + '\n');
