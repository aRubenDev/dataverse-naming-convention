/*
 * Script de diagnóstico — ECIJA Dataverse Naming
 *
 * Uso:
 *   1. En make.powerapps.com abre el panel que quieras analizar (p. ej. nueva
 *      columna de tipo Búsqueda con tabla relacionada elegida y "Opciones
 *      avanzadas" desplegado). Déjalo abierto.
 *   2. Pulsa F12 → pestaña "Console".
 *   3. Pega este script completo y pulsa Enter (si Brave/Chrome lo pide,
 *      escribe antes "allow pasting").
 *   4. El resultado se copia al portapapeles: pégalo en la conversación.
 *
 * Solo recoge la estructura del panel abierto (etiquetas, campos y sus valores,
 * desplegables). No lee datos de registros. Los GUID de la URL se ocultan.
 */
(() => {
  const n = s => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const panels = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],.ms-Panel,.fui-OverlayDrawer,.fui-InlineDrawer,aside')];
  const p = panels.find(x => /tipo de datos|data type|nombre para mostrar|display name|relacion|relationship/.test(n(x.textContent))) || panels.at(-1);
  if (!p) return console.log('NO SE ENCUENTRA EL PANEL');
  const lt = el => [
    el.getAttribute('aria-label'),
    ...(el.getAttribute('aria-labelledby') || '').split(' ').map(i => document.getElementById(i)?.textContent),
    ...[...(el.labels || [])].map(l => l.textContent)
  ].filter(Boolean).map(n).join(' | ');
  const out = {
    url: location.pathname.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<id>'),
    ecijaBadge: !!document.querySelector('.ecija-nb'),
    title: document.title,
    breadcrumb: [...document.querySelectorAll('nav[aria-label*="breadcrumb" i] li, nav[aria-label*="ruta" i] li, .fui-Breadcrumb li, .ms-Breadcrumb-listItem, [class*="breadcrumb" i] li')]
      .filter(el => !el.closest('[role="dialog"]')).map(el => el.textContent.trim()).slice(0, 10),
    pageHeadings: [...document.querySelectorAll('h1, [role="heading"][aria-level="1"]')]
      .filter(el => !el.closest('[role="dialog"]')).map(el => el.textContent.trim().slice(0, 60)).slice(0, 5),
    panel: { tag: p.tagName, role: p.getAttribute('role'), cls: String(p.className).slice(0, 120) },
    headings: [...p.querySelectorAll('h1,h2,h3,[role=heading]')].map(h => n(h.textContent)).slice(0, 5),
    labels: [...p.querySelectorAll('label')].map(l => ({ t: n(l.textContent).slice(0, 60), for: l.htmlFor })).slice(0, 40),
    inputs: [...p.querySelectorAll('input,textarea')].map(i => ({
      type: i.type, id: i.id, label: lt(i).slice(0, 80), value: i.value.slice(0, 100),
      locked: i.disabled || i.readOnly,
      around: n(i.parentElement?.parentElement?.textContent).slice(0, 80)
    })),
    combos: [...p.querySelectorAll('[role=combobox],select,button[aria-haspopup]')].map(c => ({
      tag: c.tagName, label: lt(c).slice(0, 80), text: n(c.textContent || c.value).slice(0, 80)
    })),
    expanders: [...p.querySelectorAll('[aria-expanded]')].map(b => ({ text: n(b.textContent).slice(0, 50), exp: b.getAttribute('aria-expanded') }))
  };
  copy(JSON.stringify(out, null, 1));
  console.log(out);
  console.log('✔ Copiado al portapapeles');
})();
