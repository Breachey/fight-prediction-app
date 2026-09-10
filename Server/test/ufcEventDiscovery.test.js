const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const path = require('node:path');
const { test } = require('node:test');
const childProcess = require('node:child_process');

test('discovery timeout kills the worker and retains recent progress', async (t) => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  let signal;
  child.kill = (value) => {
    signal = value;
    child.emit('close', null);
  };
  t.mock.method(childProcess, 'spawn', () => {
    process.nextTick(() => {
      child.stderr.emit('data', 'x'.repeat(20000));
      child.stderr.emit('data', '\nMISSING 1400: endpoint timed out\n');
    });
    return child;
  });
  const { runUfcEventDiscovery } = require('../lib/ufcEventDiscovery');
  await assert.rejects(runUfcEventDiscovery({
    repoRoot: path.resolve(__dirname, '../..'),
    timeoutMs: 20,
  }), (error) => {
    assert.match(error.message, /timed out after 20ms/);
    assert.match(error.message, /MISSING 1400: endpoint timed out/);
    assert.ok(error.message.length < 16200);
    return true;
  });
  assert.equal(signal, 'SIGKILL');
});
