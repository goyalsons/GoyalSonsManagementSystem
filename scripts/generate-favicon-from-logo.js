import sharp from 'sharp';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const logoPath = join(__dirname, '../attached_assets/generated_images/minimalist_corporate_logo_for_goyalsons_management_system.png');
const faviconPngPath = join(__dirname, '../client/public/favicon.png');

try {
  const image = sharp(logoPath);
  const metadata = await image.metadata();
  
  console.log('Original image dimensions:', metadata.width, 'x', metadata.height);
  
  // For favicon, we want ONLY the "G" icon part (left side of the logo)
  // The logo has text on the right, so we'll crop to get just the icon portion
  // Based on typical logo layouts, the icon is usually in the left 30-35% of the image
  
  // Calculate crop: take the left portion (approximately 35% of width for just the "G" icon)
  const cropWidth = Math.floor(metadata.width * 0.35);
  const cropHeight = metadata.height;
  
  // Center vertically if needed
  const cropTop = 0;
  
  // Generate favicon - crop to icon area and resize to 64x64
  // Use 'cover' fit to fill the square, or 'contain' to preserve aspect ratio
  const faviconBuffer = await image
    .extract({
      left: 0,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
    })
    .resize(64, 64, {
      fit: 'contain',
      background: { r: 30, g: 58, b: 138, alpha: 1 }
    })
    .png()
    .toBuffer();
  
  writeFileSync(faviconPngPath, faviconBuffer);
  console.log('✅ Favicon PNG generated successfully at:', faviconPngPath);
  
  // Also create a 32x32 version for better compatibility
  const favicon32Buffer = await sharp(logoPath)
    .extract({
      left: 0,
      top: cropTop,
      width: cropWidth,
      height: cropHeight
    })
    .resize(32, 32, {
      fit: 'contain',
      background: { r: 30, g: 58, b: 138, alpha: 1 }
    })
    .png()
    .toBuffer();
  
  // Overwrite with 32x32 for better favicon display
  writeFileSync(faviconPngPath, favicon32Buffer);
  console.log('✅ Favicon 32x32 generated successfully');
  
} catch (error) {
  console.error('❌ Error generating favicon:', error.message);
  process.exit(1);
}

