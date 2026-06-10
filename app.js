const STORAGE_KEY = 'timer-app-data';
const PREFS_KEY = 'timer-app-prefs';
const ACTIVE_TIMER_KEY = 'timer-app-active';

const MIN_SIZE = 8;
const MAX_SIZE = 40;
const SIZE_STEP = 2;

const state = {
  mode: 'idle', // idle | running | paused | finished
  totalSeconds: 0,
  remainingSeconds: 0,
  endAt: null,
  pausedRemainingMs: null,
  intervalId: null,
  runStartedAt: null,
  lastRunEndedAt: null,
};

const els = {
  display: document.getElementById('display'),
  setupPanel: document.getElementById('setup-panel'),
  inputHours: document.getElementById('input-hours'),
  inputMinutes: document.getElementById('input-minutes'),
  inputSeconds: document.getElementById('input-seconds'),
  btnPrimary: document.getElementById('btn-primary'),
  btnReset: document.getElementById('btn-reset'),
  btnStop: document.getElementById('btn-stop'),
  btnSizeDown: document.getElementById('btn-size-down'),
  btnSizeUp: document.getElementById('btn-size-up'),
  btnDashboard: document.getElementById('btn-dashboard'),
  btnFullscreen: document.getElementById('btn-fullscreen'),
  btnCloseDashboard: document.getElementById('btn-close-dashboard'),
  dashboard: document.getElementById('dashboard'),
  dashboardContent: document.getElementById('dashboard-content'),
};

function loadData() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return data && Array.isArray(data.runs) ? data : { runs: [] };
  } catch {
    return { runs: [] };
  }
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || { displaySize: 18 };
  } catch {
    return { displaySize: 18 };
  }
}

function savePrefs(prefs) {
  localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

function formatTime(totalSec) {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function clampInput(input, max) {
  let val = parseInt(input.value, 10);
  if (isNaN(val) || val < 0) val = 0;
  if (val > max) val = max;
  input.value = val;
  return val;
}

function getSelectedSeconds() {
  const h = clampInput(els.inputHours, 99);
  const m = clampInput(els.inputMinutes, 59);
  const s = clampInput(els.inputSeconds, 59);
  return h * 3600 + m * 60 + s;
}

function updateDisplay() {
  els.display.textContent = formatTime(state.remainingSeconds);
}

function getRemainingSeconds() {
  if (state.mode === 'running' && state.endAt) {
    return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
  }
  if (state.pausedRemainingMs != null) {
    return Math.ceil(state.pausedRemainingMs / 1000);
  }
  return state.remainingSeconds;
}

function saveActiveTimer() {
  if (state.mode === 'running' && state.endAt) {
    sessionStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify({
      endAt: state.endAt,
      totalSeconds: state.totalSeconds,
      runStartedAt: state.runStartedAt,
    }));
  } else if (state.mode === 'paused') {
    sessionStorage.setItem(ACTIVE_TIMER_KEY, JSON.stringify({
      paused: true,
      pausedRemainingMs: state.pausedRemainingMs,
      totalSeconds: state.totalSeconds,
      runStartedAt: state.runStartedAt,
    }));
  } else {
    sessionStorage.removeItem(ACTIVE_TIMER_KEY);
  }
}

function clearActiveTimer() {
  sessionStorage.removeItem(ACTIVE_TIMER_KEY);
}

function startInterval() {
  clearInterval(state.intervalId);
  state.intervalId = setInterval(syncTimer, 250);
}

function finishTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.endAt = null;
  state.pausedRemainingMs = null;
  state.remainingSeconds = 0;
  clearActiveTimer();
  updateDisplay();
  setMode('finished');
  playAlarm();
  recordRun(state.totalSeconds);
}

function syncTimer() {
  if (state.mode !== 'running') return;

  state.remainingSeconds = getRemainingSeconds();
  updateDisplay();

  if (state.remainingSeconds <= 0) {
    finishTimer();
  }
}

