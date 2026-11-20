import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameScheduler, FrameMetrics, nextCaptureDelay } from './dist/ui/frame_scheduler.js';

test('capture cadence adapts to measured latency without unbounded polling', () => {
  assert.equal(nextCaptureDelay(20, 0), 120);
  assert.equal(nextCaptureDelay(700, 0), 350);
  assert.equal(nextCaptureDelay(5000, 0), 1000);
  assert.equal(nextCaptureDelay(20, 1), 1000);
  assert.equal(nextCaptureDelay(20, 20), 4000);
  assert.equal(nextCaptureDelay(NaN, 0), 350);
});

test('two devices capture independently while a third waits fairly', () => {
  const scheduler = new FrameScheduler(2);
  assert.equal(scheduler.acquire('A'), true);
  assert.equal(scheduler.acquire('B'), true);
  assert.equal(scheduler.acquire('A'), false);
  assert.equal(scheduler.acquire('C'), false);
  scheduler.release('B');
  assert.equal(scheduler.acquire('C'), true);
  scheduler.release('A');
  scheduler.release('C');
});

test('visible device captures are exclusive and FIFO', () => {
  const scheduler = new FrameScheduler();
  assert.equal(scheduler.acquire('A'), true);
  assert.equal(scheduler.acquire('B'), false);
  assert.equal(scheduler.acquire('C'), false);
  scheduler.release('A');
  assert.equal(scheduler.acquire('A'), false);
  assert.equal(scheduler.acquire('B'), true);
  scheduler.release('B');
  assert.equal(scheduler.acquire('C'), true);
  scheduler.release('C');
  assert.equal(scheduler.acquire('A'), true);
});

test('closed or hidden waiters do not block a visible device', () => {
  const scheduler = new FrameScheduler();
  assert.equal(scheduler.acquire('A'), true);
  assert.equal(scheduler.acquire('B'), false);
  scheduler.cancel('B');
  scheduler.cancel('A');
  assert.equal(scheduler.acquire('C'), false);
  scheduler.release('A');
  assert.equal(scheduler.acquire('C'), true);
});

test('reported FPS reflects successful presentations and resets after pauses', () => {
  const metrics = new FrameMetrics();
  metrics.record(100, 50, 1000);
  assert.equal(metrics.snapshot().fps, null);
  metrics.record(350, 60, 2000);
  assert.deepEqual(metrics.snapshot(), { fps: 4, averageMs: 55, averageBytes: 1500 });
  metrics.record(6000, 70, 3000);
  assert.equal(metrics.snapshot().fps, null);
  metrics.reset();
  assert.deepEqual(metrics.snapshot(), { fps: null, averageMs: 0, averageBytes: 0 });
});
