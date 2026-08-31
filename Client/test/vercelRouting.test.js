import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const vercelConfigUrl = new URL('../vercel.json', import.meta.url);

test('routes direct client URLs through the SPA entry point', async () => {
  const config = JSON.parse(await readFile(vercelConfigUrl, 'utf8'));

  assert.deepEqual(config.rewrites, [
    { source: '/(.*)', destination: '/index.html' },
  ]);
});
