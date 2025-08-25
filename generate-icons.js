const fs = require('fs');
const path = require('path');

// Simple function to create a basic PNG icon using Canvas
async function generateIcons() {
  try {
    // Try to use canvas package
    const { createCanvas } = require('canvas');
    
    const sizes = [16, 48, 128];
    const iconsDir = path.join(__dirname, 'icons');
    
    // Ensure icons directory exists
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir);
    }
    
    sizes.forEach(size => {
      const canvas = createCanvas(size, size);
      const ctx = canvas.getContext('2d');
      
      // Create a gradient background
      const gradient = ctx.createLinearGradient(0, 0, size, size);
      gradient.addColorStop(0, '#4F46E5'); // Indigo
      gradient.addColorStop(1, '#7C3AED'); // Purple
      
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
      
      // Add text "DC" for DexChat
      ctx.fillStyle = 'white';
      ctx.font = `bold ${Math.floor(size * 0.4)}px Arial`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('DC', size / 2, size / 2);
      
      // Save the file
      const buffer = canvas.toBuffer('image/png');
      fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buffer);
      console.log(`Generated icon${size}.png`);
    });
    
    console.log('All icons generated successfully!');
  } catch (error) {
    console.error('Canvas package not found. Installing...');
    console.log('Please run: npm install canvas');
    console.log('Then run this script again.');
  }
}

generateIcons();