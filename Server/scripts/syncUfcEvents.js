#!/usr/bin/env node
require('dotenv').config();

const path = require('path');
const { runUfcEventDiscovery } = require('../lib/ufcEventDiscovery');

function parseArgs(argv) {
  const options = {};

  argv.forEach((arg) => {
    if (!arg.startsWith('--')) return;
    const [key, rawValue = ''] = arg.slice(2).split('=');
    const value = rawValue.trim();
    if (!key || !value) return;

    if (key === 'start-id') options.startId = value;
    if (key === 'end-id') options.endId = value;
    if (key === 'max-ids') options.maxIds = value;
    if (key === 'stop-after-misses') options.stopAfterMisses = value;
    if (key === 'lookback-ids') options.lookbackIds = value;
    if (key === 'delay-seconds') options.delaySeconds = value;
    if (key === 'tapology-delay-seconds') options.tapologyDelaySeconds = value;
    if (key === 'tapology-poster-limit') options.tapologyPosterLimit = value;
    if (key === 'tapology-timeout') options.tapologyTimeoutSeconds = value;
    if (key === 'timeout') options.timeoutSeconds = value;
  });

  return options;
}

async function main() {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const result = await runUfcEventDiscovery({
    repoRoot,
    ...parseArgs(process.argv.slice(2)),
  });

  const { stdout, stderr, ...summary } = result;
  if (stderr) {
    process.stderr.write(`${stderr}\n`);
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
