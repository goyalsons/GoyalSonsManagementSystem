import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../client/public/favicon.svg');
const faviconPngPath = join(__dirname, '../client/public/favicon.png');

try {
  const svgBuffer = readFileSync(svgPath);
  
  // Generate 32x32 PNG from SVG with dark blue background (no white)
  const favicon32Buffer = await sharp(svgBuffer)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 30, g: 58, b: 138, alpha: 1 }
    })
    .png()
    .toBuffer();
  
  writeFileSync(faviconPngPath, favicon32Buffer);
  console.log('✅ Favicon PNG (32x32) generated successfully from SVG');
  
} catch (error) {
  console.error('❌ Error generating favicon PNG:', error.message);
  process.exit(1);
}

