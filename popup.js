/* The popup reads real state before rendering anything.
 *
 * 1.4 initialised its button label to "Turn Off" on every open regardless of reality,
 * so it could confidently claim to be on while doing nothing. That is fixed here by
 * asking the content script what is actually happening on this tab.
 */
const REASON_LABEL = {
  'non-text-element': 'not text',
  'interactive-control': 'buttons and controls',
  'code': 'code',
  'editable': 'editable text',
  'icon-font': 'icon fonts',
  'accuracy-critical': 'numbers, links, dosages',
  'site-opt-out': 'site asked us not to',
  'unsegmentable': 'could not segment',
  'script:arabic': 'Arabic script (off by default)',
  'script:brahmic': 'Indic scripts (off by default)',
  'script:cjk': 'Chinese, Japanese, Korean (off by default)',
  'script:seasia': 'Thai and neighbours (off by default)',
};

const REFUSAL_LABEL = {
  'credential-page': 'Off here on purpose: this page asks for a password or card number.',
  'site-opt-out': 'Off here on purpose: this site asked extensions not to alter its text.',
};

const $ = (id) => document.getElementById(id);

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function ask(tabId, message) {
  try { return await chrome.tabs.sendMessage(tabId, message); }
  catch { return null; }
}

function renderStats(state) {
  const summary = $('summary');
  const reasons = $('reasons');
  reasons.replaceChildren();

  if (!state) {
    summary.textContent = 'BeBold does not run on this page.';
    return;
  }
  if (!state.supported) {
    summary.textContent = 'This browser is missing the CSS Custom Highlight API.';
    return;
  }
  const s = state.stats;
  if (s && s.refused) {
    summary.textContent = REFUSAL_LABEL[s.refused] || ('Off here on purpose: ' + s.refused);
    return;
  }
  if (!s || !s.running) {
    summary.textContent = 'Off on this page.';
    return;
  }

  const total = s.treated + s.skipped;
  summary.innerHTML = `Bolded <b>${s.treated.toLocaleString()}</b> of ` +
    `<b>${total.toLocaleString()}</b> words on this page.`;

  const entries = Object.entries(s.reasons || {}).sort((a, b) => b[1] - a[1]).slice(0, 4);
  for (const [reason, n] of entries) {
    const li = document.createElement('li');
    const what = document.createElement('span');
    what.textContent = REASON_LABEL[reason] || reason;
    const count = document.createElement('span');
    count.textContent = n.toLocaleString();
    li.append(what, count);
    reasons.appendChild(li);
  }
  $('perf').textContent = s.lastPassMs ? `${s.lastPassMs} ms` : '';
}

async function refresh() {
  const tab = await activeTab();
  const state = tab && tab.id != null ? await ask(tab.id, { action: 'getState' }) : null;

  const stored = await chrome.storage.sync.get(null);
  $('enabled').checked = stored.enabled !== false;

  if (state && state.origin) {
    $('origin').textContent = state.origin;
    $('site').checked = stored['site:' + state.origin] !== 'off';
    $('site').disabled = false;
  } else {
    $('origin').textContent = 'not available here';
    $('site').checked = false;
    $('site').disabled = true;
  }
  renderStats(state);
}

$('enabled').addEventListener('change', async (e) => {
  await chrome.storage.sync.set({ enabled: e.target.checked });
  setTimeout(refresh, 120);
});

$('site').addEventListener('change', async (e) => {
  const origin = $('origin').textContent;
  if (!origin || origin === 'not available here') return;
  const key = 'site:' + origin;
  if (e.target.checked) await chrome.storage.sync.remove(key);
  else await chrome.storage.sync.set({ [key]: 'off' });
  setTimeout(refresh, 120);
});

$('options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

refresh();
