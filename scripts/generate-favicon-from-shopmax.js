import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logoPath = join(__dirname, '../client/src/assets/shopmax-logo.jpg');
const faviconPngPath = join(__dirname, '../client/public/favicon.png');
const faviconSvgPath = join(__dirname, '../client/public/favicon.svg');

try {
  const image = sharp(logoPath);
  const metadata = await image.metadata();
  
  console.log('Original image dimensions:', metadata.width, 'x', metadata.height);
  
  // Generate PNG favicon (32x32)
  const favicon32Buffer = await image
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();
  
  writeFileSync(faviconPngPath, favicon32Buffer);
  console.log('✅ Favicon PNG (32x32) generated successfully');
  
  // Generate SVG with embedded PNG for better compatibility
  const favicon64Buffer = await image
    .resize(64, 64, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();
  
  const base64Image = favicon64Buffer.toString('base64');
  
  // Create SVG with embedded PNG
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" width="64" height="64">
  <image width="64" height="64" xlink:href="data:image/png;base64,${base64Image}"/>
</svg>`;
  
  writeFileSync(faviconSvgPath, svgContent);
  console.log('✅ Favicon SVG generated successfully');
  
} catch (error) {
  console.error('❌ Error generating favicon:', error.message);
  process.exit(1);
}

