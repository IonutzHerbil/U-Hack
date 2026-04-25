const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'src', 'renderer');
const targetDir = path.join(projectRoot, 'dist', 'renderer');

if (!fs.existsSync(sourceDir)) {
  throw new Error(`Renderer source directory not found: ${sourceDir}`);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.cpSync(sourceDir, targetDir, { recursive: true });

console.log(`Copied renderer files to ${targetDir}`);