function restoreActiveTimer() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ACTIVE_TIMER_KEY));
    if (!saved) return;

    state.totalSeconds = saved.totalSeconds;
    state.runStartedAt = saved.runStartedAt;

    if (saved.paused) {
      state.pausedRemainingMs = saved.pausedRemainingMs;
      state.remainingSeconds = Math.ceil(saved.pausedRemainingMs / 1000);
      setMode('paused');
      updateDisplay();
      return;
    }

    if (!saved.endAt) return;

    state.endAt = saved.endAt;
    const remaining = Math.max(0, Math.ceil((saved.endAt - Date.now()) / 1000));

    if (remaining <= 0) {
      state.remainingSeconds = 0;
      updateDisplay();
      finishTimer();
      return;
    }

    state.remainingSeconds = remaining;
    setMode('running');
    updateDisplay();
    startInterval();
  } catch {
    clearActiveTimer();
  }
}

function setDisplaySize(size) {
  const clamped = Math.min(MAX_SIZE, Math.max(MIN_SIZE, size));
  document.documentElement.style.setProperty('--display-size', `${clamped}vw`);
  const prefs = loadPrefs();
  prefs.displaySize = clamped;
  savePrefs(prefs);
}

function playAlarm() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const now = ctx.currentTime;

  function tone(freq, start, dur) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.3, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + dur);
  }

  for (let i = 0; i < 6; i++) {
    tone(880, now + i * 0.5, 0.4);
    tone(660, now + i * 0.5 + 0.25, 0.3);
  }
}

function dateKey(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateKey(today.getTime()) === key) return 'Today';
  if (dateKey(yesterday.getTime()) === key) return 'Yesterday';

  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function recordRun(durationSeconds) {
  const data = loadData();
  const endedAt = Date.now();
  const startedAt = state.runStartedAt || endedAt - durationSeconds * 1000;

  data.runs.push({
    id: crypto.randomUUID(),
    date: dateKey(endedAt),
    startedAt,
    endedAt,
    durationSeconds,
    completed: true,
  });

  state.lastRunEndedAt = endedAt;
  saveData(data);
}

function recordCancelledRun() {
  if (!state.runStartedAt) return;
  const remaining = getRemainingSeconds();
  const data = loadData();
  data.runs.push({
    id: crypto.randomUUID(),
    date: dateKey(Date.now()),
    startedAt: state.runStartedAt,
    endedAt: Date.now(),
    durationSeconds: state.totalSeconds - remaining,
    completed: false,
  });
  saveData(data);
}

