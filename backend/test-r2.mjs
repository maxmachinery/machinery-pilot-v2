import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

// Load .env manually
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env');
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([^#=\s][^=]*)=(.*)$/);
  if (m) process.env[m[1].trim()] = m[2].trim();
}

const BUCKET = process.env.R2_BUCKET_NAME;
const KEY    = 'test/hello.txt';

const r2 = new S3Client({
  region:   'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

function pass(msg) { console.log(`  ✓ PASS  ${msg}`); }
function fail(msg, err) { console.log(`  ✗ FAIL  ${msg}: ${err?.message || err}`); }

console.log(`\nR2 connection test — bucket: ${BUCKET}\n`);

// 1. Upload
try {
  await r2.send(new PutObjectCommand({
    Bucket:      BUCKET,
    Key:         KEY,
    Body:        Buffer.from('hello from MachineryPilot'),
    ContentType: 'text/plain',
  }));
  pass('Upload test/hello.txt');
} catch (err) {
  fail('Upload test/hello.txt', err);
  process.exit(1);
}

// 2. List and confirm
try {
  const res = await r2.send(new ListObjectsV2Command({ Bucket: BUCKET }));
  const found = (res.Contents || []).some(o => o.Key === KEY);
  if (found) {
    pass(`List objects — found ${KEY} (${res.Contents.length} total object(s))`);
  } else {
    fail('List objects', `${KEY} not found in listing`);
  }
} catch (err) {
  fail('List objects', err);
}

// 3. Delete
try {
  await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: KEY }));
  pass(`Delete ${KEY}`);
} catch (err) {
  fail(`Delete ${KEY}`, err);
}

console.log('\nDone.\n');
