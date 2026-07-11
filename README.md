# Claude Usage HUD

A small always-on-top desktop HUD showing your Claude Max **session (5h)** and **weekly (7d)** usage, so you don't have to open a browser to check.

There is no public API for Claude subscription usage. This widget instead reads the same numbers Claude Code already renders in its statusline, via a small bridge script that Claude Code calls on every render.

## How it works

```
Claude Code  --(JSON on stdin)-->  usage-bridge script  --(writes)-->  ~/.claude/usage-widget/state.json
                                          |
                                          +--(prints)--> normal one-line statusline text

Electron widget  --(watches + polls)-->  state.json  --(IPC)-->  renderer HUD
```

The bridge script only runs while Claude Code is running — there is no way to get fresher numbers when it's closed. The widget shows the last known values plus a visible age indicator (`live` vs `updated Xm ago`). This is expected, not a bug.

## Install

### 1. Wire up the statusline bridge

The bridge script is already installed at `~/.claude/usage-bridge.ps1` (Windows/PowerShell) and merged into `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\Users\\<you>\\.claude\\usage-bridge.ps1\"",
  "refreshInterval": 10
}
```

If setting this up on a new machine, copy `usage-bridge.ps1` to `~/.claude/`, and merge the `statusLine` block above into your existing `~/.claude/settings.json` (use the **absolute path** — Claude Code does not expand `~`).

On macOS/Linux you'd write an equivalent bash+jq script and point `command` at that instead.

### 2. Install and run the widget

```bash
cd claude-widget
npm install
npm start
```

`npm install` runs a `postinstall` step (`scripts/fix-electron-install.js`) that repairs a known Electron install issue on some systems where the binary zip downloads and caches correctly but extraction silently stops partway through. If `npm start` fails with an Electron-not-installed error, run `npm install` again — the repair step is idempotent.

### 3. Package it (no terminal needed to launch)

```bash
npm run dist
```

Produces a portable `.exe` under `release/`. Pin it to your taskbar or add a shortcut to your Windows Startup folder to launch it automatically.

## Widget states

- **Live** — green dot, data captured in the last 60 seconds.
- **Updated Xm/Xh ago** — grey dot, showing the age of the last known values while Claude Code isn't running.
- **No data yet** — Claude Code hasn't rendered a statusline in this session yet.
- **API-key session** — `rate_limits` is absent because you're authenticated via API key rather than a Pro/Max subscription; the widget says so instead of showing fake bars.

## Tray menu

Right-click the tray icon for:
- **Reset position** — snaps the HUD back to the top-right corner
- **Click-through** — lets clicks pass through the widget to whatever's behind it
- **Launch at login** — toggles Windows startup registration
- **Quit**

## Notes

- The window position is draggable (via the header) and persisted to disk, so it reopens wherever you left it.
- Bar colors shift with usage: green under 50%, amber 50–80%, red above 80%.
- No network calls are made by the widget itself — all data comes from the local `state.json` file written by the bridge script.
