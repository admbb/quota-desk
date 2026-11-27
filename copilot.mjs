/**
 * GitHub Copilot quota reader.
 *
 * Follows what pinkpixel-dev/quota does for Copilot: the numbers come from GitHub's own
 * `copilot_internal/user` endpoint, which reports a `quota_snapshots` block per product
 * (completions, chat, premium interactions) plus the plan and the reset date.
 *
 * The token is the one the Copilot CLI already stored for this Windows user. Node cannot read
 * the Credential Manager on its own, so a small Python helper (`copilot-cred.py`) hands the blob
 * over on stdout; nothing is written to disk and the token never leaves this process.
 *
 * If that fails for any reason, the last response Copilot itself cached in
 * `%LOCALAPPDATA%\copilot\copilot-user-cache.json` is used instead, and the reading is stamped
 * with the time Copilot fetched it rather than "now".
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readJSON, finite } from './store.mjs';

const USER_ENDPOINT = 'https://api.github.com/copilot_internal/user';
const SCRIPT = join(import.meta.dirname ?? new URL('.', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), 'copilot-cred.py');
const TOKEN_PATTERN = /^(gh[pousr]_[A-Za-z0-9]{16,})$/;

const PYTHON_CANDIDATES = () => {
  const local = process.env.LOCALAPPDATA || '';
  return [
    'python',
    'python3',
    'py',
    join(homedir(), '.workbuddy', 'binaries', 'python', 'versions', '3.13.12', 'python.exe'),
    local && join(local, 'Programs', 'Python', 'Python313', 'python.exe'),
    local && join(local, 'Programs', 'Python', 'Python312', 'python.exe'),
  ].filter(Boolean);
};

let python = null;

function tryRun(exe, args, timeout = 15000) {
  return new Promise((resolveResult, reject) => {
    const child = spawn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', settled = false;
    const timer = setTimeout(() => { child.kill(); done(new Error('timeout')); }, timeout);
    const done = (error, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolveResult(value);
    };
    child.on('error', done);
    child.stdout.on('data', chunk => { out += chunk.toString(); });
    child.stderr.on('data', () => {});
    child.on('exit', code => code === 0 ? done(null, out) : done(new Error(`${exe} exited with ${code}`)));
  });
}

async function resolvePython(config) {
  if (python) return python;
  const candidates = [config.pythonExe, ...PYTHON_CANDIDATES()].filter(Boolean);
  for (const candidate of candidates) {
    try { await tryRun(candidate, ['--version'], 8000); python = candidate; return candidate; } catch { /* keep looking */ }
  }
  throw new Error('No Python interpreter was found, so the GitHub token cannot be read.');
}

/** Token shapes differ per writer: the CLI stores UTF-16LE, the desktop app plain UTF-8. */
function decodeToken(blobBase64) {
  const raw = Buffer.from(blobBase64, 'base64');
  const ascii = raw.toString('utf8').replace(/\u0000/g, '').trim();
  if (TOKEN_PATTERN.test(ascii)) return ascii;
  const utf16 = raw.toString('utf16le').replace(/\u0000/g, '').trim();
  if (TOKEN_PATTERN.test(utf16)) return utf16;
  return null;
}

const SOURCE_RANK = [/copilot-cli/i, /copilot-app/i, /github\.github-copilot/i, /^git:https:\/\/github\.com$/i];

async function readGitHubToken(config) {
  if (!existsSync(SCRIPT)) throw new Error('copilot-cred.py is missing.');
  const exe = await resolvePython(config);
  const output = await tryRun(exe, [SCRIPT], 20000);
  let parsed; try { parsed = JSON.parse(output); } catch { throw new Error('The credential helper returned no JSON.'); }
  const creds = Array.isArray(parsed.creds) ? parsed.creds : [];
  if (!creds.length) throw new Error('No GitHub token is stored for this user. Run `copilot login` once.');
  for (const rank of SOURCE_RANK) {
    for (const cred of creds) {
      if (!rank.test(cred.target || '')) continue;
      const token = decodeToken(cred.blob || '');
      if (token) return token;
    }
  }
  throw new Error('The stored GitHub credential is not a usable token.');
}

