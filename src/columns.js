/*
 * ECIJA Dataverse Naming — resaltado de la lista de columnas de una tabla (make.powerapps.com).
 *
 * En la página Tablas → <tabla> → Columnas marca cada fila según los textos de sus celdas:
 *   - Obligatoria (barra roja) y Recomendada (barra azul): columna «Requerido / Obligatorio».
 *   - Mía (fondo verde): el nombre lógico empieza por el prefijo del publicador del popup.
 *     Dataverse no guarda quién creó una columna; el prefijo es lo más fiable.
 *   - De otro publicador (fondo lila: nombre con otro prefijo) y Estándar (atenuada: sin prefijo).
 *   - No cumple (borde ámbar): mía y el nombre no termina en el sufijo de su tipo.
 * Solo añade atributos data-* a las filas y una leyenda flotante: no cambia nada del portal.
 * La lista es virtual (solo existen las filas visibles), así que se revisa periódicamente.
 */
(() => {
  'use strict';
  if (window.__ecijaColumnsLoaded) return;
  window.__ecijaColumnsLoaded = true;

  const N = globalThis.EcijaNaming;
  const norm = N.normalizeText;
  const ATTR = 'data-ecija-col';
  const TAGS = [
    { key: 'req', label: 'Obligatorias' },
    { key: 'rec', label: 'Recomendadas' },
    { key: 'mine', label: 'Mías' },
    { key: 'custom', label: 'De otro publicador' },
    { key: 'std', label: 'Estándar (atenuadas)' },
    { key: 'warn', label: 'No cumplen el estándar' }
  ];

  let settings = N.mergeSettings({});
  let projects = {};
  // Qué resaltados están activos (se guardan en este navegador)
  let visible = Object.fromEntries(TAGS.map(t => [t.key, true]));
  let collapsed = false;

  try {
    chrome.storage.sync.get(['settings', 'projects'], r => {
      settings = N.mergeSettings(r && r.settings);
      projects = (r && r.projects) || {};
    });
    chrome.storage.local.get('columnHighlight', r => {
      const v = r && r.columnHighlight;
      if (v) { Object.assign(visible, v.visible || {}); collapsed = !!v.collapsed; }
    });
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && ch.settings) settings = N.mergeSettings(ch.settings.newValue);
      if (area === 'sync' && ch.projects) projects = ch.projects.newValue || {};
    });
  } catch (e) { /* contexto de la extensión invalidado tras recargarla */ }

  const savePrefs = () => { try { chrome.storage.local.set({ columnHighlight: { visible, collapsed } }); } catch (e) { /* noop */ } };

  // ---------- Cabeceras reconocidas (texto normalizado) ----------
  const H = {
    name: [/^nombre$/, /^name$/, /^nombre logico$/, /^logical name$/, /^nombre de esquema$/, /^schema name$/],
    display: [/^nombre para mostrar$/, /^display name$/, /^columna$/, /^column$/],
    type: [/^tipo de datos?$/, /^data type$/, /^tipo$/, /^type$/],
    required: [/^obligatori[oa]$/, /^requerid[oa]$/, /^required$/, /^requisito$/, /^nivel de requisito$/, /^requirement( level)?$/]
    // «Personalizado» no se usa: el portal pone «Sí» también en columnas de sistema (createdby…)
  };
  const isHeader = (text, key) => H[key].some(r => r.test(text));
  const cellText = el => norm(el.innerText || el.textContent || '');
  // El portal añade caracteres invisibles (iconos de orden, espacios de ancho cero) a cabeceras y celdas
  const clean = t => t.replace(/[^a-z0-9_/ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const colIndex = (el, i) => Number(el.getAttribute('aria-colindex')) || (i + 1);

  /** Busca la lista de columnas: una cuadrícula (fuera de paneles) con cabecera de tipo de datos y de nombre. */
  function findGrids() {
    const out = [];
    for (const g of document.querySelectorAll('[role="grid"], [role="treegrid"], table')) {
      if (g.closest('[role="dialog"], [aria-modal="true"], .ms-Panel, .fui-OverlayDrawer')) continue;
      const heads = Array.from(g.querySelectorAll('[role="columnheader"], th'));
      if (!heads.length) continue;
      const map = {};
      heads.forEach((h, i) => {
        const t = clean(cellText(h));
        for (const key of Object.keys(H)) if (map[key] == null && isHeader(t, key)) map[key] = colIndex(h, i);
      });
      if (map.type != null && (map.name != null || map.display != null)) out.push({ g, map, ordinal: !heads.some(h => h.hasAttribute('aria-colindex')) });
    }
    return out;
  }

  /** Celdas de una fila indexadas por columna (aria-colindex o posición). */
  function cellsOf(row, ordinal) {
    const cells = Array.from(row.querySelectorAll('[role="gridcell"], [role="rowheader"], td'))
      .filter(c => c.closest('[role="row"], tr') === row);
    const out = {};
    cells.forEach((c, i) => { out[ordinal ? i + 1 : colIndex(c, i)] = c; });
    return out;
  }

  // Si las posiciones no cuadran (columna de selección sin cabecera), el nombre lógico se busca por su forma.
  const LOGICAL = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/;

  function classifyRows(grid, ctx) {
    const counts = Object.fromEntries(TAGS.map(t => [t.key, 0]));
    let rows = 0;
    for (const row of grid.g.querySelectorAll('[role="row"], tr')) {
      if (row.querySelector('[role="columnheader"], th')) continue;
      const cells = cellsOf(row, grid.ordinal);
      const text = k => (grid.map[k] != null && cells[grid.map[k]] ? clean(cellText(cells[grid.map[k]])) : '');
      let name = text('name').replace(/[^a-z0-9_]/g, '');
      if (!LOGICAL.test(name)) name = (Object.values(cells).map(c => clean(cellText(c))).find(t => LOGICAL.test(t) && t.includes('_')) || name);
      const res = N.classifyColumn({ name, type: text('type'), required: text('required') }, ctx);
      const value = res.tags.join(' ');
      if (row.getAttribute(ATTR) !== value) row.setAttribute(ATTR, value);
      // Motivo del incumplimiento como información emergente de la fila
      const tip = res.issues.join(' · ');
      if (tip && row.getAttribute('title') !== tip && (!row.hasAttribute('title') || row.hasAttribute('data-ecija-title'))) {
        row.setAttribute('title', tip); row.setAttribute('data-ecija-title', '');
      } else if (!tip && row.hasAttribute('data-ecija-title')) { row.removeAttribute('title'); row.removeAttribute('data-ecija-title'); }
      res.tags.forEach(t => { counts[t]++; });
      rows++;
    }
    return { counts, rows };
  }

  // ---------- Leyenda flotante ----------
  let legend = null;
  function renderLegend(stats, ctx, hasRequired) {
    if (!legend) {
      legend = document.createElement('div');
      legend.className = 'ecija-cl';
      legend.addEventListener('change', e => {
        const k = e.target && e.target.dataset && e.target.dataset.k;
        if (!k) return;
        visible[k] = e.target.checked; savePrefs(); applyVisibility();
      });
      legend.addEventListener('click', e => {
        if (e.target.closest('.ecija-cl-toggle')) { collapsed = !collapsed; savePrefs(); legend.dataset.sig = ''; tick(); }
      });
      document.body.appendChild(legend);
    }
    const notes = [];
    if (!ctx.publisherPrefix) notes.push('Configura el prefijo del publicador en el popup para marcar las tuyas.');
    if (!hasRequired) notes.push('Añade la columna «Requerido» a la vista para ver las obligatorias.');
    const sig = JSON.stringify([stats.counts, stats.rows, notes, collapsed]);
    if (legend.dataset.sig === sig) return;
    legend.dataset.sig = sig;
    legend.textContent = '';
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'ecija-cl-toggle';
    head.textContent = (collapsed ? '▸ ' : '▾ ') + 'Resaltado de columnas';
    head.title = collapsed ? 'Mostrar la leyenda' : 'Ocultar la leyenda';
    legend.appendChild(head);
    if (collapsed) return;
    for (const t of TAGS) {
      const lab = document.createElement('label');
      lab.className = 'ecija-cl-item';
      lab.dataset.tag = t.key;
      const cb = document.createElement('input');
      cb.type = 'checkbox'; cb.checked = visible[t.key] !== false; cb.dataset.k = t.key;
      const sw = document.createElement('span'); sw.className = 'ecija-cl-swatch';
      const tx = document.createElement('span'); tx.textContent = t.label;
      const n = document.createElement('span'); n.className = 'ecija-cl-n'; n.textContent = stats.counts[t.key];
      lab.append(cb, sw, tx, n);
      legend.appendChild(lab);
    }
    const foot = document.createElement('div');
    foot.className = 'ecija-cl-note';
    foot.textContent = [`Recuento de las ${stats.rows} filas cargadas (la lista carga más al desplazarte).`, ...notes].join(' ');
    legend.appendChild(foot);
  }

  function applyVisibility() {
    const root = document.documentElement;
    for (const t of TAGS) root.classList.toggle('ecija-hl-' + t.key, visible[t.key] !== false);
  }

  function clear() {
    document.querySelectorAll(`[${ATTR}]`).forEach(r => {
      r.removeAttribute(ATTR);
      if (r.hasAttribute('data-ecija-title')) { r.removeAttribute('title'); r.removeAttribute('data-ecija-title'); }
    });
    if (legend) { legend.remove(); legend = null; }
  }

  function tick() {
    if (!settings.enabled || settings.highlightColumns === false) return clear();
    const grids = findGrids();
    if (!grids.length) { if (legend) { legend.remove(); legend = null; } return; }
    const ctx = { publisherPrefix: N.resolveProject(projects, N.parseContext(location.href)).publisherPrefix, settings };
    const total = { counts: Object.fromEntries(TAGS.map(t => [t.key, 0])), rows: 0 };
    let hasRequired = false;
    for (const g of grids) {
      const s = classifyRows(g, ctx);
      for (const k in s.counts) total.counts[k] += s.counts[k];
      total.rows += s.rows;
      hasRequired = hasRequired || g.map.required != null;
    }
    applyVisibility();
    renderLegend(total, ctx, hasRequired);
  }

  setInterval(tick, 700);
  tick();
})();
