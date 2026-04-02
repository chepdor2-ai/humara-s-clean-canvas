const fs = require('fs');
const path = require('path');

console.log('Building for Vercel deployment...');

// Create public directory if it doesn't exist
const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copy static files to public directory
const staticDir = path.join(__dirname, '..', 'static');
if (fs.existsSync(staticDir)) {
  const files = fs.readdirSync(staticDir);
  files.forEach(file => {
    const srcPath = path.join(staticDir, file);
    const destPath = path.join(publicDir, file);
    if (fs.statSync(srcPath).isFile()) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✓ Copied ${file}`);
    }
  });
}

console.log('✓ Build complete!');
console.log('Ready for Vercel deployment with: vercel --prod');