function percentage(snapshot) {
  const remaining = finite(snapshot?.percent_remaining);
  if (remaining !== null) return remaining;
  const entitlement = finite(snapshot?.entitlement);
  const left = finite(snapshot?.remaining);
  if (entitlement && left !== null) return (left / entitlement) * 100;
  return null;
}

function bucketFrom(name, label, snapshot, resetsAt) {
  if (!snapshot) return null;
  const unlimited = snapshot.unlimited === true;
  const entitlement = finite(snapshot.entitlement) ?? 0;
  const left = finite(snapshot.remaining);
  const percent = unlimited ? 100 : percentage(snapshot);
  const note = unlimited
    ? '不限量'
    : (left !== null && entitlement ? `剩余 ${Math.round(left * 10) / 10} / ${entitlement} 次` : null);
  return { key: name, label, remaining: percent === null ? null : Math.max(0, Math.min(100, percent)), resetsAt, note, unlimited };
}

/** The three snapshots Copilot exposes, premium requests first because that is the metered one. */
function buildBuckets(payload) {
  const snapshots = payload?.quota_snapshots || {};
  const premium = snapshots.premium_interactions || snapshots.premium_models;
  // GitHub only gives a date (`2026-12-01`); keep it local midnight so the panel does not shift it by the UTC offset.
  const reset = payload?.quota_reset_date ? `${payload.quota_reset_date}T00:00:00` : null;
  return [
    bucketFrom('premium', 'Premium 请求 · 月度', premium, reset),
    bucketFrom('chat', 'Copilot Chat · 月度', snapshots.chat, reset),
    bucketFrom('completions', '代码补全 · 月度', snapshots.completions, reset),
  ].filter(Boolean);
}

function cachedPayload() {
  const base = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  const file = join(base, 'copilot', 'copilot-user-cache.json');
  const raw = readJSON(file, null);
  const entries = raw && raw.copilotUserCache ? Object.values(raw.copilotUserCache) : [];
  const usable = entries
    .filter(entry => entry && entry.response && entry.response.quota_snapshots)
    .sort((a, b) => String(b.retrievedAt || '').localeCompare(String(a.retrievedAt || '')));
  return usable[0] || null;
}

async function requestUser(token) {
  const response = await fetch(USER_ENDPOINT, {
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/json',
      'X-GitHub-Api-Version': '2025-04-01',
      'User-Agent': 'quota-desk',
      'Editor-Version': 'vscode/1.95.0',
      'Editor-Plugin-Version': 'copilot-chat/0.23.0',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}.`);
  return response.json();
}

export async function copilotQuota(config = {}) {
  try {
    const token = await readGitHubToken(config);
    const payload = await requestUser(token);
    const buckets = buildBuckets(payload);
    if (!buckets.length) throw new Error('No Copilot quota was reported.');
    return {
      agent: 'github',
      source: 'GitHub Copilot · copilot_internal/user',
      checkedAt: new Date().toISOString(),
      plan: payload.copilot_plan || null,
      login: payload.login || null,
      buckets,
    };
  } catch (error) {
    const cached = cachedPayload();
    if (!cached) throw error;
    const buckets = buildBuckets(cached.response);
    if (!buckets.length) throw error;
    const stamp = Date.parse(cached.retrievedAt);
    return {
      agent: 'github',
      source: 'GitHub Copilot · 本机缓存',
      checkedAt: Number.isFinite(stamp) ? new Date(stamp).toISOString() : new Date().toISOString(),
      plan: cached.response.copilot_plan || null,
      login: cached.response.login || null,
      buckets,
      cached: true,
    };
  }
}
