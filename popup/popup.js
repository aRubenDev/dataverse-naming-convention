(async () => {
  'use strict';
  const N = globalThis.EcijaNaming;
  const $ = id => document.getElementById(id);

  const store = await chrome.storage.sync.get(['settings', 'projects']);
  const settings = N.mergeSettings(store.settings);
  const projects = store.projects || {};

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const ctx = N.parseContext(tab && tab.url);

  $('enabled').checked = settings.enabled;

  N.CATEGORIES.forEach(c => {
    const o = document.createElement('option');
    o.value = c.key; o.textContent = c.label;
    $('pvType').append(o);
  });
  $('pvType').value = 'date';

  if (!ctx.envId) {
    $('noEnv').hidden = false;
  } else {
    $('envSection').hidden = false;
    $('envId').textContent = 'Entorno: ' + ctx.envId;
    const p = projects[ctx.envId] || {};
    $('projName').value = p.name || '';
    $('extraPrefix').value = p.extraPrefix || '';
    $('pubPrefix').value = p.publisherPrefix || '';
    if (ctx.solutionId) {
      $('solBlock').hidden = false;
      $('solId').textContent = 'Solución: ' + ctx.solutionId;
      const s = p.solutions && p.solutions[ctx.solutionId];
      $('solOverride').checked = !!s;
      $('solPrefix').hidden = !s;
      $('solPrefix').value = s ? s.extraPrefix || '' : '';
    }
  }

  function draftProjects() {
    const all = JSON.parse(JSON.stringify(projects));
    if (!ctx.envId) return all;
    const p = all[ctx.envId] || {};
    p.name = $('projName').value.trim();
    p.extraPrefix = N.cleanPrefix($('extraPrefix').value);
    p.publisherPrefix = N.cleanPrefix($('pubPrefix').value);
    p.solutions = p.solutions || {};
    if (ctx.solutionId) {
      if ($('solOverride').checked) p.solutions[ctx.solutionId] = { extraPrefix: N.cleanPrefix($('solPrefix').value) };
      else delete p.solutions[ctx.solutionId];
    }
    all[ctx.envId] = p;
    return all;
  }

  function preview() {
    if (!ctx.envId) return;
    const proj = N.resolveProject(draftProjects(), ctx);
    const name = N.buildName({ displayName: $('pvName').value, category: $('pvType').value, settings, extraPrefix: proj.extraPrefix });
    $('pvOut').textContent = name ? (proj.publisherPrefix || 'pub_') + name : '—';
  }

  ['projName', 'extraPrefix', 'pubPrefix', 'solPrefix', 'pvName'].forEach(id => $(id).addEventListener('input', preview));
  $('pvType').addEventListener('change', preview);
  $('solOverride').addEventListener('change', () => { $('solPrefix').hidden = !$('solOverride').checked; preview(); });
  preview();

  $('save').addEventListener('click', async () => {
    settings.enabled = $('enabled').checked;
    await chrome.storage.sync.set({ settings, projects: draftProjects() });
    $('status').textContent = 'Guardado ✔';
    setTimeout(() => { $('status').textContent = ''; }, 1800);
  });
  $('enabled').addEventListener('change', async () => {
    settings.enabled = $('enabled').checked;
    await chrome.storage.sync.set({ settings });
    $('status').textContent = settings.enabled ? 'Activado' : 'Desactivado';
  });
  $('openOptions').addEventListener('click', e => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
})();