function getDailySummaries() {
  const completedRuns = loadData().runs.filter(r => r.completed);
  const byDay = {};

  for (const run of completedRuns) {
    if (!byDay[run.date]) byDay[run.date] = [];
    byDay[run.date].push(run);
  }

  return Object.entries(byDay)
    .map(([date, runs]) => {
      runs.sort((a, b) => a.startedAt - b.startedAt);
      return {
        date,
        runCount: runs.length,
        breakCount: Math.max(0, runs.length - 1),
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}

function buildDashboard() {
  const summaries = getDailySummaries();

  if (summaries.length === 0) {
    els.dashboardContent.innerHTML = '<p class="empty-state">No sessions yet.<br>Complete a timer to see stats.</p>';
    return;
  }

  els.dashboardContent.innerHTML = summaries.map(({ date, runCount, breakCount }) => `
    <div class="day-row">
      <div class="day-date">${formatDateLabel(date)}</div>
      <div class="day-stats">
        <span><strong>${runCount}</strong> runs</span>
        <span><strong>${breakCount}</strong> breaks</span>
      </div>
    </div>
  `).join('');
}

function setMode(mode) {
  state.mode = mode;

  els.display.classList.toggle('finished', mode === 'finished');
  els.setupPanel.classList.toggle('hidden', mode === 'running');

  els.btnPrimary.textContent = mode === 'running' ? 'Pause' : mode === 'paused' ? 'Resume' : mode === 'finished' ? 'New Timer' : 'Start';
  els.btnReset.disabled = mode === 'idle';
  els.btnStop.disabled = mode === 'idle' || mode === 'finished';

  els.inputHours.disabled = mode === 'running';
  els.inputMinutes.disabled = mode === 'running';
  els.inputSeconds.disabled = mode === 'running';
}

function startTimer() {
  const seconds = getSelectedSeconds();
  if (seconds <= 0) return;

  state.totalSeconds = seconds;
  state.remainingSeconds = seconds;
  state.runStartedAt = Date.now();
  state.endAt = Date.now() + seconds * 1000;
  state.pausedRemainingMs = null;
  updateDisplay();
  setMode('running');
  startInterval();
  saveActiveTimer();
}

function pauseTimer() {
  if (state.endAt) {
    state.pausedRemainingMs = Math.max(0, state.endAt - Date.now());
    state.remainingSeconds = Math.ceil(state.pausedRemainingMs / 1000);
    state.endAt = null;
  }
  clearInterval(state.intervalId);
  state.intervalId = null;
  updateDisplay();
  setMode('paused');
  saveActiveTimer();
}

function resumeTimer() {
  state.endAt = Date.now() + state.pausedRemainingMs;
  state.pausedRemainingMs = null;
  setMode('running');
  startInterval();
  saveActiveTimer();
}

function stopTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  recordCancelledRun();
  state.runStartedAt = null;
  state.endAt = null;
  state.pausedRemainingMs = null;
  state.remainingSeconds = state.totalSeconds;
  clearActiveTimer();
  updateDisplay();
  setMode('idle');
  els.setupPanel.classList.remove('hidden');
}

function resetTimer() {
  clearInterval(state.intervalId);
  state.intervalId = null;
  state.runStartedAt = null;
  state.endAt = null;
  state.pausedRemainingMs = null;
  state.totalSeconds = getSelectedSeconds();
  state.remainingSeconds = state.totalSeconds;
  clearActiveTimer();
  updateDisplay();
  setMode('idle');
  els.setupPanel.classList.remove('hidden');
}

function newTimer() {
  state.runStartedAt = null;
  state.endAt = null;
  state.pausedRemainingMs = null;
  state.totalSeconds = 0;
  state.remainingSeconds = 0;
  clearActiveTimer();
  els.display.textContent = formatTime(getSelectedSeconds());
  setMode('idle');
  els.setupPanel.classList.remove('hidden');
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen();
  }
}

els.btnPrimary.addEventListener('click', () => {
  switch (state.mode) {
    case 'idle': startTimer(); break;
    case 'running': pauseTimer(); break;
    case 'paused': resumeTimer(); break;
    case 'finished': newTimer(); break;
  }
});

els.btnReset.addEventListener('click', resetTimer);
els.btnStop.addEventListener('click', stopTimer);

els.btnSizeDown.addEventListener('click', () => {
  const prefs = loadPrefs();
  setDisplaySize(prefs.displaySize - SIZE_STEP);
});

els.btnSizeUp.addEventListener('click', () => {
  const prefs = loadPrefs();
  setDisplaySize(prefs.displaySize + SIZE_STEP);
});

els.btnDashboard.addEventListener('click', () => {
  buildDashboard();
  els.dashboard.classList.remove('hidden');
  els.dashboard.setAttribute('aria-hidden', 'false');
});

els.btnCloseDashboard.addEventListener('click', () => {
  els.dashboard.classList.add('hidden');
  els.dashboard.setAttribute('aria-hidden', 'true');
});

els.dashboard.addEventListener('click', (e) => {
  if (e.target === els.dashboard) {
    els.dashboard.classList.add('hidden');
    els.dashboard.setAttribute('aria-hidden', 'true');
  }
});

els.btnFullscreen.addEventListener('click', toggleFullscreen);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !els.dashboard.classList.contains('hidden')) {
    els.dashboard.classList.add('hidden');
    els.dashboard.setAttribute('aria-hidden', 'true');
  }
});

[els.inputHours, els.inputMinutes, els.inputSeconds].forEach(input => {
  input.addEventListener('change', () => {
    if (state.mode === 'idle') {
      state.remainingSeconds = getSelectedSeconds();
      updateDisplay();
    }
  });
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') syncTimer();
});

window.addEventListener('focus', syncTimer);
window.addEventListener('pageshow', syncTimer);

const prefs = loadPrefs();
setDisplaySize(prefs.displaySize);
state.remainingSeconds = getSelectedSeconds();
updateDisplay();
restoreActiveTimer();
if (state.mode === 'idle') setMode('idle');
