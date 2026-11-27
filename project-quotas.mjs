import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const CHATGPT_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';

function readJSON(path) {
  try {
    if (statSync(path).size > MAX_FILE_BYTES) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function configuredPath(value, fallback) {
  if (!value) return fallback;
  const expanded = String(value)
    .replace(/^~(?=[\\/])/, homedir())
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || homedir())
    .replace(/%APPDATA%/gi, process.env.APPDATA || homedir());
  return resolve(expanded);
}

function identifier(account) {
  const value = account?.id ?? account?.uid ?? account?.accountId ?? account?.account_id;
  return value == null ? '' : String(value);
}

function alias(provider, id) {
  return `账号 ${createHash('sha256').update(`${provider}:${id}`).digest('hex').slice(0, 8).toUpperCase()}`;
}

function timeValue(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' || /^\d+(?:\.\d+)?$/.test(String(value))) {
    let number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return null;
    if (number > 1e12) number /= 1000;
    return number < 32503680000 ? new Date(number * 1000).toISOString() : null;
  }
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pct(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100 ? Math.round(number * 10) / 10 : null;
}

function quotaSnapshot(agent, source, accounts, checkedAt = new Date().toISOString()) {
  return { agent, source, checkedAt, accounts };
}

function accountRow(provider, id, { plan = null, status = '未知', checkedAt = null, buckets = [] } = {}) {
  return {
    key: alias(provider, id),
    label: alias(provider, id),
    plan: typeof plan === 'string' && plan.length <= 48 ? plan : null,
    status,
    checkedAt,
    buckets,
  };
}

function latestByAccount(snapshots) {
  const latest = new Map();
  const rows = Array.isArray(snapshots)
    ? snapshots
    : snapshots && typeof snapshots === 'object' && (snapshots.accountId || snapshots.account_id || snapshots.uid)
      ? [snapshots]
      : Object.values(snapshots || {});
  for (const snapshot of rows) {
    if (!snapshot || typeof snapshot !== 'object') continue;
    const id = String(snapshot.accountId ?? snapshot.account_id ?? snapshot.uid ?? '');
    if (!id) continue;
    const stamp = timeValue(snapshot.ts ?? snapshot.updatedAt ?? snapshot.updated_at) || null;
    const old = latest.get(id);
    if (!old || (Date.parse(stamp || '') || 0) > (Date.parse(old.stamp || '') || 0)) latest.set(id, { value: snapshot, stamp });
  }
  return latest;
}

export function workbuddyQuota(config = {}, { home = homedir() } = {}) {
  const directory = configuredPath(config.workbuddyDir, join(home, '.wb-switch'));
  const index = readJSON(join(directory, 'accounts.json'));
  if (!index) return null;
  const accounts = Array.isArray(index) ? index : index.accounts;
  if (!Array.isArray(accounts)) return null;
  const snapshots = readJSON(join(directory, 'credit_usage_snapshots.json')) || [];
  const latest = latestByAccount(snapshots);
  const result = [];
  for (const account of accounts) {
    const id = identifier(account);
    if (!id) continue;
    const found = latest.get(id);
    const item = found?.value || {};
    const remaining = Number(item.remaining ?? item.totalRemaining);
    const total = Number(item.total ?? item.totalCapacity);
    const validRemaining = Number.isFinite(remaining) && remaining >= 0 ? remaining : null;
    const validTotal = Number.isFinite(total) && total > 0 ? total : null;
    const remainingPercent = validRemaining != null && validTotal != null ? pct(validRemaining / validTotal * 100) : null;
    const stamp = found?.stamp || null;
    const buckets = found ? [{
      label: validTotal == null ? '积分' : `积分 · ${validRemaining} / ${validTotal}`,
      remaining: remainingPercent,
      note: validRemaining == null ? '积分余额未知' : `${validRemaining}${validTotal == null ? '' : ` / ${validTotal}`} 积分`,
      resetsAt: timeValue(item.soonestExpireAt ?? item.resetAt ?? item.reset_at ?? item.expiresAt),
    }] : [];
    result.push(accountRow('workbuddy', id, { status: found ? '本机缓存' : '尚无本机积分快照', checkedAt: stamp, buckets }));
  }
  return quotaSnapshot('workbuddy', 'WorkBuddy · 本机积分快照', result);
}

function safeAccountFileId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(id) && id !== '.' && id !== '..';
}

function antigravityAccounts(index) {
  return Array.isArray(index) ? index : index?.accounts;
}

function antigravityModelFamily(name) {
  const value = String(name || '').toLowerCase();
  if (/gemini|google/.test(value)) return 'Gemini models';
  if (/claude|anthropic|\bgpt\b|openai/.test(value)) return 'Claude and GPT models';
  return null;
}

function antigravityWindow(value) {
  const window = String(value || '').toLowerCase();
  if (/^(5h|5.?hours?|300m|300min|18000s)$/.test(window)) return '5 hours';
  if (/^(weekly|week|7d|7.?days?|10080m|10080min|604800s)$/.test(window)) return 'weekly';
  return null;
}

