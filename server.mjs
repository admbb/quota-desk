import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { hostAllowed, isLoopback, isSameSubnetClient, newAccessCode, codeMatches, createSessions, createLimiter, loginPage } from './lan.mjs';
import { initData, readJSON, saveJSON, filesJSON, agents, validateRecord, normalizeQuota, clean } from './store.mjs';
import { fetchQuotas, collectRelay, collectNative, collectQwen, projectName } from './collectors.mjs';
import { retainGoodAccounts } from './project-quotas.mjs';
import { dataDirectory, localFolder } from './paths.mjs';

const publicDirectory = join(dirname(fileURLToPath(import.meta.url)), 'public');
// Windows installers put Codex and Antigravity under %LOCALAPPDATA%; elsewhere they are on PATH.
const defaultExecutable = (windowsPath, name) => {
  const candidate = process.platform === 'win32' && process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, windowsPath) : null;
  return candidate && existsSync(candidate) ? candidate : name;
};

const ZH_LABEL = [
  [/·\s*(\d+)\s*days?\b/gi, '· $1 天'],
  [/·\s*(\d+)\s*hours?\b/gi, '· $1 小时'],
  [/·\s*(\d+)\s*minutes?\b/gi, '· $1 分钟'],
  [/\bweekly\b/gi, '每周'],
  [/Claude\s+and\s+GPT\s+models?/gi, 'Claude/GPT'],
  [/Gemini\s+models?/gi, 'Gemini'],
  [/\bcodex\b/gi, 'Codex'],
];

function zhLabel(label, agent) {
  let text = String(label || '');
  for (const [pattern, replacement] of ZH_LABEL) text = text.replace(pattern, replacement);
  if (agent === 'codex') text = text.replace(/^Codex\s*·\s*/, '');
  return text.trim();
}

/** Local "HH:MM", or "M/D HH:MM" for another day; null when the stamp is a placeholder. */
function zhStamp(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return null;
  const date = new Date(time);
  if (date.getFullYear() < 2000) return null;
  const pad = value => String(value).padStart(2, '0');
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  return date.toDateString() === new Date().toDateString() ? clock : `${date.getMonth() + 1}/${date.getDate()} ${clock}`;
}

/** Plain-text digest for clients that cannot parse JSON (iOS Shortcuts, curl, widgets). */
export function summaryText(snapshot) {
  const names = { workbuddy: 'WorkBuddy', codex: 'ChatGPT / Codex', agy: 'Antigravity', github: 'GitHub Copilot' };
  const byAgent = new Map((snapshot.quotas || []).map(quota => [quota.agent, quota]));
  const lines = [];
  for (const id of ['workbuddy', 'codex', 'agy', 'github']) {
    lines.push(names[id]);
    const quota = byAgent.get(id);
    if (Array.isArray(quota?.accounts)) {
      if (!quota.accounts.length) lines.push('  · 暂无账号');
      for (const account of quota.accounts) {
        const plan = account.plan ? ` · ${account.plan}` : '';
        lines.push(`  ${account.label || '账号'}${plan} · ${account.status || '额度未知'}`);
        for (const bucket of account.buckets || []) {
          const remaining = typeof bucket.remaining === 'number' ? bucket.remaining : NaN;
          const percent = Number.isFinite(remaining) ? `${Math.round(remaining * 10) / 10}%` : '未知';
          const notes = [bucket.note, bucket.resetsAt && zhStamp(bucket.resetsAt) ? `${zhStamp(bucket.resetsAt)} 重置` : null].filter(Boolean);
          lines.push(`    · ${zhLabel(bucket.label, id)}  ${percent}${notes.length ? `（${notes.join('，')}）` : ''}`);
        }
      }
      lines.push('');
      continue;
    }
    const buckets = quota && Array.isArray(quota.buckets) ? quota.buckets : [];
    if (!buckets.length) {
      lines.push('  · 暂无数据');
    } else {
      for (const bucket of buckets) {
        const remaining = typeof bucket.remaining === 'number' ? bucket.remaining : NaN;
        const percent = bucket.unlimited ? '不限量' : Number.isFinite(remaining) ? `${Math.round(remaining * 10) / 10}%` : '未知';
        const notes = [bucket.unlimited ? null : bucket.note, bucket.resetsAt && zhStamp(bucket.resetsAt) ? `${zhStamp(bucket.resetsAt)} 重置` : null].filter(Boolean);
        lines.push(`  · ${zhLabel(bucket.label, id)}  ${percent}${notes.length ? `（${notes.join('，')}）` : ''}`);
      }
      const read = zhStamp(quota.checkedAt);
      if (read) lines.push(`  更新于 ${read}`);
    }
    lines.push('');
  }
  const warnings = (snapshot.warnings || []).filter(Boolean);
  if (warnings.length) lines.push(`注意：${warnings.join('；')}`);
  return `${lines.join('\n').trim()}\n`;
}

