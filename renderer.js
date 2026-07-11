let latestState = null;

const el = {
  model: document.getElementById('model-name'),
  empty: document.getElementById('empty-state'),
  blocks: document.getElementById('quota-blocks'),
  sessionPct: document.getElementById('session-pct'),
  sessionBar: document.getElementById('session-bar'),
  sessionSub: document.getElementById('session-sub'),
  weeklyPct: document.getElementById('weekly-pct'),
  weeklyBar: document.getElementById('weekly-bar'),
  weeklySub: document.getElementById('weekly-sub'),
  dot: document.getElementById('status-dot'),
  statusText: document.getElementById('status-text')
};

function colorForPct(pct) {
  if (pct == null) return 'rgba(255,255,255,0.15)';
  if (pct < 50) return '#4ADE80';
  if (pct < 80) return '#FBBF24';
  return '#F87171';
}

function formatCountdown(resetsAtEpochSeconds) {
  if (resetsAtEpochSeconds == null) return null;
  const diffMs = resetsAtEpochSeconds * 1000 - Date.now();
  if (diffMs <= 0) return 'now';
  const totalMinutes = Math.floor(diffMs / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatAge(capturedAtEpochSeconds) {
  const diffMs = Date.now() - capturedAtEpochSeconds * 1000;
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return { live: true, text: 'live' };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { live: false, text: `updated ${minutes}m ago` };
  const hours = Math.floor(minutes / 60);
  return { live: false, text: `updated ${hours}h ago` };
}

function showEmptyState(message) {
  el.blocks.classList.add('hidden');
  el.empty.classList.remove('hidden');
  el.empty.textContent = message;
  el.dot.className = 'dot';
  el.statusText.textContent = '';
}

function renderQuotaBlock(pctEl, barEl, subEl, quota) {
  if (!quota || quota.used_percentage == null) {
    pctEl.textContent = '--';
    pctEl.classList.add('dim');
    barEl.style.width = '0%';
    barEl.style.backgroundColor = colorForPct(null);
    subEl.innerHTML = '&nbsp;';
    return;
  }

  const pct = Math.round(quota.used_percentage);
  pctEl.textContent = `${pct}%`;
  pctEl.classList.remove('dim');
  barEl.style.width = `${Math.min(Math.max(pct, 0), 100)}%`;
  barEl.style.backgroundColor = colorForPct(pct);

  const countdown = formatCountdown(quota.resets_at);
  subEl.textContent = countdown ? `resets in ${countdown}` : ' ';
}

function render() {
  if (!latestState) {
    showEmptyState('No data yet — waiting for Claude Code to run in this session.');
    return;
  }

  const state = latestState;
  el.model.textContent = (state.model && state.model.display_name) || '-';

  if (!state.rate_limits) {
    showEmptyState('Session limits unavailable. This appears to be an API-key session, not a Pro/Max subscription.');
    return;
  }

  el.blocks.classList.remove('hidden');
  el.empty.classList.add('hidden');

  renderQuotaBlock(el.sessionPct, el.sessionBar, el.sessionSub, state.rate_limits.five_hour);
  renderQuotaBlock(el.weeklyPct, el.weeklyBar, el.weeklySub, state.rate_limits.seven_day);

  const age = formatAge(state.captured_at);
  el.dot.className = age.live ? 'dot live' : 'dot';
  el.statusText.textContent = age.text;
}

window.bridge.onState((state) => {
  latestState = state;
  render();
});

window.bridge.getState().then((state) => {
  latestState = state;
  render();
});

// Tick locally every second so countdowns and staleness age move even between pushes.
setInterval(render, 1000);
