const AGENTS = [
  { id: 'workbuddy', name: 'WorkBuddy', note: '本机积分快照' },
  { id: 'codex', name: 'ChatGPT / Codex', note: 'Codex Switcher 多账号' },
  { id: 'agy', name: 'Antigravity', note: 'Antigravity Manager 多账号' },
  { id: 'github', name: 'GitHub Copilot', note: '官方 copilot_internal 接口' },
];

// Official OpenAI mark (simple-icons build of the brand asset), drawn inline so it follows the theme.
const OPENAI_PATH = 'M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z';

// Official Antigravity icon (https://antigravity.google/favicon.svg), kept as-is so its gradients survive.
const AGY_ICON = 'data:image/png;base64,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';

const SVG_NS = 'http://www.w3.org/2000/svg';

function openaiIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', OPENAI_PATH);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

function antigravityIcon() {
  const img = document.createElement('img');
  img.src = AGY_ICON;
  img.alt = '';
  return img;
}

// Official GitHub Copilot mark (simple-icons build of the brand asset), inlined so it follows the theme.
const COPILOT_PATH = 'M23.922 16.997C23.061 18.492 18.063 22.02 12 22.02 5.937 22.02.939 18.492.078 16.997A.641.641 0 0 1 0 16.741v-2.869a.883.883 0 0 1 .053-.22c.372-.935 1.347-2.292 2.605-2.656.167-.429.414-1.055.644-1.517a10.098 10.098 0 0 1-.052-1.086c0-1.331.282-2.499 1.132-3.368.397-.406.89-.717 1.474-.952C7.255 2.937 9.248 1.98 11.978 1.98c2.731 0 4.767.957 6.166 2.093.584.235 1.077.546 1.474.952.85.869 1.132 2.037 1.132 3.368 0 .368-.014.733-.052 1.086.23.462.477 1.088.644 1.517 1.258.364 2.233 1.721 2.605 2.656a.841.841 0 0 1 .053.22v2.869a.641.641 0 0 1-.078.256Zm-11.75-5.992h-.344a4.359 4.359 0 0 1-.355.508c-.77.947-1.918 1.492-3.508 1.492-1.725 0-2.989-.359-3.782-1.259a2.137 2.137 0 0 1-.085-.104L4 11.746v6.585c1.435.779 4.514 2.179 8 2.179 3.486 0 6.565-1.4 8-2.179v-6.585l-.098-.104s-.033.045-.085.104c-.793.9-2.057 1.259-3.782 1.259-1.59 0-2.738-.545-3.508-1.492a4.359 4.359 0 0 1-.355-.508Zm2.328 3.25c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm-5 0c.549 0 1 .451 1 1v2c0 .549-.451 1-1 1-.549 0-1-.451-1-1v-2c0-.549.451-1 1-1Zm3.313-6.185c.136 1.057.403 1.913.878 2.497.442.544 1.134.938 2.344.938 1.573 0 2.292-.337 2.657-.751.384-.435.558-1.15.558-2.361 0-1.14-.243-1.847-.705-2.319-.477-.488-1.319-.862-2.824-1.025-1.487-.161-2.192.138-2.533.529-.269.307-.437.808-.438 1.578v.021c0 .265.021.562.063.893Zm-1.626 0c.042-.331.063-.628.063-.894v-.02c-.001-.77-.169-1.271-.438-1.578-.341-.391-1.046-.69-2.533-.529-1.505.163-2.347.537-2.824 1.025-.462.472-.705 1.179-.705 2.319 0 1.211.175 1.926.558 2.361.365.414 1.084.751 2.657.751 1.21 0 1.902-.394 2.344-.938.475-.584.742-1.44.878-2.497Z';

function copilotIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'glyph');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', COPILOT_PATH);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

// 640×640 WorkBuddy color icon from LobeHub's official-logo collection:
// https://github.com/lobehub/lobe-icons/tree/master/packages/static-png/light
function workbuddyIcon() {
  const mark = document.createElement('img');
  mark.src = '/workbuddy.png';
  mark.alt = 'WorkBuddy';
  mark.width = 640;
  mark.height = 640;
  return mark;
}

const ICONS = { workbuddy: workbuddyIcon, codex: openaiIcon, agy: antigravityIcon, github: copilotIcon };

const SOURCE = [
  [/^WorkBuddy\s*·\s*本机积分快照$/i, '本机积分缓存'],
  [/^Codex Switcher\s*·\s*ChatGPT 用量接口$/i, '逐账号实时查询 · 不刷新令牌'],
  [/^Antigravity Manager\s*·\s*本机额度缓存$/i, '本机额度缓存'],
  [/^Codex\s*·\s*official app server$/i, '官方 app-server'],
  [/^Antigravity\s*·\s*\/usage$/i, '官方 /usage 命令'],
  [/GitHub Copilot\s*·\s*copilot_internal\/user$/i, '官方接口 · 实时'],
  [/GitHub Copilot\s*·\s*本机缓存$/i, '官方接口 · 本机缓存'],
];

