/*
 * ECIJA Dataverse Naming — content script para make.powerapps.com (interfaz moderna).
 *
 * - Panel "Nueva columna": genera el nombre de esquema/lógico en snake_case con el
 *   sufijo del tipo de datos, a partir del nombre para mostrar.
 * - Panel "Nueva opción" (opción global): igual, con sufijo fijo _choice.
 * - Si el usuario escribe a mano en el nombre lógico, deja de tocarlo en ese panel.
 * - Muestra un aviso (no bloqueante) indicando si cumple el estándar.
 */
(() => {
  'use strict';
  if (window.__ecijaNamingLoaded) return;
  window.__ecijaNamingLoaded = true;

  const N = globalThis.EcijaNaming;
  let settings = N.mergeSettings({});
  let projects = {};

  // ---------- Configuración ----------
  function loadConfig() {
    try {
      chrome.storage.sync.get(['settings', 'projects'], r => {
        settings = N.mergeSettings(r && r.settings);
        projects = (r && r.projects) || {};
        schedule(0);
      });
    } catch (e) { /* contexto de la extensión invalidado tras recargarla */ }
  }
  try {
    chrome.storage.onChanged.addListener((ch, area) => {
      if (area === 'sync' && (ch.settings || ch.projects)) loadConfig();
    });
  } catch (e) { /* noop */ }
  loadConfig();

  // ---------- Etiquetas reconocidas (ES / EN, texto normalizado) ----------
  const LBL = {
    display: [/^display name\b/, /^nombre para mostrar\b/, /^nombre visible\b/, /^nombre a mostrar\b/],
    schema: [/^schema name\b/, /^nombre (de|del) esquema\b/, /^logical name\b/, /^nombre logico\b/],
    choiceSchema: [/^name$/, /^nombre$/, /^schema name\b/, /^nombre (de|del) esquema\b/, /^logical name\b/, /^nombre logico\b/],
    dataType: [/^data type\b/, /^tipo de datos?\b/],
    advanced: [/^advanced options\b/, /^opciones avanzadas\b/, /^mas opciones\b/]
  };
  const CHOICE_HEADING = /(new choice|nueva opcion|nueva eleccion|nuevo conjunto de opciones|global choice|opcion global|^choice$|^opcion$|^eleccion$)/;
  const NOT_CHOICE_HEADING = /(tabla|table|columna|column|editar|edit)/;

  const INPUT_SEL = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea';
  const TYPE_SEL = 'button, [role="combobox"], select, input[role="combobox"]';
  const CONTAINER_SEL = '[role="dialog"], [aria-modal="true"], .ms-Panel-main, .ms-Panel, .fui-DialogSurface, .fui-OverlayDrawer, .fui-InlineDrawer, aside';

  const norm = N.normalizeText;
  const matches = (text, regs) => !!text && text.length < 80 && regs.some(r => r.test(text));

  function labelTexts(el) {
    const out = [];
    const al = el.getAttribute('aria-label');
    if (al) out.push(al);
    const lb = el.getAttribute('aria-labelledby');
    if (lb) lb.split(/\s+/).forEach(id => { const n = document.getElementById(id); if (n) out.push(n.textContent); });
    if (el.labels) for (const l of el.labels) out.push(l.textContent);
    return out.map(norm);
  }

  /** Todos los controles (selector) asociados a una etiqueta que case con regs. */
  function findControls(container, regs, selector) {
    const found = [];
    for (const el of container.querySelectorAll(selector)) {
      if (labelTexts(el).some(t => matches(t, regs))) found.push(el);
    }
    // Fallback: etiqueta visual seguida del control (estructura de Fluent UI).
    for (const lab of container.querySelectorAll('label, [class*="label" i]')) {
      if (!matches(norm(lab.textContent), regs)) continue;
      let anc = lab;
      for (let i = 0; i < 4 && anc && anc !== container; i++) {
        anc = anc.parentElement;
        if (!anc) break;
        const next = Array.from(anc.querySelectorAll(selector)).find(c =>
          !lab.contains(c) && (lab.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING));
        if (next) { found.push(next); break; }
      }
    }
    return Array.from(new Set(found));
  }
  const findControl = (c, regs, sel) => findControls(c, regs, sel)[0] || null;

  function containerOf(el) {
    const c = el.closest(CONTAINER_SEL);
    if (c) return c;
    let a = el;
    for (let i = 0; i < 10 && a.parentElement && a.parentElement !== document.body; i++) a = a.parentElement;
    return a;
  }

  function readControlText(el) {
    if (el.tagName === 'SELECT') return el.selectedOptions[0] ? el.selectedOptions[0].textContent : '';
    if (el.tagName === 'INPUT') return el.value || el.getAttribute('aria-valuetext') || '';
    return el.textContent || el.getAttribute('aria-valuetext') || el.value || el.title || '';
  }

  /** Desplegable de tipo de datos; evita botones de ayuda (ⓘ) junto a la etiqueta. */
  function findTypeControl(c) {
    const strict = findControl(c, LBL.dataType, '[role="combobox"], select');
    if (strict) return strict;
    return findControls(c, LBL.dataType, TYPE_SEL).find(el => {
      const t = norm(readControlText(el));
      const al = norm(el.getAttribute('aria-label'));
      return t.length > 1 && !/info|ayuda|help/.test(al + ' ' + t);
    }) || null;
  }

  function isChoicePanel(c) {
    const texts = labelTexts(c);
    c.querySelectorAll('h1, h2, h3, [role="heading"], .ms-Panel-headerText, .fui-DrawerHeaderTitle, .fui-DialogTitle')
      .forEach(h => texts.push(norm(h.textContent)));
    return texts.some(t => t && t.length < 60 && CHOICE_HEADING.test(t) && !NOT_CHOICE_HEADING.test(t));
  }

  const clickedExpanders = new WeakSet();
  function expandAdvanced(c) {
    for (const b of c.querySelectorAll('button, [role="button"], [aria-expanded]')) {
      if (clickedExpanders.has(b)) continue;
      if (b.getAttribute('aria-expanded') !== 'false') continue;
      if (!matches(norm(b.textContent || b.getAttribute('aria-label')), LBL.advanced)) continue;
      clickedExpanders.add(b);
      b.click();
      schedule(250);
      return;
    }
  }

  /** Prefijo del publicador mostrado junto al input (p. ej. "cr4f3_"). */
  function detectAdornment(input) {
    let p = input.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      for (const el of p.querySelectorAll('span, div, label')) {
        if (el.contains(input) || el.querySelector('input, textarea')) continue;
        const t = (el.textContent || '').trim();
        if (/^[a-z][a-z0-9]{1,7}_$/i.test(t)) return t.toLowerCase();
      }
    }
    return '';
  }

  /** Asigna valor a un input controlado por React y notifica el cambio. */
  function setNativeValue(el, value) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const isLocked = el => el.disabled || el.readOnly ||
    el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true';

  // ---------- Estado por input de nombre lógico ----------
  const states = new Map(); // schemaInput -> { manual, display, type, mode, ... , badge }

  function processContainer(c, proj) {
    const display = findControl(c, LBL.display, INPUT_SEL);
    if (!display) return;

    const dataType = findTypeControl(c);
    let mode, type;
    if (dataType) { mode = 'column'; type = N.detectType(readControlText(dataType)); }
    else if (isChoicePanel(c)) { mode = 'choice'; type = N.CHOICE_TYPE; }
    else return; // tablas u otros paneles: no se toca

    const schema = findControl(c, mode === 'choice' ? LBL.choiceSchema : LBL.schema, INPUT_SEL);
    if (!schema || schema === display) {
      if (settings.autoExpand) expandAdvanced(c);
      return;
    }
    if (isLocked(schema)) { dropState(schema); return; } // edición de columna existente

    let st = states.get(schema);
    if (!st) { st = { manual: false, displayPrefixed: false }; states.set(schema, st); }

    // Opción global: el nombre para mostrar empieza por el prefijo de proyecto en
    // mayúsculas ("CRM_"). Se aplica una sola vez por panel; si el usuario lo borra,
    // se respeta.
    st.displayPrefix = mode === 'choice' && proj.extraPrefix ? proj.extraPrefix.toUpperCase() + '_' : '';
    if (st.displayPrefix && !st.displayPrefixed && !isLocked(display)) {
      st.displayPrefixed = true;
      if (!display.value.toUpperCase().startsWith(st.displayPrefix)) {
        const focused = document.activeElement === display;
        const pos = focused ? display.selectionStart : null;
        setNativeValue(display, st.displayPrefix + display.value);
        if (focused && pos != null) {
          const p = pos + st.displayPrefix.length;
          try { display.setSelectionRange(p, p); } catch (e) { /* noop */ }
        }
      }
    }
    Object.assign(st, { display, type, mode, rawType: dataType ? readControlText(dataType).trim() : '' });

    const adorn = detectAdornment(schema);
    const pub = adorn || proj.publisherPrefix || '';
    st.adorn = !!adorn;
    st.pub = pub;
    st.includePub = !adorn && !!pub && schema.value.toLowerCase().startsWith(pub);

    st.expected = type ? N.buildName({
      displayName: display.value, category: type.category, settings, extraPrefix: proj.extraPrefix
    }) : '';

    if (!st.manual && st.expected) {
      const full = st.includePub ? pub + st.expected : st.expected;
      if (schema.value !== full) setNativeValue(schema, full);
    }
    renderBadge(schema, st, proj);
  }

  function dropState(schema) {
    const st = states.get(schema);
    if (st && st.badge) st.badge.remove();
    states.delete(schema);
  }

  // ---------- Aviso visual (no bloqueante) ----------
  function renderBadge(schema, st, proj) {
    if (!settings.showBadges) { if (st.badge) { st.badge.remove(); st.badge = null; } return; }
    if (!st.badge) {
      st.badge = document.createElement('div');
      st.badge.className = 'ecija-nb';
      st.badge.setAttribute('role', 'status');
    }
    const anchor = schema.closest('.fui-Input, .ms-TextField-fieldGroup, [class*="fieldGroup"]') || schema.parentElement;
    if (anchor && (st.badge.previousElementSibling !== anchor || !st.badge.isConnected)) anchor.after(st.badge);

    let value = schema.value || '';
    if (st.pub && value.toLowerCase().startsWith(st.pub)) value = value.slice(st.pub.length);
    const fullName = (st.pub || '') + value;

    let level, msg;
    const details = [];
    if (!st.type) {
      level = 'warn';
      msg = 'Tipo de datos no reconocido' + (st.rawType ? ` («${st.rawType.slice(0, 40)}»)` : '') + ': no se genera el nombre';
    } else {
      const issues = N.validate(value, { category: st.type.category, settings, extraPrefix: proj.extraPrefix });
      if (st.displayPrefix && !(st.display.value || '').startsWith(st.displayPrefix)) {
        issues.push('El nombre para mostrar no empieza por ' + st.displayPrefix);
      }
      const suffix = N.suffixFor(st.type.category, settings);
      if (issues.length) {
        level = 'warn';
        msg = issues[0] + (issues.length > 1 ? ` (+${issues.length - 1})` : '');
        details.push(...issues);
      } else {
        level = 'ok';
        msg = `Cumple estándar ECIJA · ${st.type.label} → ${suffix}`;
      }
    }
    details.unshift('Nombre lógico: ' + (fullName || '—'));
    if (st.expected) details.push('Generado: ' + (st.pub || '') + st.expected);
    if (proj.extraPrefix) details.push(`Prefijo de proyecto: ${proj.extraPrefix}_ (${proj.source === 'solution' ? 'solución' : 'entorno'})`);

    if (st.displayPrefix) details.push('Nombre para mostrar: debe empezar por ' + st.displayPrefix);

    const sig = [level, msg, st.manual, st.expected, value].join('|');
    if (st.badge.dataset.sig === sig) return;
    st.badge.dataset.sig = sig;
    st.badge.dataset.level = level;
    st.badge.title = details.join('\n');
    st.badge.textContent = '';

    const icon = document.createElement('span');
    icon.className = 'ecija-nb-icon';
    icon.textContent = level === 'ok' ? '✔' : '⚠';
    const text = document.createElement('span');
    text.textContent = msg;
    st.badge.append(icon, text);

    if (st.manual) {
      const tag = document.createElement('span');
      tag.className = 'ecija-nb-tag';
      tag.textContent = 'editado a mano';
      st.badge.append(tag);
      if (st.expected && value !== st.expected) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'ecija-nb-btn';
        btn.textContent = 'Regenerar';
        btn.title = 'Volver a generar: ' + (st.pub || '') + st.expected;
        btn.addEventListener('click', ev => {
          ev.preventDefault();
          ev.stopPropagation();
          st.manual = false;
          schedule(0);
        });
        st.badge.append(btn);
      }
    }
  }

  // ---------- Bucle principal ----------
  function scan() {
    for (const [schema] of states) if (!schema.isConnected) dropState(schema);
    if (!settings.enabled) {
      for (const [schema] of states) dropState(schema);
      return;
    }
    const proj = N.resolveProject(projects, N.parseContext(location.href));
    const containers = new Set(findControls(document.body, LBL.display, INPUT_SEL).map(containerOf));
    containers.forEach(c => { try { processContainer(c, proj); } catch (e) { console.debug('[ECIJA naming]', e); } });
  }

  let timer = null;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(scan, ms == null ? 150 : ms);
  }

  // Escritura manual en el nombre lógico => no volver a tocarlo.
  document.addEventListener('input', e => {
    if (!e.isTrusted) return;
    const st = states.get(e.target);
    if (st) { st.manual = true; schedule(0); return; }
    schedule(150); // p. ej. el usuario escribe en "Nombre para mostrar"
  }, true);
  // Cambios en el desplegable de tipo de datos, expansión de paneles, etc.
  document.addEventListener('click', e => { if (e.isTrusted) { schedule(200); setTimeout(scan, 700); } }, true);
  document.addEventListener('keyup', e => { if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) schedule(200); }, true);

  // Red de seguridad: el portal puede regenerar el nombre por su cuenta.
  setInterval(scan, 800);
})();
