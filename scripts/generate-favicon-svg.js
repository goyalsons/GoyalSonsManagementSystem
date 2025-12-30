import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logoPath = join(__dirname, '../attached_assets/generated_images/minimalist_corporate_logo_for_goyalsons_management_system.png');
const faviconSvgPath = join(__dirname, '../client/public/favicon.svg');

try {
  const image = sharp(logoPath);
  const metadata = await image.metadata();
  
  // Calculate crop: take ONLY the "G" icon portion (left side, approximately 35% of width)
  const cropWidth = Math.floor(metadata.width * 0.35);
  const cropHeight = metadata.height;
  const cropTop = 0;
  
  // Convert to SVG by first converting to a small PNG and then embedding as data URI
  // Actually, for SVG, we'll create a simple SVG that references the PNG or create a vector version
  // Since we can't easily convert PNG to true SVG vectors, we'll create an SVG wrapper
  
  // Generate a small PNG first - extract ONLY the "G" icon
  const smallPngBuffer = await image
    .extract({
      left: 0,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
    })
    .resize(64, 64, {
      fit: 'contain',
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .png()
    .toBuffer();
  
  // Convert PNG to base64
  const base64Image = smallPngBuffer.toString('base64');
  
  // Create SVG with embedded PNG
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 64 64" width="64" height="64">
  <image width="64" height="64" xlink:href="data:image/png;base64,${base64Image}"/>
</svg>`;
  
  writeFileSync(faviconSvgPath, svgContent);
  console.log('✅ Favicon SVG generated successfully at:', faviconSvgPath);
  
} catch (error) {
  console.error('❌ Error generating favicon SVG:', error.message);
  process.exit(1);
}

