import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ManagedSetupFlow } from './dist/ui/managed_setup_flow.js';

const tick = () => new Promise(resolve => setImmediate(resolve));
const status = (output, awaiting_answer = false, done = false, success = false) => ({ output, awaiting_answer, done, success });

test('installed packages do not report ready if runtime connection fails', async () => {
  let cancelled = false;
  const flow = new ManagedSetupFlow({
    onManagedStart: async () => '/private/sdk',
    onManagedStatus: async () => status('Installed', false, true, true),
    onManagedAnswer: async () => { throw new Error('unexpected license response'); },
    onManagedCancel: async () => { cancelled = true; },
    onManagedConnect: async () => { throw new Error('runtime compatibility probe failed'); },
  }, () => {}, tick);
  await flow.start();
  assert.equal(flow.snapshot.phase, 'failed');
  assert.match(flow.snapshot.message, /runtime compatibility probe failed/);
  assert.equal(flow.snapshot.output, 'Installed');
  assert.equal(cancelled, false);
});

test('setup preserves output and requires explicit responses for each license', async () => {
  const answers = [];
  let connected = null;
  let phase = 0;
  const api = {
    onManagedStart: async () => '/private/sdk',
    onManagedStatus: async () => phase === 0 ? status('License 1', true) : phase === 1 ? status('License 1\nLicense 2', true) : status('Installed', false, true, true),
    onManagedAnswer: async yes => { answers.push(yes); phase++; },
    onManagedCancel: async () => {},
    onManagedConnect: async root => { connected = root; },
  };
  const flow = new ManagedSetupFlow(api, () => {}, tick);
  const run = flow.start();
  await tick();
  assert.equal(flow.snapshot.awaitingAnswer, true);
  assert.equal(flow.snapshot.output, 'License 1');
  await Promise.all([flow.answer(true), flow.answer(true)]);
  assert.deepEqual(answers, [true]);
  await tick();
  assert.equal(flow.snapshot.awaitingAnswer, true);
  assert.match(flow.snapshot.output, /License 2/);
  await flow.answer(true);
  await run;
  assert.deepEqual(answers, [true, true]);
  assert.equal(connected, '/private/sdk');
  assert.equal(flow.snapshot.phase, 'ready');
});

test('failed cancellation remains active until backend confirms it stopped', async () => {
  let cancellations = 0;
  const flow = new ManagedSetupFlow({
    onManagedStart: async () => '/private/sdk',
    onManagedStatus: async () => status('Downloading packages'),
    onManagedAnswer: async () => { throw new Error('unexpected answer'); },
    onManagedCancel: async () => { if (++cancellations === 1) throw new Error('busy'); },
    onManagedConnect: async () => { throw new Error('unexpected connect'); },
  }, () => {}, tick);
  const run = flow.start();
  await tick();
  await flow.cancel();
  assert.equal(flow.active, true);
  assert.match(flow.snapshot.message, /Unable to cancel/);
  await flow.cancel();
  await run;
  assert.equal(flow.snapshot.phase, 'cancelled');
  assert.equal(flow.active, false);
});

test('failed installer retains diagnostic output and never connects', async () => {
  let connected = false;
  let cancelled = false;
  const flow = new ManagedSetupFlow({
    onManagedStart: async () => '/private/sdk',
    onManagedStatus: async () => status('License rejected', false, true, false),
    onManagedAnswer: async () => {},
    onManagedCancel: async () => { cancelled = true; },
    onManagedConnect: async () => { connected = true; },
  }, () => {}, tick);
  await flow.start();
  assert.equal(flow.snapshot.phase, 'failed');
  assert.equal(flow.snapshot.output, 'License rejected');
  assert.equal(connected, false);
  assert.equal(cancelled, false);
});

test('completion already in flight wins over a late cancellation without cancelling another session', async () => {
  let resolveStatus;
  let cancellations = 0;
  let connections = 0;
  const flow = new ManagedSetupFlow({
    onManagedStart: async () => '/private/sdk',
    onManagedStatus: () => new Promise(resolve => { resolveStatus = resolve; }),
    onManagedAnswer: async () => {},
    onManagedCancel: async () => { cancellations++; },
    onManagedConnect: async () => { connections++; },
  }, () => {}, tick);
  const run = flow.start();
  await tick();
  const cancellation = flow.cancel();
  resolveStatus(status('Installed', false, true, true));
  await Promise.all([run, cancellation]);
  assert.equal(connections, 1);
  assert.equal(cancellations, 0);
  assert.equal(flow.snapshot.phase, 'ready');
  assert.equal(flow.snapshot.actionPending, false);
});
