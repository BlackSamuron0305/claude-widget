# Claude Usage HUD

A small, low-overhead desktop HUD showing your Claude Max **session (5h)** and **weekly (7d)** usage, so you don't have to open a browser to check.

There is no public API for Claude subscription usage. This widget instead reads the same numbers Claude Code already renders in its statusline, via a small bridge script that Claude Code calls on every render.

Built as a native **C# / WPF** app (not Electron) — a single process using well under half the memory a Chromium-based widget would need, with no bundled browser engine.

## How it works

```
Claude Code  --(JSON on stdin)-->  usage-bridge.ps1  --(writes)-->  ~/.claude/usage-widget/state.json
                                          |
                                          +--(prints)--> normal one-line statusline text

ClaudeUsageHud.exe  --(watches + polls)-->  state.json  --> WPF window
```

The bridge script only runs while Claude Code is running — there is no way to get fresher numbers when it's closed. The widget shows the last known values plus a visible age indicator (`live` vs `updated Xm ago`). This is expected, not a bug.

## Install

### 1. Wire up the statusline bridge

The bridge script lives at `~/.claude/usage-bridge.ps1` and is merged into `~/.claude/settings.json`:

```json
"statusLine": {
  "type": "command",
  "command": "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\\Users\\<you>\\.claude\\usage-bridge.ps1\"",
  "refreshInterval": 10
}
```

If setting this up on a new machine, copy `usage-bridge.ps1` to `~/.claude/`, and merge the `statusLine` block above into your existing `~/.claude/settings.json` (use the **absolute path** — Claude Code does not expand `~`).

### 2. Build and run the widget

Requires the .NET 10 SDK.

```bash
cd ClaudeUsageHud
dotnet publish -c Release
```

This produces a self-contained single-file `ClaudeUsageHud.exe` under `bin/Release/net10.0-windows/win-x64/publish/` — no .NET runtime install needed on the machine that runs it. Run it directly, no terminal required afterward.

### 3. Autostart

The app registers itself to launch at login automatically (via `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`) the first time it runs. Toggle it off any time from the tray icon's **Launch at login** menu item.

## Widget states

- **Live** — green dot, data captured in the last 60 seconds.
- **Updated Xm/Xh ago** — grey dot, showing the age of the last known values while Claude Code isn't running.
- **No data yet** — Claude Code hasn't rendered a statusline in this session yet.
- **API-key session** — `rate_limits` is absent because you're authenticated via API key rather than a Pro/Max subscription; the widget says so instead of showing fake bars.

## Behavior notes

- The window sits at the **bottom of the z-order** — pinned directly above the desktop (`Progman`) via `SetWindowPos`, so every other application window opens above it. It never takes focus (`WS_EX_NOACTIVATE`), so clicking it to drag never brings it to the front.
- Position is draggable (via the card) and persisted to disk, so it reopens wherever you left it.
- Bar colors shift with usage: green under 50%, amber 50–80%, red above 80%.
- No network calls are made by the widget itself — all data comes from the local `state.json` file written by the bridge script.
- A background poll (every 2s) and a `FileSystemWatcher` both watch `state.json`, but the UI only re-renders (bar widths/colors) when the underlying data actually changes — a separate 1-second tick updates only the countdown text, to avoid needless redraws.

## Tray menu

Right-click the tray icon for:
- **Reset position** — snaps the HUD back to the top-right corner
- **Click-through** — lets clicks pass through the widget to whatever's behind it
- **Launch at login** — toggles Windows startup registration
- **Quit**
