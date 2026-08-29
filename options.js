/* Options page. Uses the real engine to render the live preview, so what the preview
   shows is what pages get, rather than a hand-maintained approximation. */

const DEFAULTS = {
  enabled: true,
  preset: 'bold',
  strength: 3,
  ratio: 'default',
  scripts: { arabic: false, brahmic: false, cjk: false, seasia: false },
};

const STRENGTH_LABEL = { 1: 'Subtle', 2: 'Light', 3: 'Default', 4: 'Strong', 5: 'Maximum' };
const $ = (id) => document.getElementById(id);

let saveTimer = 0;
function flashSaved() {
  const el = $('saved');
  el.classList.add('on');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => el.classList.remove('on'), 1400);
}

function currentFromForm() {
  return {
    preset: document.querySelector('input[name=preset]:checked').value,
    strength: Number($('strength').value),
    ratio: $('ratio').value,
    scripts: {
      arabic: $('s-arabic').checked,
      brahmic: $('s-brahmic').checked,
      cjk: $('s-cjk').checked,
      seasia: $('s-seasia').checked,
    },
  };
}

/* The preview is aria-hidden in the markup: a screen reader user gains nothing from
   hearing the sample sentence re-read on every slider step. */
function renderPreview() {
  const engine = window.BeBoldEngine;
  if (!engine || !engine.supported()) return;
  const cfg = currentFromForm();
  if (engine.getStats().running) engine.stop();
  engine.start(cfg);
}

async function save() {
  const cfg = currentFromForm();
  await chrome.storage.sync.set(cfg);
  $('strength-out').textContent = `${cfg.strength} · ${STRENGTH_LABEL[cfg.strength]}`;
  $('strength').setAttribute('aria-valuetext', STRENGTH_LABEL[cfg.strength]);
  renderPreview();
  flashSaved();
}

async function renderSites() {
  const stored = await chrome.storage.sync.get(null);
  const body = $('sites');
  const offSites = Object.keys(stored)
    .filter((k) => k.startsWith('site:') && stored[k] === 'off')
    .map((k) => k.slice(5))
    .sort();

  body.replaceChildren();
  if (!offSites.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 2;
    td.className = 'hint';
    td.textContent = 'No sites turned off.';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }
  for (const origin of offSites) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.className = 'origin';
    td.textContent = origin;
    const action = document.createElement('td');
    const btn = document.createElement('button');
    btn.textContent = 'Turn back on';
    btn.setAttribute('aria-label', `Turn BeBold back on for ${origin}`);
    btn.addEventListener('click', async () => {
      await chrome.storage.sync.remove('site:' + origin);
      renderSites();
      flashSaved();
    });
    action.appendChild(btn);
    tr.append(td, action);
    body.appendChild(tr);
  }
}

async function load() {
  const stored = await chrome.storage.sync.get(null);
  const cfg = Object.assign({}, DEFAULTS, {
    preset: stored.preset || DEFAULTS.preset,
    strength: stored.strength || DEFAULTS.strength,
    ratio: stored.ratio || DEFAULTS.ratio,
    scripts: Object.assign({}, DEFAULTS.scripts, stored.scripts),
  });

  document.querySelector(`#preset-${cfg.preset}`).checked = true;
  $('strength').value = String(cfg.strength);
  $('strength-out').textContent = `${cfg.strength} · ${STRENGTH_LABEL[cfg.strength]}`;
  $('strength').setAttribute('aria-valuetext', STRENGTH_LABEL[cfg.strength]);
  $('ratio').value = cfg.ratio;
  $('s-arabic').checked = !!cfg.scripts.arabic;
  $('s-brahmic').checked = !!cfg.scripts.brahmic;
  $('s-cjk').checked = !!cfg.scripts.cjk;
  $('s-seasia').checked = !!cfg.scripts.seasia;

  renderPreview();
  renderSites();
}

for (const el of document.querySelectorAll('input[name=preset], #strength, #ratio, ' +
  '#s-arabic, #s-brahmic, #s-cjk, #s-seasia')) {
  el.addEventListener('change', save);
  if (el.type === 'range') el.addEventListener('input', () => {
    $('strength-out').textContent = `${el.value} · ${STRENGTH_LABEL[el.value]}`;
  });
}

$('reset').addEventListener('click', async () => {
  await chrome.storage.sync.set(DEFAULTS);
  await load();
  flashSaved();
});

load();
