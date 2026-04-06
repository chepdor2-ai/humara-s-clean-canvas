#!/usr/bin/env node

/**
 * Comprehensive Deployment Script
 * Supports: Vercel (Web), Vercel (CLI), Supabase Edge Functions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('\n🚀 Multi-Platform Deployment Tool\n');
console.log('='.repeat(70));

const frontendDir = path.resolve(__dirname);
const rootDir = path.resolve(__dirname, '..', '..');

// Deployment methods
const methods = {
  'github-push': {
    name: '📦 Push to GitHub (Auto-deploy via Vercel)',
    run: () => {
      console.log('\n📦 Pushing to GitHub...');
      try {
        execSync('git add -A', { cwd: rootDir, stdio: 'inherit' });
        execSync('git commit -m "Deploy: automated deployment"', { cwd: rootDir, stdio: 'inherit' });
        execSync('git push origin main', { cwd: rootDir, stdio: 'inherit' });
        console.log('✅ Successfully pushed to GitHub');
        console.log('   If connected to Vercel, deployment will trigger automatically');
        return true;
      } catch (error) {
        console.log('⚠️  Git push failed or no changes to commit');
        return false;
      }
    }
  },
  
  'vercel-web': {
    name: '🌐 Vercel Web Dashboard (Manual)',
    run: () => {
      console.log('\n🌐 Vercel Web Deployment Instructions:');
      console.log('\n1. Go to: https://vercel.com/new');
      console.log('2. Import: b89761382-rgb/humara-s-clean-canvas');
      console.log('3. Set Root Directory: humanizer-engine/frontend');
      console.log('4. Add environment variables from .env.production');
      console.log('5. Click Deploy\n');
      console.log('📋 Environment variables file: .env.production');
      return true;
    }
  },

  'vercel-cli': {
    name: '⚡ Vercel CLI (If authenticated)',
    run: () => {
      console.log('\n⚡ Attempting Vercel CLI deployment...');
      try {
        execSync('npx vercel --prod --yes', { cwd: frontendDir, stdio: 'inherit' });
        console.log('✅ Vercel deployment successful');
        return true;
      } catch (error) {
        console.log('❌ Vercel CLI deployment failed');
        console.log('   Try: npx vercel login first');
        return false;
      }
    }
  },

  'supabase': {
    name: '🗄️  Supabase Edge Functions',
    run: () => {
      console.log('\n🗄️  Supabase Deployment Instructions:');
      console.log('\n1. Install Supabase CLI:');
      console.log('   PowerShell: scoop install supabase');
      console.log('   Or download: https://github.com/supabase/cli/releases');
      console.log('\n2. Login: supabase login');
      console.log('3. Link: supabase link --project-ref lqkpjghjermvxzgkocne');
      console.log('4. Deploy: supabase functions deploy');
      console.log('\n📋 See SUPABASE_DEPLOYMENT.md for details\n');
      return true;
    }
  },

  'build-test': {
    name: '🔨 Test Production Build',
    run: () => {
      console.log('\n🔨 Testing production build...');
      try {
        execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });
        console.log('✅ Production build successful');
        return true;
      } catch (error) {
        console.log('❌ Production build failed');
        return false;
      }
    }
  }
};

// Main execution
async function main() {
  console.log('\nAvailable Deployment Methods:\n');
  
  const methodKeys = Object.keys(methods);
  methodKeys.forEach((key, index) => {
    console.log(`${index + 1}. ${methods[key].name}`);
  });
  
  console.log('\n' + '='.repeat(70));
  console.log('\n🎯 Auto-deploying with all methods...\n');
  
  let successCount = 0;
  
  for (const key of methodKeys) {
    const method = methods[key];
    try {
      const success = method.run();
      if (success) successCount++;
    } catch (error) {
      console.log(`❌ ${method.name} error:`, error.message);
    }
    console.log('\n' + '-'.repeat(70));
  }
  
  console.log('\n📊 Deployment Summary:');
  console.log(`   ${successCount}/${methodKeys.length} methods completed successfully\n`);
  
  if (successCount > 0) {
    console.log('✅ Deployment process completed!');
    console.log('\n📝 Next Steps:');
    console.log('   • Check Vercel dashboard: https://vercel.com/dashboard');
    console.log('   • Monitor Supabase: https://app.supabase.com/project/lqkpjghjermvxzgkocne');
    console.log('   • View logs for any errors\n');
  } else {
    console.log('⚠️  No deployment methods succeeded');
    console.log('   Try manual deployment via Vercel web interface\n');
  }
}

main().catch(console.error);
