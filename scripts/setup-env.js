#!/usr/bin/env node

/**
 * Setup Environment Files Script
 * 
 * This script copies environment example files to their actual locations
 * if they don't already exist. Run as part of `pnpm setup`.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

const envFiles = [
  {
    source: 'apps/api/env.example.txt',
    target: 'apps/api/.env',
    description: 'API environment file'
  },
  {
    source: 'apps/web/env.example.txt',
    target: 'apps/web/.env.local',
    description: 'Web environment file'
  }
];

console.log('\n🔧 Setting up environment files...\n');

let created = 0;
let skipped = 0;

for (const { source, target, description } of envFiles) {
  const sourcePath = path.join(ROOT_DIR, source);
  const targetPath = path.join(ROOT_DIR, target);

  // Check if source exists
  if (!fs.existsSync(sourcePath)) {
    console.log(`   ⚠️  Source not found: ${source}`);
    continue;
  }

  // Check if target already exists
  if (fs.existsSync(targetPath)) {
    console.log(`   ✓  ${description} already exists: ${target}`);
    skipped++;
    continue;
  }

  // Copy file
  try {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`   ✅ Created ${description}: ${target}`);
    created++;
  } catch (error) {
    console.error(`   ❌ Failed to create ${target}: ${error.message}`);
  }
}

// Create database directory if it doesn't exist
const dbDir = path.join(ROOT_DIR, 'apps/api/data');
if (!fs.existsSync(dbDir)) {
  try {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`   ✅ Created database directory: apps/api/data/`);
  } catch (error) {
    console.error(`   ❌ Failed to create database directory: ${error.message}`);
  }
}

console.log('\n📋 Summary:');
console.log(`   Created: ${created} file(s)`);
console.log(`   Skipped: ${skipped} file(s) (already exist)`);

if (created > 0) {
  console.log('\n📝 Note: Remember to update your .env files with your actual Azure credentials.');
  console.log('   Or configure them through the Settings page in the application.\n');
} else {
  console.log('');
}
