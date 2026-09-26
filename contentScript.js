/* BeBold 2.0 content script.
 *
 * Thin wiring only: reads preferences, decides whether this origin is enabled, and
 * drives window.BeBoldEngine. All rendering logic lives in engine.js, which is
 * deliberately free of chrome.* so it can be tested without installing an extension.
 */
(function () {
  'use strict';

  const ORIGIN = location.origin;
  const SITE_KEY = 'site:' + ORIGIN;

  const DEFAULTS = {
    enabled: true,
    preset: 'bold',
    strength: 3,
    ratio: 'default',
    scripts: { arabic: false, brahmic: false, cjk: false, seasia: false },
  };

  /* 1.4 kept its on/off state in the PAGE's localStorage, per origin, unsynced. The
     only people who ever wrote to it are those who deliberately turned BeBold off on
     a given site, so silently re-enabling it there is the worst regression available.
     Read it once, translate it, remove it. Carry this through 2.2, then delete.

     The try block is not optional: 1.4 died on this exact access wherever localStorage
     throws (opaque origins, sandboxed frames, partitioned storage), taking the whole
     content script with it. */
  async function migrateLegacyPreference() {
    let legacy = null;
    try {
      legacy = localStorage.getItem('extensionEnabled');
      if (legacy !== null) localStorage.removeItem('extensionEnabled');
    } catch {
      return;
    }
    if (legacy === 'false') {
      try { await chrome.storage.sync.set({ [SITE_KEY]: 'off' }); } catch { /* ignore */ }
    }
  }

  async function readConfig() {
    try {
      const stored = await chrome.storage.sync.get(null);
      return {
        enabled: stored.enabled !== false,
        siteOff: stored[SITE_KEY] === 'off',
        preset: stored.preset || DEFAULTS.preset,
        strength: stored.strength || DEFAULTS.strength,
        ratio: stored.ratio || DEFAULTS.ratio,
        scripts: Object.assign({}, DEFAULTS.scripts, stored.scripts),
      };
    } catch {
      return Object.assign({ siteOff: false }, DEFAULTS);
    }
  }

  function engineConfig(cfg) {
    return { preset: cfg.preset, strength: cfg.strength, ratio: cfg.ratio, scripts: cfg.scripts };
  }

  let current = null;

  async function sync() {
    const cfg = await readConfig();
    current = cfg;
    const shouldRun = cfg.enabled && !cfg.siteOff;
    const engine = window.BeBoldEngine;
    if (!engine) return;

    if (shouldRun) {
      if (engine.getStats().running) engine.setConfig(engineConfig(cfg));
      else engine.start(engineConfig(cfg));
    } else if (engine.getStats().running) {
      engine.stop();
    }
  }

  chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
    const engine = window.BeBoldEngine;
    if (req && req.action === 'getState') {
      sendResponse({
        origin: ORIGIN,
        supported: engine ? engine.supported() : false,
        config: current,
        stats: engine ? engine.getStats() : null,
      });
      return true;
    }
    if (req && req.action === 'refresh') {
      sync().then(() => sendResponse({ ok: true }));
      return true;
    }
    /* Keyboard command. The service worker cannot resolve the origin itself without
       the "tabs" permission, so it delegates here where location.origin is free. */
    if (req && req.action === 'toggleSite') {
      (async () => {
        const stored = await chrome.storage.sync.get(SITE_KEY);
        if (stored[SITE_KEY] === 'off') await chrome.storage.sync.remove(SITE_KEY);
        else await chrome.storage.sync.set({ [SITE_KEY]: 'off' });
        sendResponse({ ok: true });
      })();
      return true;
    }
    return false;
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const keys = Object.keys(changes);
    if (keys.some((k) => k === 'enabled' || k === SITE_KEY || k === 'preset' ||
                          k === 'strength' || k === 'ratio' || k === 'scripts')) {
      sync();
    }
  });

  (async () => {
    await migrateLegacyPreference();
    await sync();
  })();
})();