export function createApp({ dataDir = dataDirectory(), port = 4318, lan: lanOption } = {}) {
  const data = dataDir; initData(data);
  const configPath = join(data, 'config.json');
  let config = readJSON(configPath, { projects: [], nativeSessions: true,
    codexExe: defaultExecutable('Programs/OpenAI/Codex/bin/codex.exe', 'codex'), agyExe: defaultExecutable('agy/bin/agy.exe', 'agy'),
    workbuddyDir: '', codexSwitcherDir: '', antigravityManagerDir: '', codexSwitcherLive: true });
  const origin = `http://127.0.0.1:${port}`, nonce = randomBytes(24).toString('hex');
  // LAN mode is opt-in ("lan": true in config.json). Off, the panel is loopback-only.
  const lan = lanOption ?? config.lan === true;
  const requireCode = lan && config.lanCode !== false;
  const sessions = createSessions(), limiter = createLimiter();
  const codePath = join(data, 'lan-code');
  let accessCode = null;
  if (requireCode) {
    accessCode = readJSON(codePath, null)?.code;
    if (!accessCode) { accessCode = newAccessCode(); saveJSON(codePath, { code: accessCode }); }
  }
  let refreshed = null, lastAttempt = 0, snapshot = null, snapshotTime = 0, errors = [], collecting = null;
  const snapshotData = async () => {
    if (snapshot && Date.now() - snapshotTime < 10000) return snapshot;
    if (collecting) return collecting;
    collecting = (async () => {
      const relay = collectRelay(config.projects);
      const map = new Map((await collectNative(config)).map(record => [record.id, record]));
      if (config.nativeSessions !== false) for (const record of collectQwen(config)) map.set(record.id, record);
      for (const record of filesJSON(join(data, 'sessions'))) {
        const prior = map.get(record.id) || {};
        map.set(record.id, { ...prior, ...record, tokens: prior.tokens ?? record.tokens,
          project: prior.project || projectName(record.cwd, config.projects) });
      }
      for (const record of [...relay.records, ...filesJSON(join(data, 'records'))]) map.set(record.id, record);
      const labels = new Map(filesJSON(join(data, 'labels')).map(label => [label.id, label]));
      const records = [...map.values()].map(record => {
        const { cwd, ...publicRecord } = record;
        return { ...publicRecord, ...labels.get(record.id) };
      }).sort((a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0));
      snapshot = { generatedAt: new Date().toISOString(), agents, records, quotas: filesJSON(join(data, 'quotas')), projects: config.projects,
        warnings: [...errors, ...relay.warnings], csrf: nonce, nativeSessions: config.nativeSessions };
      snapshotTime = Date.now(); return snapshot;
    })();
    try { return await collecting; } finally { collecting = null; }
  };
  const refresh = async () => {
    if (refreshed) return refreshed;
    // Prevent a browser or repeated clicks from continuously querying accounts.
    if (Date.now() - lastAttempt < 60000) return { queried: false };
    lastAttempt = Date.now();
    refreshed = (async () => {
      const results = await fetchQuotas(config); errors = [];
      for (const result of results) {
        if (result.quota) {
          const path = join(data, 'quotas', `${result.quota.agent}.json`);
          const previous = readJSON(path);
          saveJSON(path, retainGoodAccounts(previous, result.quota));
        }
        else errors.push(`${agents[result.agent]}: ${result.error} The last reading, if any, is kept.`);
      }
      snapshot = null;
      return { queried: true };
    })();
    try { return await refreshed; } finally { refreshed = null; }
  };
  const server = createServer(async (req, res) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    const json = (status, value) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); };
    if (lan && !isLoopback(req.socket.remoteAddress) && !isSameSubnetClient(req.socket.remoteAddress, req.socket.localAddress)) {
      req.resume(); return json(403, { error: 'LAN clients must share the destination interface subnet.' });
    }
    if (!hostAllowed(req.headers.host, port, lan)) return json(403, { error: 'Host not allowed.' });
    const pageOrigin = `http://${req.headers.host}`;
    if (lan && requireCode && !isLoopback(req.socket.remoteAddress) && !sessions.valid(req.headers.cookie)) {
      const page = (status, message = '', headers = {}) => {
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'");
        res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', ...headers }); res.end(loginPage(message));
      };
      let path; try { path = new URL(req.url, pageOrigin).pathname; } catch { req.resume(); return json(400, { error: 'Bad request.' }); }
      const from = req.socket.remoteAddress;
      if (req.method === 'POST' && path === '/login') {
        const loginOrigin = req.headers.origin;
        if (loginOrigin !== pageOrigin) {
          console.log(`[login-refused] origin=${JSON.stringify(loginOrigin)} from=${from} ua=${req.headers['user-agent'] || '-'}`);
          req.resume();
          return json(403, { error: 'Request not allowed.' });
        }
        if (limiter.blocked(from)) return page(429, 'Too many attempts. Wait a minute.');
        // A client that drops the connection mid-body rejects this loop; it must not reach the process.
        let text = ''; try { for await (const chunk of req) { text += chunk.toString(); if (text.length > 512) return json(413, { error: 'Request too large.' }); } } catch { return; }
        if (!codeMatches(new URLSearchParams(text).get('code'), accessCode)) { limiter.fail(from); return page(401, 'Wrong code.'); }
        limiter.clear(from);
        res.writeHead(303, { Location: '/', 'Set-Cookie': `qd_session=${sessions.issue()}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000` }); return res.end();
      }
      // Drain any body so a refused POST does not reset the client's connection.
      req.resume();
      if (path.startsWith('/api/')) return json(401, { error: 'Access code required.' });
      return page(401);
    }
    // A device on the network may read the panel and ask for a quota refresh, never change records or projects.
    const readOnly = lan && !isLoopback(req.socket.remoteAddress);
    try {
      const path = new URL(req.url, origin).pathname;
      if (req.method === 'GET' && path === '/api/data') return json(200, { ...await snapshotData(), readOnly });
      if (req.method === 'GET' && path === '/api/summary') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end(summaryText(await snapshotData()));
      }
      if (req.method === 'GET' && path === '/api/export') {
        const value = await snapshotData(); res.setHeader('Content-Disposition', 'attachment; filename="quota-desk-export.json"');
        return json(200, { generatedAt: value.generatedAt, records: value.records, quotas: value.quotas });
      }
      if (req.method === 'POST' && path.startsWith('/api/')) {
        const postOrigin = req.headers.origin;
        const originOk = postOrigin === pageOrigin;
        const tokenOk = req.headers['x-quota-desk-token'] === nonce;
        if (!originOk || !tokenOk) {
          console.log(`[csrf-refused] ${path} origin=${JSON.stringify(postOrigin)} token=${tokenOk} from=${req.socket.remoteAddress} ua=${req.headers['user-agent'] || '-'}`);
          req.resume();
          return json(403, { error: 'Request not allowed.' });
        }
        if (readOnly && path !== '/api/refresh') return json(403, { error: 'Read-only over the network. Make changes on this computer.' });
        let text = ''; for await (const chunk of req) { text += chunk.toString(); if (text.length > 16000) return json(413, { error: 'Request too large.' }); }
        const input = JSON.parse(text || '{}');
        if (collecting) await collecting;
        if (path === '/api/refresh') { const result = await refresh(); return json(200, { ok: true, ...result }); }
        else if (path === '/api/record') { const record = validateRecord(input); saveJSON(join(data, 'records', `${record.id}.json`), record); }
        else if (path === '/api/project') {
          const folder = String(input.name || '').trim() && localFolder(input.path);
          if (!folder || !statSync(folder).isDirectory()) throw new Error('Enter a name and an existing local folder (network paths are not accepted).');
          const name = clean(input.name).slice(0, 100), projectPath = resolve(input.path);
          config.projects = config.projects.filter(project => project.path.toLowerCase() !== projectPath.toLowerCase());
          config.projects.push({ name, path: projectPath }); saveJSON(configPath, config);
        } else if (path === '/api/label') {
          const records = (await snapshotData()).records;
          if (!records.some(record => record.id === input.id)) throw new Error('Unknown record.');
          if (!String(input.task || '').trim()) throw new Error('Enter the task or issue.');
          const id = createHash('sha256').update(input.id).digest('hex');
          saveJSON(join(data, 'labels', `${id}.json`), { id: input.id, task: clean(input.task), summary: clean(input.summary), evidence: clean(input.evidence), next: clean(input.next) });
        } else if (path === '/api/quota') {
          if (!Object.hasOwn(agents, input.agent) || input.agent === 'qwen' || input.remaining === '' || !Number.isFinite(Number(input.remaining)) || Number(input.remaining) < 0 || Number(input.remaining) > 100) throw new Error('The quota must be a percentage between 0 and 100.');
          const quota = normalizeQuota(input.agent, 'Manual entry · as reported', [{ label: input.label || 'Available', remaining: Number(input.remaining), resetsAt: input.resetsAt }]);
          saveJSON(join(data, 'quotas', `${input.agent}.json`), quota);
        } else return json(404, { error: 'Unknown action.' });
        snapshot = null; return json(200, { ok: true });
      }
      const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/workbuddy.png': ['workbuddy.png', 'image/png'] };
      if (req.method !== 'GET' || !files[path]) return json(404, { error: 'Not found.' });
      const [file, type] = files[path]; res.writeHead(200, { 'Content-Type': type.startsWith('image/') ? type : `${type}; charset=utf-8` }); res.end(readFileSync(join(publicDirectory, file)));
    } catch (error) { json(400, { error: clean(error.message) }); }
  });
  server.on('close', () => clearInterval(interval));
  const interval = setInterval(() => { refresh().catch(() => {}); }, 300000); interval.unref();
  return { server, refresh, origin, lan, accessCode };
}

/** Start the panel and resolve once it listens. */
export function start({ port = 4318, ...options } = {}) {
  const app = createApp({ port, ...options });
  return new Promise((resolveStart, reject) => {
    app.server.once('error', reject);
    app.server.listen(port, app.lan ? '0.0.0.0' : '127.0.0.1', () => {
      console.log(`Quota Desk: ${app.origin}`);
      if (app.lan) console.log(`LAN mode on: open http://<this computer's IP>:${port} on the other device and enter the code in ${join(options.dataDir || dataDirectory(), 'lan-code')}.`);
      app.refresh().catch(() => {});
      resolveStart(app);
    });
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  start().catch(error => { console.error(error.message); process.exitCode = 1; });
}
