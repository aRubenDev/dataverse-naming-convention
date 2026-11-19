/*
 * Diagnóstico de la lista de columnas — ECIJA Dataverse Naming
 *
 * Uso: abre Tablas → <tabla> → Columnas en make.powerapps.com, pulsa F12 → Console,
 * pega este script y pulsa Enter. El resultado se copia al portapapeles.
 * Recoge las cabeceras de las cuadrículas y el texto de las 5 primeras filas
 * (nombres de columnas, no datos de registros).
 */
(() => {
  const n = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const grids = [...document.querySelectorAll('[role="grid"],[role="treegrid"],table')].filter(g => !g.closest('[role="dialog"]'));
  const out = {
    url: location.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>'),
    resaltadoActivo: !!document.querySelector('[data-ecija-col]'),
    grids: grids.map(g => ({
      tag: g.tagName, role: g.getAttribute('role'), cls: String(g.className).slice(0, 80),
      headers: [...g.querySelectorAll('[role="columnheader"],th')].map(h => ({ t: n(h.innerText || h.textContent).slice(0, 40), col: h.getAttribute('aria-colindex') })),
      rows: [...g.querySelectorAll('[role="row"],tr')].filter(r => !r.querySelector('[role="columnheader"],th')).slice(0, 5).map(r => ({
        marca: r.getAttribute('data-ecija-col'),
        cells: [...r.querySelectorAll('[role="gridcell"],[role="rowheader"],td')].map(c => ({ t: n(c.innerText || c.textContent).slice(0, 40), col: c.getAttribute('aria-colindex'), role: c.getAttribute('role') }))
      }))
    }))
  };
  copy(JSON.stringify(out, null, 1));
  console.log(out);
  console.log('✔ Copiado al portapapeles');
})();