let data = null;
let busy = false;

const $ = selector => document.querySelector(selector);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = String(text);
  return node;
}

function sourceText(agent, quota) {
  const raw = quota && quota.source ? String(quota.source) : '';
  for (const [pattern, text] of SOURCE) if (pattern.test(raw)) return text;
  return raw || agent.note;
}

function translateLabel(label, agentId) {
  let text = String(label || '');
  text = text
    .replace(/·\s*(\d+)\s*days?\b/i, '· $1 天')
    .replace(/·\s*(\d+)\s*hours?\b/i, '· $1 小时')
    .replace(/·\s*(\d+)\s*minutes?\b/i, '· $1 分钟')
    .replace(/\bweekly\b/i, '每周')
    .replace(/Claude\s+and\s+GPT\s+models?/i, 'Claude 与 GPT 模型')
    .replace(/Gemini\s+models?/i, 'Gemini 模型')
    .replace(/\bcodex\b/i, 'Codex');
  if (agentId === 'codex') text = text.replace(/^Codex\s*·\s*/, '');
  return text.trim() || '额度';
}

function level(value) {
  if (!Number.isFinite(value)) return '';
  if (value < 20) return 'low';
  if (value < 50) return 'warn';
  return 'good';
}

function percentText(value) {
  if (!Number.isFinite(value)) return '未知';
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

function resetText(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '重置时间未知';
  const date = new Date(time);
  if (date.getFullYear() < 2000) return '重置时间未知';
  const absolute = new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
  const left = time - Date.now();
  if (left <= 0) return `预计 ${absolute} 重置（已到期）`;
  const minutes = Math.round(left / 60000);
  if (minutes < 60) return `预计 ${absolute} 重置（约 ${minutes} 分钟后）`;
  const hours = Math.round(left / 3600000);
  if (hours < 48) return `预计 ${absolute} 重置（约 ${hours} 小时后）`;
  return `预计 ${absolute} 重置（约 ${Math.round(hours / 24)} 天后）`;
}

function clockText(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '时间未知';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(new Date(time));
}

function agoText(time) {
  const seconds = Math.round((Date.now() - time) / 1000);
  if (!Number.isFinite(seconds)) return '';
  if (seconds < 45) return '刚刚';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

/** Per-card reading time, e.g. "更新于 03:28:40 · 16 分钟前". */
function updatedText(iso) {
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return '还没有读到额度';
  const date = new Date(time);
  const clock = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(date);
  const sameDay = date.toDateString() === new Date().toDateString();
  const day = sameDay ? '' : `${new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)} `;
  return `更新于 ${day}${clock} · ${agoText(time)}`;
}

function warningText(warning) {
  const text = String(warning || '');
  if (/codex/i.test(text) && /ENOENT/i.test(text)) return 'Codex 读取失败：找不到可执行文件，请在 config.json 里设置 codexExe。';
  if (/antigravity|agy/i.test(text) && /ENOENT/i.test(text)) return 'Antigravity 读取失败：找不到 agy 命令。';
  if (/github|python|credential/i.test(text) && /GitHub answered 401|GitHub answered 403|not a usable token|No GitHub token/i.test(text)) {
    return 'GitHub Copilot 读取失败：本机保存的令牌已失效，在终端执行一次 `copilot login` 即可。';
  }
  if (/github|python|credential/i.test(text) && /Python interpreter/i.test(text)) {
    return 'GitHub Copilot 读取失败：找不到 Python，无法从凭据管理器取令牌（可在 config.json 设置 pythonExe）。';
  }
  if (/timed out/i.test(text)) return '配额查询超时，稍后再试。';
  if (/did not return|did not export/i.test(text)) return '该账户没有返回可用额度，保留上一次读数。';
  return text;
}

function notice(message, isError) {
  const box = $('#notice');
  if (!message) { box.hidden = true; box.textContent = ''; box.className = 'notice'; return; }
  box.textContent = message;
  box.className = isError ? 'notice error' : 'notice';
  box.hidden = false;
}

function renderWindow(agent, bucket) {
  const item = el('li', 'window');
  const row = el('div', 'window-row');
  row.append(el('span', 'window-label', translateLabel(bucket.label, agent.id)));
  const remaining = typeof bucket.remaining === 'number' ? bucket.remaining : NaN;
  const value = Number.isFinite(remaining) ? Math.max(0, Math.min(100, remaining)) : NaN;
  const unlimited = bucket.unlimited === true;
  row.append(el('span', `pct ${unlimited ? 'good' : level(value)}`, unlimited ? '不限量' : percentText(value)));
  item.append(row);

  const bar = document.createElement('progress');
  bar.max = 100;
  bar.value = Number.isFinite(value) ? value : 0;
  const tone = level(value);
  if (tone) bar.classList.add(tone);
  item.append(bar);

  const detail = [unlimited ? null : bucket.note, resetText(bucket.resetsAt)].filter(Boolean).join(' · ');
  item.append(el('p', 'reset', detail));
  return item;
}

function renderCard(agent, quota) {
  const card = el('section', 'card');
  card.dataset.agent = agent.id;

  const head = el('div', 'card-head');
  const mark = el('span', 'mark');
  mark.append((ICONS[agent.id] || antigravityIcon)());
  head.append(mark);
  const info = el('div');
  info.append(el('h2', null, agent.name));
  info.append(el('p', null, sourceText(agent, quota)));
  head.append(info);
  card.append(head);

  const buckets = quota && Array.isArray(quota.buckets) ? quota.buckets : [];
  if (quota && Array.isArray(quota.accounts)) {
    if (!quota.accounts.length) {
      card.append(el('p', 'empty', '账号库中没有可识别账号。'));
      card.append(el('p', 'card-foot', updatedText(quota.checkedAt)));
      return card;
    }
    const accounts = el('div', 'account-list');
    for (const account of quota.accounts) {
      const group = el('section', 'account-group');
      const title = el('div', 'account-title');
      title.append(el('strong', null, account.label || '账号'));
      if (account.plan) title.append(el('span', 'account-plan', account.plan));
      group.append(title);
      const status = account.status || (account.buckets?.length ? '额度已读取' : '额度未知');
      group.append(el('p', 'account-status', status));
      if (Array.isArray(account.buckets) && account.buckets.length) {
        const list = el('ul', 'windows account-windows');
        for (const bucket of account.buckets) list.append(renderWindow(agent, bucket));
        group.append(list);
      } else if (agent.id === 'workbuddy') {
        group.append(el('p', 'empty account-empty', '没有积分快照；在 WorkBuddy 中刷新积分后再查看。'));
      }
      group.append(el('p', 'account-updated', updatedText(account.checkedAt)));
      accounts.append(group);
    }
    card.append(accounts);
    card.append(el('p', 'card-foot', updatedText(quota.checkedAt)));
    return card;
  }
  if (!buckets.length) {
    card.append(el('p', 'empty', '还没有读到额度。点右上角「刷新额度」，或确认该账户已登录。'));
    card.append(el('p', 'card-foot', updatedText(quota && quota.checkedAt)));
    return card;
  }

  const list = el('ul', 'windows');
  for (const bucket of buckets) list.append(renderWindow(agent, bucket));
  card.append(list);
  card.append(el('p', 'card-foot', updatedText(quota.checkedAt)));
  return card;
}

function render() {
  const grid = $('#cards');
  grid.replaceChildren();
  const quotas = new Map((data.quotas || []).map(item => [item.agent, item]));
  for (const agent of AGENTS) grid.append(renderCard(agent, quotas.get(agent.id)));

  const updated = $('#updated');
  updated.textContent = `面板数据生成于 ${clockText(data.generatedAt)}`;

  const warnings = Array.isArray(data.warnings) ? data.warnings.filter(Boolean) : [];
  if (warnings.length) notice(warnings.map(warningText).join(' '), true);
  else notice('');
}

async function load() {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('无法读取本机数据，请确认服务仍在运行。');
    data = await response.json();
    render();
  } catch (error) {
    notice(error.message, true);
  }
}

const quotaStamps = () => new Map((data && data.quotas ? data.quotas : []).map(item => [item.agent, item.checkedAt]));

async function refresh() {
  if (busy) return;
  busy = true;
  const button = $('#refresh');
  button.disabled = true;
  button.textContent = '查询中…';
  try {
    if (!data) await load();
    if (!data) return;
    const before = quotaStamps();
    notice('正在读取 WorkBuddy 与 Antigravity 本机缓存，并查询 ChatGPT/Codex 各账号和 GitHub Copilot。Codex 不会自动刷新令牌。');

    // The server only answers this POST once both accounts replied, so it is not awaited: the
    // loop below watches the stored readings and stops as soon as one of them is newer.
    fetch('/api/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Quota-Desk-Token': data.csrf },
      body: '{}',
    }).then(response => response.json()).then(result => {
      if (result && result.queried === false) notice('额度每分钟最多查询一次，请稍后再点。');
    }).catch(() => {});

    const deadline = Date.now() + 80000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      await load();
      const after = quotaStamps();
      if ([...after].some(([agent, stamp]) => before.get(agent) !== stamp)) return;
    }
    notice('查询还没有返回，稍后再看一次。', true);
  } finally {
    busy = false;
    button.disabled = false;
    button.textContent = '刷新额度';
  }
}

$('#refresh').addEventListener('click', refresh);
load();
setInterval(load, 5 * 60 * 1000);
