import test from 'node:test';
import assert from 'node:assert/strict';
import { AnnexBParser } from './dist/ui/video_annexb.js';

test('Annex-B parser handles split start codes, keyframes and multi-slice frames', () => {
  const parser = new AnnexBParser();
  const prefix = [0, 0, 0, 1];
  const stream = new Uint8Array([...prefix, 0x67, 0x42, 0, 0x1e, ...prefix, 0x68, 0xc0, ...prefix, 0x65, 0x80, ...prefix, 0x65, 0x40, ...prefix, 0x41, 0x80, ...prefix, 0x41, 0x80, ...prefix, 0x41, 0x80]);
  const output = [];
  for (let i = 0; i < stream.length; i += 3) output.push(...parser.push(stream.subarray(i, i + 3)));
  assert.equal(output.length, 2);
  assert.equal(output[0].key, true);
  assert.equal(output[0].codec, 'avc1.42001e');
  assert.deepEqual(Array.from(output[0].bytes), [...prefix, 0x67, 0x42, 0, 0x1e, ...prefix, 0x68, 0xc0, ...prefix, 0x65, 0x80, ...prefix, 0x65, 0x40]);
  assert.equal(output[1].key, false);
});

test('oversized and malformed input fails closed', () => {
  assert.throws(() => new AnnexBParser().push(new Uint8Array(4 * 1024 * 1024 + 1)), /limit/);
  assert.throws(() => new AnnexBParser().push(new Uint8Array([0,0,1,0x67,0,0,1,0x68])), /SPS/);
});