export function antigravityManagerQuota(config = {}, { home = homedir(), env = process.env } = {}) {
  const selected = config.antigravityManagerDir || env.ABV_DATA_DIR || env.ANTIGRAVITY_TOOLS_DATA_DIR;
  const directory = configuredPath(selected, join(home, '.antigravity_tools'));
  const index = readJSON(join(directory, 'accounts.json'));
  const accounts = antigravityAccounts(index);
  if (!Array.isArray(accounts)) return null;
  const result = [];
  for (const account of accounts) {
    const id = identifier(account);
    if (!safeAccountFileId(id)) continue;
    const detail = readJSON(join(directory, 'accounts', `${id}.json`)) || account;
    const quota = detail?.quota && typeof detail.quota === 'object' ? detail.quota : {};
    const stamp = timeValue(quota.last_updated ?? quota.lastUpdated ?? quota.updated_at ?? quota.updatedAt);
    const disabled = detail.disabled === true || account.disabled === true;
    const buckets = [];
    for (const group of (Array.isArray(quota.quota_groups) ? quota.quota_groups : Array.isArray(quota.quotaGroups) ? quota.quotaGroups : [])) {
      const groupName = group.display_name ?? group.displayName ?? group.name ?? '模型组';
      const family = antigravityModelFamily(groupName);
      if (!family) continue;
      for (const bucket of Array.isArray(group.buckets) ? group.buckets : []) {
        const fraction = Number(bucket.remaining_fraction ?? bucket.remainingFraction);
        const window = antigravityWindow(bucket.window ?? bucket.name);
        if (!window || !Number.isFinite(fraction) || fraction < 0 || fraction > 1) continue;
        buckets.push({
          label: `${family} · ${window}`,
          remaining: pct(fraction * 100),
          note: String(groupName).slice(0, 60),
          resetsAt: timeValue(bucket.reset_time ?? bucket.resetTime),
        });
      }
    }
    for (const family of ['Gemini models', 'Claude and GPT models']) {
      for (const window of ['5 hours', 'weekly']) {
        if (!buckets.some(bucket => bucket.label === `${family} · ${window}`)) {
          buckets.push({ label: `${family} · ${window}`, remaining: null, note: '缓存中暂无此额度', resetsAt: null });
        }
      }
    }
    const bucketCounts = new Map();
    for (const bucket of buckets) bucketCounts.set(bucket.label, (bucketCounts.get(bucket.label) || 0) + 1);
    for (const bucket of buckets) {
      if (bucketCounts.get(bucket.label) === 1 && bucket.note !== '缓存中暂无此额度') bucket.note = null;
    }
    const bucketOrder = new Map([
      ['Gemini models · 5 hours', 0],
      ['Gemini models · weekly', 1],
      ['Claude and GPT models · 5 hours', 2],
      ['Claude and GPT models · weekly', 3],
    ]);
    buckets.sort((a, b) => bucketOrder.get(a.label) - bucketOrder.get(b.label));
    result.push(accountRow('antigravity', id, {
      plan: quota.subscription_tier ?? quota.subscriptionTier ?? null,
      status: disabled ? '已禁用 · 显示缓存' : quota.is_forbidden === true ? '访问受限 · 显示缓存' : stamp ? '本机缓存' : '额度缓存未知',
      checkedAt: stamp,
      buckets,
    }));
  }
  return quotaSnapshot('agy', 'Antigravity Manager · 本机额度缓存', result);
}

function codexWindows(payload) {
  const rateLimit = payload?.rate_limit ?? payload?.rateLimit;
  if (!rateLimit || typeof rateLimit !== 'object') return [];
  const windows = [];
  for (const [key, fallback] of [['primary_window', '主窗口'], ['secondary_window', '次窗口']]) {
    const camel = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    const window = rateLimit[key] ?? rateLimit[camel];
    if (!window || typeof window !== 'object') continue;
    const used = pct(window.used_percent ?? window.usedPercent);
    const seconds = Number(window.limit_window_seconds ?? window.limitWindowSeconds);
    const label = seconds === 18000 ? '5 小时' : seconds === 604800 ? '每周' : fallback;
    windows.push({
      label,
      remaining: used == null ? null : pct(100 - used),
      note: used == null ? '使用率未知' : null,
      resetsAt: timeValue(window.reset_at ?? window.resets_at ?? window.resetAt ?? window.resetsAt),
    });
  }
  return windows;
}

