import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const svgPath = join(__dirname, '../client/public/favicon.svg');
const pngPath = join(__dirname, '../client/public/favicon.png');

try {
  const svgBuffer = readFileSync(svgPath);
  
  // Generate PNG favicon (32x32 for compatibility)
  const pngBuffer = await sharp(svgBuffer)
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toBuffer();
  
  writeFileSync(pngPath, pngBuffer);
  console.log('✅ Favicon PNG generated successfully at:', pngPath);
} catch (error) {
  console.error('❌ Error generating favicon:', error.message);
  process.exit(1);
}

