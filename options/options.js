(async () => {
  'use strict';
  const N = globalThis.EcijaNaming;
  const $ = id => document.getElementById(id);

  let settings, projects;

  async function load() {
    const s = await chrome.storage.sync.get(['settings', 'projects']);
    settings = N.mergeSettings(s.settings);
    projects = s.projects || {};
    render();
  }

  function render() {
    $('enabled').checked = settings.enabled;
    $('autoExpand').checked = settings.autoExpand;
    $('showBadges').checked = settings.showBadges;
    $('stopWords').value = settings.stopWords.join(', ');

    const tb = $('suffixRows');
    tb.textContent = '';
    N.CATEGORIES.forEach(c => {
      const tr = document.createElement('tr');
      const td1 = document.createElement('td'); td1.textContent = c.label;
      const td2 = document.createElement('td'); td2.textContent = c.covers;
      const td3 = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'text'; inp.className = 'mono'; inp.dataset.cat = c.key;
      inp.value = c.locked ? '_choice' : settings.suffixes[c.key];
      inp.disabled = !!c.locked;
      inp.setAttribute('aria-label', 'Sufijo ' + c.label);
      td3.append(inp);
      tr.append(td1, td2, td3);
      tb.append(tr);
    });

    const box = $('projects');
    box.textContent = '';
    const ids = Object.keys(projects);
    if (!ids.length) {
      const p = document.createElement('p'); p.className = 'empty';
      p.textContent = 'Todavía no hay proyectos configurados.';
      box.append(p);
    }
    ids.forEach(envId => {
      const p = projects[envId];
      const node = $('projTpl').content.firstElementChild.cloneNode(true);
      node.dataset.env = envId;
      node.querySelector('.pname').textContent = p.name || '(sin nombre)';
      node.querySelector('.penv').textContent = envId;
      node.querySelectorAll('[data-f]').forEach(i => { i.value = p[i.dataset.f] || ''; });
      node.querySelector('.del').addEventListener('click', () => {
        if (!confirm(`¿Eliminar el proyecto "${p.name || envId}"?`)) return;
        delete projects[envId];
        render();
        $('status').textContent = 'Pulsa "Guardar cambios" para confirmar.';
      });
      const sols = node.querySelector('.sols');
      Object.entries(p.solutions || {}).forEach(([solId, s]) => {
        const row = document.createElement('div'); row.className = 'row';
        const lab = document.createElement('span'); lab.className = 'mono hint'; lab.textContent = 'Solución ' + solId;
        const inp = document.createElement('input'); inp.type = 'text'; inp.className = 'mono';
        inp.value = s.extraPrefix || ''; inp.dataset.sol = solId; inp.setAttribute('aria-label', 'Prefijo de la solución');
        const del = document.createElement('button'); del.className = 'btn danger'; del.type = 'button'; del.textContent = 'Quitar';
        del.addEventListener('click', () => { delete p.solutions[solId]; row.remove(); });
        row.append(lab, inp, del);
        sols.append(row);
      });
      box.append(node);
    });
  }

  function collect() {
    settings.enabled = $('enabled').checked;
    settings.autoExpand = $('autoExpand').checked;
    settings.showBadges = $('showBadges').checked;
    settings.stopWords = $('stopWords').value.split(/[,\n;]+/).map(w => N.normalizeText(w)).filter(Boolean);
    document.querySelectorAll('#suffixRows input').forEach(i => {
      if (i.disabled) return;
      settings.suffixes[i.dataset.cat] = N.cleanSuffix(i.value) || N.CATEGORIES.find(c => c.key === i.dataset.cat).suffix;
    });
    settings.suffixes.choice = '_choice';
    document.querySelectorAll('.proj').forEach(node => {
      const p = projects[node.dataset.env];
      if (!p) return;
      node.querySelectorAll('[data-f]').forEach(i => {
        p[i.dataset.f] = i.dataset.f === 'name' ? i.value.trim() : N.cleanPrefix(i.value);
      });
      node.querySelectorAll('[data-sol]').forEach(i => {
        if (p.solutions && p.solutions[i.dataset.sol]) p.solutions[i.dataset.sol].extraPrefix = N.cleanPrefix(i.value);
      });
    });
  }

  $('save').addEventListener('click', async () => {
    collect();
    await chrome.storage.sync.set({ settings, projects });
    render();
    $('status').textContent = 'Guardado ✔';
    setTimeout(() => { $('status').textContent = ''; }, 2000);
  });

  $('resetStop').addEventListener('click', e => {
    e.preventDefault();
    $('stopWords').value = N.DEFAULT_STOP_WORDS.join(', ');
  });

  $('export').addEventListener('click', () => {
    collect();
    const blob = new Blob([JSON.stringify({ format: 'ecija-naming', version: 1, settings, projects }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'ecija-naming-config.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', async () => {
    const f = $('importFile').files[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.format !== 'ecija-naming') throw new Error('Formato no reconocido');
      settings = N.mergeSettings(data.settings);
      projects = data.projects && typeof data.projects === 'object' ? data.projects : {};
      render();
      $('status').textContent = 'Importado. Pulsa "Guardar cambios" para aplicarlo.';
    } catch (err) {
      $('status').textContent = 'Error al importar: ' + err.message;
    }
    $('importFile').value = '';
  });

  load();
})();