function codexAccountAuth(account) {
  const auth = account?.auth_data ?? account?.authData ?? {};
  const type = String(auth.type ?? account?.auth_mode ?? account?.authMode ?? '').toLowerCase().replaceAll('_', '');
  if (type && type !== 'chatgpt' && type !== 'oauth') return null;
  const accessToken = auth.access_token ?? auth.accessToken ?? auth.tokens?.access_token ?? auth.tokens?.accessToken;
  if (typeof accessToken !== 'string' || !accessToken.trim()) return null;
  const accountId = auth.account_id ?? auth.chatgpt_account_id ?? auth.accountId ?? auth.chatgptAccountId ?? account?.account_id;
  return { accessToken, accountId: typeof accountId === 'string' ? accountId : null };
}

async function chatgptUsage(auth, fetchImpl = fetch) {
  const headers = {
    Authorization: `Bearer ${auth.accessToken}`,
    Accept: 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/136.0.0.0 Safari/537.36',
    Origin: 'https://chatgpt.com',
    Referer: 'https://chatgpt.com/',
  };
  if (auth.accountId) headers['ChatGPT-Account-Id'] = auth.accountId;
  let response;
  try {
    response = await fetchImpl(CHATGPT_USAGE_URL, { method: 'GET', headers, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch {
    return { status: '请求失败或超时', buckets: [] };
  }
  if (response.status === 401) return { status: '登录已过期 · 请在 Codex Switcher 重新登录', buckets: [] };
  if (response.status === 403) return { status: '服务拒绝请求 (403) · 未刷新令牌', buckets: [] };
  if (response.status === 429) return { status: '请求过于频繁 · 请稍后重试', buckets: [] };
  if (response.status >= 300 && response.status < 400) return { status: '接口返回跳转 · 已停止请求', buckets: [] };
  if (!response.ok) return { status: `查询失败 (${response.status})`, buckets: [] };
  try {
    const reader = response.body?.getReader();
    if (!reader) return { status: '接口响应无法解析', buckets: [] };
    const chunks = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return { status: '接口响应过大', buckets: [] };
      }
      chunks.push(Buffer.from(value));
    }
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const buckets = codexWindows(payload);
    if (!buckets.length) return { status: '接口未提供额度窗口', buckets: [] };
    return { status: '实时查询', plan: payload.plan_type ?? payload.planType ?? null, buckets };
  } catch {
    return { status: '接口响应无法解析', buckets: [] };
  }
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= values.length) return;
      output[index] = await fn(values[index]);
    }
  }));
  return output;
}

export async function codexSwitcherQuota(config = {}, { home = homedir(), fetchImpl = fetch } = {}) {
  const directory = configuredPath(config.codexSwitcherDir, join(home, '.codex-switcher'));
  const store = readJSON(join(directory, 'accounts.json'));
  const accounts = Array.isArray(store) ? store : store?.accounts;
  if (!Array.isArray(accounts)) return null;
  const stamp = new Date().toISOString();
  const items = await mapLimit(accounts, 3, async account => {
    const id = identifier(account);
    if (!id) return null;
    if (config.codexSwitcherLive === false) {
      return accountRow('codex', id, { plan: account.plan_type ?? account.planType ?? null, status: '实时查询已关闭', checkedAt: null });
    }
    const auth = codexAccountAuth(account);
    if (!auth) return accountRow('codex', id, { plan: account.plan_type ?? account.planType ?? null, status: '非 ChatGPT OAuth 账号', checkedAt: stamp });
    const quota = await chatgptUsage(auth, fetchImpl);
    return accountRow('codex', id, {
      plan: quota.plan ?? account.plan_type ?? account.planType ?? null,
      status: quota.status,
      checkedAt: quota.buckets.length ? stamp : null,
      buckets: quota.buckets,
    });
  });
  return quotaSnapshot('codex', 'Codex Switcher · ChatGPT 用量接口', items.filter(Boolean), stamp);
}

export async function fetchProjectQuotas(config = {}, options = {}) {
  const errors = [];
  const quotas = [];
  for (const [agent, collect] of [
    ['workbuddy', () => workbuddyQuota(config, options)],
    ['agy', () => antigravityManagerQuota(config, options)],
  ]) {
    try {
      const quota = collect();
      if (quota) quotas.push(quota);
    } catch {
      errors.push(`${agent}: account cache could not be read.`);
    }
  }
  try {
    const quota = await codexSwitcherQuota(config, options);
    if (quota) quotas.push(quota);
  } catch {
    errors.push('codex: account store could not be read.');
  }
  return { quotas, errors };
}

/** Keep the last good reading for the same pseudonymous account after a failed request. */
export function retainGoodAccounts(previous, current) {
  if (!Array.isArray(current?.accounts) || !Array.isArray(previous?.accounts)) return current;
  const old = new Map(previous.accounts.map(account => [account.key, account]));
  return {
    ...current,
    accounts: current.accounts.map(account => {
      const prior = old.get(account.key);
      if (!prior?.buckets?.length || !account.status || account.status === '实时查询' || account.status === '本机缓存') return account;
      return { ...account, buckets: prior.buckets, checkedAt: prior.checkedAt, status: `${account.status} · 显示上次数据` };
    }),
  };
}
