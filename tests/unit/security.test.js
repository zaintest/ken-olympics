'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const KO = require('../../engine.js');

test('sha256Hex matches published NIST vectors', () => {
  assert.strictEqual(KO.sha256Hex(''),
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  assert.strictEqual(KO.sha256Hex('abc'),
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.strictEqual(KO.sha256Hex('The quick brown fox jumps over the lazy dog'),
    'd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
});

test('sha256Hex agrees with Node crypto across many inputs (incl. unicode + long)', () => {
  const samples = ['', 'a', 'hello world', '🌴🔥', 'Café Niño', 'x'.repeat(1000), '33WX-SRGH-NNDF'];
  for (const s of samples) {
    const expected = crypto.createHash('sha256').update(s, 'utf8').digest('hex');
    assert.strictEqual(KO.sha256Hex(s), expected, `mismatch for ${JSON.stringify(s.slice(0, 16))}`);
  }
});

// The hash shipped in index.html corresponds to this secret.
const SECRET = '33WX-SRGH-NNDF';
const HASH = KO.sha256Hex(SECRET);

test('resolveRole: correct secret in the URL → editor', () => {
  assert.strictEqual(KO.resolveRole({ providedKey: SECRET, editorKeyHash: HASH }), 'editor');
});

test('resolveRole: wrong or missing secret → viewer', () => {
  assert.strictEqual(KO.resolveRole({ providedKey: 'WRONG', editorKeyHash: HASH }), 'viewer');
  assert.strictEqual(KO.resolveRole({ providedKey: '', editorKeyHash: HASH }), 'viewer');
  assert.strictEqual(KO.resolveRole({ editorKeyHash: HASH }), 'viewer');
  assert.strictEqual(KO.resolveRole({}), 'viewer');
});

test('resolveRole: a device that already claimed editor stays editor (no key needed)', () => {
  assert.strictEqual(KO.resolveRole({ savedEditor: true }), 'editor');
  assert.strictEqual(KO.resolveRole({ savedEditor: true, providedKey: 'whatever', editorKeyHash: HASH }), 'editor');
});

test('the embedded hash in index.html matches the documented secret', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', '..', 'index.html'), 'utf8');
  const m = html.match(/EDITOR_KEY_HASH\s*=\s*'([0-9a-f]{64})'/);
  assert.ok(m, 'EDITOR_KEY_HASH not found in index.html');
  assert.strictEqual(m[1], HASH, 'shipped hash does not match the editor secret used in tests');
});
