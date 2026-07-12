const fs = require('fs/promises');
const path = require('path');
const { spawn } = require('child_process');

function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeOptionalPositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeNonNegativeNumber(value, fallback) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

async function runUfcEventDiscovery({
  repoRoot,
  startId = null,
  endId = null,
  maxIds = process.env.UFC_EVENT_DISCOVERY_MAX_IDS || 160,
  stopAfterMisses = process.env.UFC_EVENT_DISCOVERY_STOP_AFTER_MISSES || 60,
  lookbackIds = process.env.UFC_EVENT_DISCOVERY_LOOKBACK_IDS || 80,
  delaySeconds = process.env.UFC_EVENT_DISCOVERY_DELAY_SECONDS || 0.2,
  tapologyDelaySeconds = process.env.TAPOLOGY_DELAY_SECONDS || 1.25,
  tapologyPosterLimit = process.env.UFC_EVENT_DISCOVERY_TAPOLOGY_POSTER_LIMIT || 4,
  tapologyTimeoutSeconds = process.env.UFC_EVENT_DISCOVERY_TAPOLOGY_TIMEOUT_SECONDS || 6,
  timeoutSeconds = process.env.UFC_EVENT_DISCOVERY_TIMEOUT_SECONDS || 10,
  timeoutMs = 300000,
} = {}) {
  if (!repoRoot) {
    throw new Error('repoRoot is required');
  }

  const scraperRoot = path.join(repoRoot, 'Server', 'scraper');
  const scriptPath = path.join(scraperRoot, 'discover_ufc_events_for_import.py');
  const tapologyMapPath = path.join(scraperRoot, 'tapology_event_map.csv');

  await Promise.all([fs.access(scriptPath), fs.access(tapologyMapPath)]);

  const args = [
    scriptPath,
    '--max-ids',
    String(normalizePositiveInteger(maxIds, 160)),
    '--stop-after-misses',
    String(normalizePositiveInteger(stopAfterMisses, 60)),
    '--lookback-ids',
    String(normalizePositiveInteger(lookbackIds, 80)),
    '--delay-seconds',
    String(normalizeNonNegativeNumber(delaySeconds, 0.2)),
    '--timeout',
    String(normalizeNonNegativeNumber(timeoutSeconds, 10)),
    '--tapology-map',
    tapologyMapPath,
    '--tapology-delay-seconds',
    String(normalizeNonNegativeNumber(tapologyDelaySeconds, 1.25)),
    '--tapology-poster-limit',
    String(normalizeNonNegativeInteger(tapologyPosterLimit, 4)),
    '--tapology-timeout',
    String(normalizeNonNegativeNumber(tapologyTimeoutSeconds, 6)),
  ];

  const normalizedStartId = normalizeOptionalPositiveInteger(startId);
  if (normalizedStartId !== null) {
    args.push('--start-id', String(normalizedStartId));
  }

  const normalizedEndId = normalizeOptionalPositiveInteger(endId);
  if (normalizedEndId !== null) {
    args.push('--end-id', String(normalizedEndId));
  }

  return new Promise((resolve, reject) => {
    const child = spawn('python3', args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeoutId);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeoutId);

      if (timedOut) {
        reject(new Error(`UFC event discovery timed out after ${timeoutMs}ms.`));
        return;
      }

      if (code !== 0) {
        reject(
          new Error(
            `UFC event discovery exited with code ${code}.\n${stderr}${stdout ? `\n${stdout}` : ''}`.trim()
          )
        );
        return;
      }

      try {
        const payload = JSON.parse(stdout);
        resolve({
          ...payload,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      } catch (error) {
        reject(
          new Error(
            `UFC event discovery returned invalid JSON.\n${stderr}${stdout ? `\n${stdout}` : ''}`.trim()
          )
        );
      }
    });
  });
}

module.exports = {
  runUfcEventDiscovery,
};
