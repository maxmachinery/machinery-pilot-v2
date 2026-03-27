import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

// ── Locate the test image ────────────────────────────────────────────────────
const PRIORITY = [
  '/Users/maxleorodeck/Downloads/test_checkist.png',
  '/Users/maxleorodeck/Desktop/test_checkist.png',
  '/Users/maxleorodeck/Desktop/test checkist.png',
  '/Users/maxleorodeck/Documents/test_checkist.png',
  '/Users/maxleorodeck/Documents/test checkist.png',
];

let imagePath = PRIORITY.find(p => fs.existsSync(p));

if (!imagePath) {
  console.log('File not found in Downloads, Desktop or Documents. Searching entire system for test_checkist*…\n');
  try {
    const results = execSync(
      'find /Users/maxleorodeck -iname "test_checkist*" -o -iname "test checkist*" 2>/dev/null',
      { encoding: 'utf8', timeout: 15000 }
    ).trim();

    if (results) {
      console.log('Found these matches:\n' + results + '\n');
      imagePath = results.split('\n')[0];
      console.log(`Using: ${imagePath}\n`);
    } else {
      console.error('No file matching test_checkist* found anywhere under /Users/maxleorodeck.');
      process.exit(1);
    }
  } catch (err) {
    console.error('Search failed:', err.message);
    process.exit(1);
  }
} else {
  console.log(`Found image at: ${imagePath}\n`);
}

const imageB64 = fs.readFileSync(imagePath).toString('base64');
const ext      = path.extname(imagePath).toLowerCase();
const mediaType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
                : ext === '.webp' ? 'image/webp'
                : 'image/png';

// ── Send to Claude ───────────────────────────────────────────────────────────
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log('Sending image to Claude…\n');

const response = await client.messages.create({
  model:      'claude-sonnet-4-20250514',
  max_tokens: 4000,
  messages: [{
    role: 'user',
    content: [
      {
        type:   'image',
        source: { type: 'base64', media_type: mediaType, data: imageB64 },
      },
      {
        type: 'text',
        text: "Look at this inspection form carefully. For each row, tell me exactly which letter (A, B, or C) has a hand-drawn circle around it. List every row: row name -> circled letter (or 'none' if no circle). Be very literal.",
      },
    ],
  }],
});

console.log(response.content[0].text);
