import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { antigravityManagerQuota, codexSwitcherQuota, retainGoodAccounts, workbuddyQuota } from './project-quotas.mjs';
import { summaryText } from './server.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'quota-desk-projects-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), JSON.stringify(value), 'utf8');
  };
  return { root, write };
}

test('WorkBuddy maps the newest synthetic balance to each pseudonymous account', t => {
  const { root, write } = fixture(t);
  write('workbuddy/accounts.json', [
    { id: 'wb-id-one', email: 'private-one@example.invalid' },
    { id: 'wb-id-two', email: 'private-two@example.invalid' },
  ]);
  write('workbuddy/credit_usage_snapshots.json', [
    { accountId: 'wb-id-one', remaining: 25, total: 100, ts: 1800000000 },
    { accountId: 'wb-id-two', remaining: 80, total: 100, ts: 1800000001000 },
    { accountId: 'wb-id-one', remaining: 10, total: 100, ts: 1800000001 },
  ]);

  const quota = workbuddyQuota({ workbuddyDir: join(root, 'workbuddy') });
  assert.equal(quota.agent, 'workbuddy');
  assert.equal(quota.accounts.length, 2);
  assert.equal(quota.accounts[0].buckets[0].remaining, 10);
  assert.equal(quota.accounts[1].buckets[0].remaining, 80);
  const serialized = JSON.stringify(quota);
  for (const privateValue of ['wb-id-one', 'wb-id-two', 'private-one@example.invalid', 'private-two@example.invalid']) {
    assert.equal(serialized.includes(privateValue), false);
  }
});

test('Antigravity reads model and shared-window caches for separate accounts', t => {
  const { root, write } = fixture(t);
  const directory = join(root, 'antigravity');
  write('antigravity/accounts.json', { accounts: [{ id: 'ag-1' }, { id: 'ag-2', disabled: true }, { id: '../outside' }] });
  write('antigravity/accounts/ag-1.json', { quota: {
    last_updated: 1800000000,
    subscription_tier: 'PRO',
    quota_groups: [{ display_name: 'Gemini Models', buckets: [
      { window: '5h', remaining_fraction: 0.7, reset_time: '2027-01-02T03:04:05Z' },
      { window: 'weekly', remaining_fraction: 0.4, reset_time: 1800003600 },
    ] }],
    models: [{ name: 'gemini-pro', percentage: 61, reset_time: 1800003600 }],
  } });
  write('antigravity/accounts/ag-2.json', { disabled: true, quota: { models: [{ name: 'claude', percentage: 0 }] } });

  const quota = antigravityManagerQuota({ antigravityManagerDir: directory });
  assert.equal(quota.accounts.length, 2);
  assert.deepEqual(quota.accounts[0].buckets.map(bucket => [bucket.label, bucket.remaining]), [
    ['Gemini models · 5 hours', 70],
    ['Gemini models · weekly', 40],
    ['Claude and GPT models · 5 hours', null],
    ['Claude and GPT models · weekly', null],
  ]);
  assert.equal(quota.accounts[1].status, '已禁用 · 显示缓存');
  assert.equal(JSON.stringify(quota).includes('../outside'), false);
});

test('Codex Switcher queries each ChatGPT account without following redirects or exposing identifiers', async t => {
  const { root, write } = fixture(t);
  const directory = join(root, 'codex');
  write('codex/accounts.json', { accounts: [
    { id: 'switcher-row-1', plan_type: 'plus', auth_data: { type: 'chat_gpt', account_id: 'chatgpt-id-1', access_token: 'synthetic-test-value-1', refresh_token: 'must-not-be-used' } },
    { id: 'switcher-row-2', plan_type: 'pro', auth_data: { type: 'chatgpt', account_id: 'chatgpt-id-2', access_token: 'synthetic-test-value-2', refresh_token: 'must-not-be-used' } },
    { id: 'switcher-row-3', plan_type: 'team', auth_data: { type: 'chatgpt', account_id: 'chatgpt-id-3', access_token: 'synthetic-test-value-3', refresh_token: 'must-not-be-used' } },
  ] });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.headers.Authorization.endsWith('synthetic-test-value-2')) return new Response('', { status: 401 });
    if (options.headers.Authorization.endsWith('synthetic-test-value-3')) return new Response(null, { status: 302, headers: { location: 'https://unexpected.example/' } });
    return new Response(JSON.stringify({ plan_type: 'plus', rate_limit: {
      primary_window: { used_percent: 35, limit_window_seconds: 18000, reset_at: 1800003600 },
      secondary_window: { used_percent: 75, limit_window_seconds: 604800, reset_at: 1800600000 },
    } }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const quota = await codexSwitcherQuota({ codexSwitcherDir: directory }, { fetchImpl });
  assert.equal(quota.accounts.length, 3);
  assert.deepEqual(quota.accounts[0].buckets.map(bucket => [bucket.label, bucket.remaining]), [['5 小时', 65], ['每周', 25]]);
  assert.equal(quota.accounts[1].status, '登录已过期 · 请在 Codex Switcher 重新登录');
  assert.equal(quota.accounts[2].status, '接口返回跳转 · 已停止请求');
  assert.equal(calls.length, 3);
  assert.ok(calls.every(call => call.url === 'https://chatgpt.com/backend-api/wham/usage'));
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.redirect === 'manual'));
  const output = JSON.stringify(quota);
  for (const privateValue of ['switcher-row-1', 'chatgpt-id-1', 'synthetic-test-value', 'must-not-be-used']) {
    assert.equal(output.includes(privateValue), false);
  }
});

test('Codex Switcher live queries can be disabled without touching token fields', async t => {
  const { root, write } = fixture(t);
  const directory = join(root, 'codex');
  write('codex/accounts.json', { accounts: [{ id: 'row', plan_type: 'plus', auth_data: { type: 'chatgpt', access_token: 'synthetic-test-value' } }] });
  let called = false;
  const quota = await codexSwitcherQuota({ codexSwitcherDir: directory, codexSwitcherLive: false }, {
    fetchImpl: async () => { called = true; throw new Error('should not call'); },
  });
  assert.equal(called, false);
  assert.equal(quota.accounts[0].status, '实时查询已关闭');
});

test('failed Codex refresh keeps only the prior reading for the same account', async t => {
  const { root, write } = fixture(t);
  const directory = join(root, 'codex');
  write('codex/accounts.json', { accounts: [{ id: 'stable-row', auth_data: { type: 'chatgpt', access_token: 'synthetic-test-value' } }] });
  const first = await codexSwitcherQuota({ codexSwitcherDir: directory }, {
    fetchImpl: async () => new Response(JSON.stringify({ rate_limit: { primary_window: { used_percent: 50, limit_window_seconds: 18000 } } }), { status: 200 }),
  });
  const current = await codexSwitcherQuota({ codexSwitcherDir: directory }, {
    fetchImpl: async () => new Response('', { status: 403 }),
  });
  const merged = retainGoodAccounts(first, current);
  assert.equal(merged.accounts[0].buckets[0].remaining, 50);
  assert.match(merged.accounts[0].status, /显示上次数据/);
});

test('the text summary keeps an unknown quota distinct from a real zero', () => {
  const summary = summaryText({ quotas: [{ agent: 'workbuddy', accounts: [{ label: '账号 1234ABCD', status: '额度未知', buckets: [{ label: '积分', remaining: null }] }] }] });
  assert.match(summary, /未知/);
  assert.doesNotMatch(summary, /0%/);
});
