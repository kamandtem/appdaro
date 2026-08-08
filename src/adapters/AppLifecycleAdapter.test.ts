import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CapacitorAppLifecycleAdapter, FakeAppLifecycleAdapter } from './AppLifecycleAdapter';

// ---------------------------------------------------------------------------
// FakeAppLifecycleAdapter — manual trigger برای تست Resolver/Notification Engine
// ---------------------------------------------------------------------------

test('FakeAppLifecycleAdapter: triggerResume همه‌ی resume listenerها رو صدا می‌زنه', () => {
  const lifecycle = new FakeAppLifecycleAdapter();
  let calls = 0;
  lifecycle.onResume(() => { calls++; });
  lifecycle.onResume(() => { calls++; });
  lifecycle.triggerResume();
  assert.equal(calls, 2);
});

test('FakeAppLifecycleAdapter: unsubscribe از onResume جلوی صدازدن دوباره رو می‌گیره', () => {
  const lifecycle = new FakeAppLifecycleAdapter();
  let calls = 0;
  const unsubscribe = lifecycle.onResume(() => { calls++; });
  lifecycle.triggerResume();
  unsubscribe();
  lifecycle.triggerResume();
  assert.equal(calls, 1);
});

test('FakeAppLifecycleAdapter: triggerBoot مستقل از resume listenerهاست', () => {
  const lifecycle = new FakeAppLifecycleAdapter();
  let resumeCalls = 0;
  let bootCalls = 0;
  lifecycle.onResume(() => { resumeCalls++; });
  lifecycle.onBoot(() => { bootCalls++; });

  lifecycle.triggerBoot();
  assert.equal(bootCalls, 1);
  assert.equal(resumeCalls, 0, 'boot نباید resume رو هم صدا بزنه');
});

test('FakeAppLifecycleAdapter: unsubscribe از onBoot جلوی صدازدن دوباره رو می‌گیره', () => {
  const lifecycle = new FakeAppLifecycleAdapter();
  let calls = 0;
  const unsubscribe = lifecycle.onBoot(() => { calls++; });
  unsubscribe();
  lifecycle.triggerBoot();
  assert.equal(calls, 0);
});

// ---------------------------------------------------------------------------
// CapacitorAppLifecycleAdapter — رفتار graceful-degradation بیرون از شل
// Capacitor (دقیقاً وضعیت همین محیط تست: @capacitor/app نصب نیست)
// ---------------------------------------------------------------------------

test('CapacitorAppLifecycleAdapter.onResume: بیرون از شل Capacitor throw نمی‌کنه', () => {
  const lifecycle = new CapacitorAppLifecycleAdapter();
  assert.doesNotThrow(() => {
    const unsubscribe = lifecycle.onResume(() => {});
    unsubscribe(); // باید حتی قبل از resolve شدن dynamic import هم امن باشه
  });
});

test('CapacitorAppLifecycleAdapter.onBoot: بدون DOM (محیط Node) به‌جای throw، یک no-op امن برمی‌گردونه', () => {
  const lifecycle = new CapacitorAppLifecycleAdapter();
  assert.doesNotThrow(() => {
    const unsubscribe = lifecycle.onBoot(() => {});
    unsubscribe();
  });
});
