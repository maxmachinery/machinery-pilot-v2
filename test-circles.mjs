import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

const imagePath = '/Users/maxleorodeck/Desktop/test_checkist.png';
const imageB64  = fs.readFileSync(imagePath).toString('base64');

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
        source: { type: 'base64', media_type: 'image/png', data: imageB64 },
      },
      {
        type: 'text',
        text: 'Look at this inspection form carefully. For each row, tell me exactly which letter (A, B, or C) has a hand-drawn circle around it. List every row: row name -> circled letter (or \'none\' if no circle). Be very literal.',
      },
    ],
  }],
});

console.log(response.content[0].text);
