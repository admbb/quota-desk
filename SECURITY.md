# Security policy

## Reporting a vulnerability

Please do not open a public issue for a security problem. Use GitHub's private
reporting: **Security → Report a vulnerability** on the repository page. You will
get an answer within a few days, and a fix or a mitigation plan before details
are made public.

## Supported versions

Only the latest release (`0.x`) receives fixes.

## What Quota Desk does and does not do

Quota Desk reads usage data that your agents already keep on your machine and
shows it in a local web page. It is built to keep that bounded:

- **No dependencies.** The collector starts the Codex app server
  (`account/rateLimits/read`) and Antigravity's `agy -p /usage` in plan mode,
  and makes fixed HTTPS usage requests to ChatGPT and GitHub. Git is run only
  as `git worktree list` in the project folders you add. Executable paths come
  from `config.json`, never from a request.
- **Codex Switcher access tokens are narrowly used.** The multi-account reader
  selects only the stored ChatGPT access token and matching account ID, keeps
  them in memory, and sends them to the fixed `chatgpt.com` usage endpoint.
  It never selects or uses refresh-token fields, retries a `401`, follows redirects,
  writes the account store, or includes credentials or raw account IDs in the
  dashboard, saved readings, errors or exports. Turn this request off with
  `"codexSwitcherLive": false` in `config.json`.
- **GitHub Copilot credentials are narrowly used on Windows.** A small Python
  helper reads matching entries from the current user's Windows Credential
  Manager and returns them to the Node process over standard output. The token
  is used only for a fixed HTTPS request to GitHub's Copilot usage endpoint; it
  is not written to Quota Desk's data folder or logs. If a local Copilot cache is
  available, it can be used when the live request is unavailable.
- **WorkBuddy and Antigravity account summaries are local-only.** Their account
  indexes and quota snapshots are read without making requests or selecting
  auth fields. Only pseudonymous labels, quota values, plan/status flags and
  timestamps are saved to Quota Desk.
- **Read-only towards your agents.** The Codex client refuses any method other
  than the two quota reads; it never starts a conversation, logs in, or spends a
  reset. The OpenCode database is opened read-only and only numeric usage columns
  are selected. Prompts, transcripts and source files are not copied. Session
  snapshots contain only titles, a first-request excerpt of at most 240
  characters with known credential patterns redacted, models, branches,
  timestamps and token counts. Credentials are never included in saved quota
  snapshots; the two account readers that use tokens send them only to the
  fixed vendor endpoints described above.
- **Loopback by default.** The server listens on `127.0.0.1` and answers only when
  the `Host` header is `127.0.0.1:<port>` or `localhost:<port>`, which blocks DNS
  rebinding. Every write needs a matching `Origin` and a random per-process token.
  Responses carry a strict Content-Security-Policy, and only the dashboard's
  HTML, JavaScript, CSS, and WorkBuddy icon are served from `public/`.
- **LAN mode is subnet-limited.** It accepts only a private IPv4 `Host` and
  clients from the destination interface's IPv4 subnet. By default it also
  requires the generated access code. `"lanCode": false` deliberately skips
  login, so every reachable device in that subnet can read the dashboard.
- **Project folders are local only.** Network (UNC) and device paths, and folders
  whose real path is a network share (a mapped drive, or a link to a share), are
  refused when you add a project and skipped when they appear in `config.json`
  or as a Git worktree of a project.

## LAN mode

LAN mode is **off** unless you set `"lan": true` in `config.json`. When it is on:

- The server listens on all interfaces, and accepts only a private IPv4 `Host`
  and a client source address in the same IPv4 subnet as the destination
  interface. DNS names are refused.
- By default, other clients must enter an access code (`XXXX-XXXX`, stored in
  `lan-code`). Five wrong codes per minute per address lock that address out for
  the rest of the minute. Set `"lanCode": false` to skip login; any reachable
  client in the subnet can then read the dashboard.
- **Network clients are read-only.** They can view the panel, export it and ask
  for a quota refresh (at most one query a minute). Adding records, notes,
  projects or manual quotas is refused with `403`.
- It is plain HTTP. When login is enabled, the code and cookie cross your
  network unencrypted. When login is disabled, every reachable client in the
  subnet can read the dashboard. Use LAN mode only on a network you control,
  never on public or shared Wi-Fi. Prefer an SSH tunnel (see the README) when in
  doubt.
- Connections from this computer, including through an SSH tunnel or a local
  reverse proxy, count as local: they need no code and can write. Do not put a
  proxy that forwards outside traffic in front of Quota Desk.

What a signed-in network client can see: quota readings, session titles and
first-request excerpts, models, branches, token counts, your manual records and
notes, and the names and **absolute paths** of your projects.

Report anything that makes Quota Desk do more than this.
