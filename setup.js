#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🤖 Setting up MiniBot...\n');

// Check if .env file exists
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from template...');
  fs.copyFileSync(envExamplePath, envPath);
  console.log('✅ .env file created. Please edit it with your API keys.\n');
} else {
  console.log('✅ .env file already exists.\n');
}

// Create necessary directories
const directories = [
  'data',
  'logs',
  'data/vector_db'
];

directories.forEach(dir => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

console.log('\n🔧 Setup checklist:');
console.log('1. ✅ Project structure created');
console.log('2. 📝 Edit .env file with your API keys:');
console.log('   - OPENAI_API_KEY (required for embeddings and AI responses)');
console.log('   - ANTHROPIC_API_KEY (optional, for Claude models)');
console.log('   - TELEGRAM_BOT_TOKEN (for Telegram integration)');
console.log('   - GITHUB_TOKEN (for GitHub MCP integration)');
console.log('   - FIGMA_TOKEN (for Figma MCP integration)');
console.log('3. 📦 Install dependencies: npm install');
console.log('4. 🚀 Start the bot: npm start');

console.log('\n📚 Platform Setup:');
console.log('Telegram Bot:');
console.log('1. Message @BotFather on Telegram');
console.log('2. Create a new bot with /newbot');
console.log('3. Copy the token to TELEGRAM_BOT_TOKEN in .env');

console.log('\nGitHub Token:');
console.log('1. Go to GitHub Settings > Developer settings > Personal access tokens');
console.log('2. Generate a new token with repo permissions');
console.log('3. Copy the token to GITHUB_TOKEN in .env');

console.log('\nFigma Token:');
console.log('1. Go to Figma Settings > Account > Personal access tokens');
console.log('2. Generate a new token');
console.log('3. Copy the token to FIGMA_TOKEN in .env');

console.log('\n🎉 Setup complete! Edit .env and run "npm install" then "npm start"');