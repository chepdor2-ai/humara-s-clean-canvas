#!/usr/bin/env node

/**
 * Quick Deployment Setup for Vercel
 * This script helps prepare your project for Vercel deployment
 */

const fs = require('fs');
const path = require('path');

console.log('\n🚀 Vercel Deployment Helper\n');
console.log('=' .repeat(50));

// Check if required files exist
const requiredFiles = [
  'package.json',
  'next.config.ts',
  '.env.example'
];

const frontendDir = process.cwd();
console.log(`\n📁 Checking files in: ${frontendDir}\n`);

let allFilesExist = true;
requiredFiles.forEach(file => {
  const exists = fs.existsSync(path.join(frontendDir, file));
  const status = exists ? '✅' : '❌';
  console.log(`${status} ${file}`);
  if (!exists) allFilesExist = false;
});

console.log('\n' + '='.repeat(50));

if (allFilesExist) {
  console.log('\n✅ All required files are present!\n');
  console.log('📋 Next Steps:\n');
  console.log('1. Go to: https://vercel.com/new');
  console.log('2. Click "Import Git Repository"');
  console.log('3. Select your GitHub repo: b89761382-rgb/humara-s-clean-canvas');
  console.log('4. Set Root Directory to: humanizer-engine/frontend');
  console.log('5. Add environment variables (see .env.example)');
  console.log('6. Click "Deploy"\n');
  console.log('🎉 Your app will be live in ~3 minutes!\n');
} else {
  console.log('\n❌ Some required files are missing.');
  console.log('Please ensure you are in the frontend directory.\n');
}

console.log('=' .repeat(50) + '\n');
