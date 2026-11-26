import { execFileSync } from 'node:child_process';
import { readFileSync, copyFileSync, existsSync } from 'node:fs';
const catalog = 'src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset';
if (!existsSync(`${catalog}/Contents.json`)) throw new Error('Run tauri:ios:init first');
execFileSync('npm', ['run', 'tauri', '--', 'icon', 'public/radio-tower-512.png', '--output', '.scratch/ios-icons', '--ios-color', '#090d0f'], { stdio: 'inherit' });
const { images } = JSON.parse(readFileSync(`${catalog}/Contents.json`, 'utf8'));
for (const { filename } of images) {
  if (filename) copyFileSync(`.scratch/ios-icons/ios/${filename}`, `${catalog}/${filename}`);
}
execFileSync('swift', ['scripts/ios-opaque-icons.swift', ...images.filter(image => image.filename).map(image => `${catalog}/${image.filename}`)], { stdio: 'inherit' });
console.log('Radio-tower icons copied to the generated iOS asset catalog.');
