import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyPackages } from './verify-packages.mjs';

test('installer checksum gate rejects absent and empty artifacts and hashes nonempty files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'mes-packaging-test-'));
  try {
    await assert.rejects(verifyPackages(dir, 'dmg'), /No .dmg installers/);
    await mkdir(join(dir, 'dmg'));
    const file = join(dir, 'dmg', 'test.dmg');
    await writeFile(file, '');
    await assert.rejects(verifyPackages(dir, 'dmg'), /Empty installer/);
    await writeFile(file, 'fixture');
    const digest = createHash('sha256').update('fixture').digest('hex');
    assert.deepEqual(await verifyPackages(dir, 'dmg'), [`${digest}  dmg/test.dmg`]);
    assert.equal(await readFile(join(dir, 'SHA256SUMS.txt'), 'utf8'), `${digest}  dmg/test.dmg\n`);
    await assert.rejects(verifyPackages(dir, 'nsis'), /No .exe installers/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
