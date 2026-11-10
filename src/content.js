/*
 * ECIJA Dataverse Naming — content script para make.powerapps.com (interfaz moderna).
 *
 * - Panel "Nueva columna": nombre de esquema en snake_case + sufijo del tipo.
 *   Si es Búsqueda, además el nombre de la relación: [relacionada]_1N_[actual].
 * - Panel "Nueva opción" (opción global): sufijo _choice y "PREFIJO_" en el nombre
 *   para mostrar.
 * - Paneles de Relaciones (1:N, N:1, N:N): nombre de la relación y de la columna
 *   de búsqueda.
 * - Si el usuario escribe a mano en un campo gestionado, deja de tocarlo.
 * - Avisos de cumplimiento no bloqueantes bajo cada campo gestionado.
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
    lookupDisplay: [/^nombre para mostrar de (la )?(columna de )?busqueda\b/, /^lookup (column )?display name\b/],
    schema: [/^schema name\b/, /^nombre (de|del) esquema\b/, /^logical name\b/, /^nombre logico\b/],
    lookupSchema: [/^nombre (de|del) (la )?columna de busqueda\b/, /^lookup column (schema )?name\b/, /^nombre de esquema de (la )?(columna de )?busqueda\b/],
    choiceSchema: [/^name$/, /^nombre$/, /^schema name\b/, /^nombre (de|del) esquema\b/, /^logical name\b/, /^nombre logico\b/],
    dataType: [/^data type\b/, /^tipo de datos?\b/],
    advanced: [/^advanced options\b/, /^opciones avanzadas\b/, /^mas opciones\b/],
    relName: [/^nombre de (la )?relacion\b/, /^relationship (schema )?name\b/, /^nombre de esquema de (la )?relacion\b/],
    relatedTable: [/^tabla relacionada\b/, /^related table\b/],
    currentTable: [/^tabla actual\b/, /^current table\b/, /^tabla principal\b/, /^primary table\b/, /^esta tabla\b/]
  };
  const CHOICE_HEADING = /(new choice|nueva opcion|nueva eleccion|nuevo conjunto de opciones|global choice|opcion global|^choice$|^opcion$|^eleccion$)/;
  const NOT_CHOICE_HEADING = /(tabla|table|columna|column|editar|edit|relacion|relationship)/;
  const GENERIC_CRUMB = /^(tablas?|tables?|columnas?|columns?|relaciones|relationships?|claves|keys|formularios|forms|vistas|views|datos|data|soluciones|solutions?|objetos|objects|todos?|all|power apps|inicio|home|campos|fields|reglas de negocio|business rules|paneles|dashboards|graficos|charts|comandos|commands|mensajes|messages|informacion general|overview|propiedades|properties|configuracion|settings|herramientas|tools|esquema|schema|mas|more|\W*)$/;

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
  function findControls(container, regs, selector, directOnly) {
    const found = [];
    for (const el of container.querySelectorAll(selector)) {
      if (labelTexts(el).some(t => matches(t, regs))) found.push(el);
    }
    if (directOnly) return found;
    // Fallback: etiqueta visual seguida del control (estructura de Fluent UI).
    for (const lab of container.querySelectorAll('label, [class*="label" i]')) {
      if (!matches(norm(lab.textContent), regs)) continue;
      // Si la etiqueta apunta a un control existente (for=), solo ese.
      const target = lab.htmlFor ? document.getElementById(lab.htmlFor) : null;
      if (target) {
        if (target.matches(selector) && container.contains(target)) found.push(target);
        continue;
      }
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
    if (!el) return '';
    if (el.tagName === 'SELECT') return el.selectedOptions[0] ? el.selectedOptions[0].textContent : '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') return el.value || el.getAttribute('aria-valuetext') || '';
    return el.textContent || el.getAttribute('aria-valuetext') || el.value || el.title || '';
  }

  function headingTexts(c) {
    const texts = labelTexts(c);
    c.querySelectorAll('h1, h2, h3, [role="heading"], .ms-Panel-headerText, .fui-DrawerHeaderTitle, .fui-DialogTitle')
      .forEach(h => texts.push(norm(h.textContent)));
    return texts;
  }

  /** Desplegable de tipo de datos; evita botones de ayuda (ⓘ) junto a la etiqueta. */
  function findTypeControl(c) {
    const strict = findControls(c, LBL.dataType, TYPE_SEL, true).find(el => norm(readControlText(el)).length > 1);
    if (strict) return strict;
    return findControls(c, LBL.dataType, TYPE_SEL).find(el => {
      const t = norm(readControlText(el));
      const al = norm(el.getAttribute('aria-label'));
      return t.length > 1 && !/info|ayuda|help/.test(al + ' ' + t);
    }) || null;
  }

  function isChoicePanel(c) {
    return headingTexts(c).some(t => t && t.length < 60 && CHOICE_HEADING.test(t) && !NOT_CHOICE_HEADING.test(t));
  }

  /** Tipo de panel de relación: '1N-current' | '1N-related' | 'NN' | null */
  function relationshipKind(c) {
    const t = headingTexts(c).concat(norm(c.textContent).slice(0, 300)).join(' | ');
    if (/varios a varios|many-to-many|many to many|\bn:n\b/.test(t)) return 'NN';
    if (/uno a varios|one-to-many|one to many|\b1:n\b/.test(t)) return '1N-current';
    if (/varios a uno|many-to-one|many to one|\bn:1\b/.test(t)) return '1N-related';
    return null;
  }

  const clickedExpanders = new WeakSet();
  function expandAdvanced(c) {
    if (!settings.autoExpand) return;
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

  /** Prefijo del publicador mostrado junto al input (p. ej. "ecija_"). */
  function detectAdornment(input) {
    let p = input.parentElement;
    for (let i = 0; i < 3 && p; i++, p = p.parentElement) {
      for (const el of p.querySelectorAll('span, div, label')) {
        if (el.contains(input) || el.querySelector('input, textarea') || el.classList.contains('ecija-nb')) continue;
        const t = (el.textContent || '').trim();
        if (/^[a-z][a-z0-9]{1,7}_$/i.test(t)) return t.toLowerCase();
      }
    }
    return '';
  }

  /**
   * Asigna valor a un input controlado por React y notifica el cambio.
   * Si el portal mueve el foco como efecto secundario, lo devuelve donde estaba
   * el usuario (con el cursor en su sitio).
   */
  function setNativeValue(el, value) {
    const prev = document.activeElement;
    let selS = null, selE = null;
    try { selS = prev.selectionStart; selE = prev.selectionEnd; } catch (e) { /* noop */ }
    const restore = () => {
      if (!prev || prev === el || prev === document.body || !prev.isConnected) return;
      if (document.activeElement === prev) return;
      if (document.activeElement && document.activeElement !== el && document.activeElement !== document.body) return;
      try {
        prev.focus({ preventScroll: true });
        if (selS != null) prev.setSelectionRange(selS, selE);
      } catch (e) { /* noop */ }
    };
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    restore();
    setTimeout(restore, 0);
    setTimeout(restore, 60);
  }

  // ¿El usuario está filtrando en un desplegable con búsqueda (p. ej. tabla relacionada)?
  const COMBO_SEL = 'input[role="combobox"], [aria-autocomplete]';
  let lastComboInput = 0;
  function userBusyInCombo() {
    const ae = document.activeElement;
    if (!ae || !ae.matches || !ae.matches(COMBO_SEL)) return false;
    return ae.getAttribute('aria-expanded') === 'true' || Date.now() - lastComboInput < 1500;
  }

  // ---------- Caché de nombres lógicos (aprendidos del portal) ----------
  // entities: { idEntidadURL: nombreLogico }, names: { envId: { nombreMostrarNormalizado: nombreLogico } }
  let logicalCache = { entities: {}, names: {} };
  try {
    chrome.storage.local.get('logicalCache', r => {
      const c = r && r.logicalCache;
      if (c) logicalCache = { entities: c.entities || {}, names: c.names || {} };
    });
  } catch (e) { /* noop */ }
  let saveTimer = null;
  function saveLogicalCache() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { chrome.storage.local.set({ logicalCache }); } catch (e) { /* noop */ }
    }, 500);
  }
  const entityKey = () => { const m = location.pathname.match(/\/entities\/([^/?#]+)/i); return m ? m[1].toLowerCase() : null; };
  const envKey = () => N.parseContext(location.href).envId || '_';
  function rememberLogical({ display, logical, isCurrent }) {
    if (!logical) return;
    let changed = false;
    if (isCurrent && entityKey() && logicalCache.entities[entityKey()] !== logical) {
      logicalCache.entities[entityKey()] = logical; changed = true;
    }
    if (display) {
      const env = envKey();
      logicalCache.names[env] = logicalCache.names[env] || {};
      if (logicalCache.names[env][norm(display)] !== logical) { logicalCache.names[env][norm(display)] = logical; changed = true; }
    }
    if (changed) saveLogicalCache();
  }
  function knownLogical({ display, isCurrent }) {
    if (isCurrent && entityKey() && logicalCache.entities[entityKey()]) return logicalCache.entities[entityKey()];
    const names = logicalCache.names[envKey()] || {};
    return display ? names[norm(display)] || null : null;
  }
  /** Describe una tabla: { display, logical, source } */
  function tableInfo(display, source, isCurrent) {
    if (!display && !isCurrent) return null;
    const logical = knownLogical({ display, isCurrent });
    if (!display && !logical) return null;
    return { display: display || '', logical, source: source || '' };
  }

  const isLocked = el => el.disabled || el.readOnly ||
    el.getAttribute('aria-disabled') === 'true' || el.getAttribute('aria-readonly') === 'true';

  // ---------- Tabla actual (nombre para mostrar) ----------
  const tableNameCache = {};
  function currentTableName(c) {
    const ctl = findControl(c, LBL.currentTable, INPUT_SEL + ', ' + TYPE_SEL);
    const fromPanel = readControlText(ctl).trim();
    if (fromPanel) return { name: fromPanel, source: 'panel' };

    const key = entityKey();

    const clean = t => (t || '').replace(/[›»>/\\|]/g, ' ').replace(/\s+/g, ' ').trim();
    const outside = el => !el.closest(CONTAINER_SEL);
    const crumbs = Array.from(document.querySelectorAll(
      'nav[aria-label*="breadcrumb" i] li, nav[aria-label*="ruta" i] li, .fui-Breadcrumb li, .ms-Breadcrumb-listItem, [class*="breadcrumb" i] li'))
      .filter(outside).map(el => clean(el.textContent))
      .filter(t => t && t.length < 80 && !GENERIC_CRUMB.test(norm(t)));
    if (crumbs.length) {
      const name = crumbs[crumbs.length - 1];
      if (key) tableNameCache[key] = name;
      return { name, source: 'ruta de navegación' };
    }
    if (key && tableNameCache[key]) return { name: tableNameCache[key], source: 'ruta de navegación' };

    const h1 = Array.from(document.querySelectorAll('h1, [role="heading"][aria-level="1"]')).filter(outside)
      .map(el => clean(el.textContent)).find(t => t && t.length < 80 && !GENERIC_CRUMB.test(norm(t)));
    if (h1) return { name: h1, source: 'cabecera' };

    const part = document.title.split(/\s[-|–]\s/).map(clean)
      .find(t => t && !GENERIC_CRUMB.test(norm(t)) && !/power apps|microsoft/i.test(t));
    if (part) return { name: part, source: 'título de la página' };
    return null;
  }

  // ---------- Campos gestionados ----------
  const states = new Map(); // input -> { manual, expected, pub, badge }

  function dropState(input) {
    if (!input) return;
    const st = states.get(input);
    if (st && st.badge) st.badge.remove();
    states.delete(input);
  }

  /**
   * Rellena un campo con `expected` (salvo edición manual) y pinta su aviso.
   * evaluate(valueSinPrefijo) -> { level: 'ok'|'warn', msg, details: [] }
   */
  function manageField(input, { expected, evaluate, publisherPrefix, onForeignValue }) {
    if (!input) return;
    if (isLocked(input)) { dropState(input); return; }
    let st = states.get(input);
    if (!st) { st = { manual: false, lastSet: null }; states.set(input, st); }

    const adorn = detectAdornment(input);
    const pub = adorn || publisherPrefix || '';
    const includePub = !adorn && !!pub && input.value.toLowerCase().startsWith(pub);
    st.pub = pub;

    // Valor que no hemos puesto nosotros ni el usuario => lo ha generado el portal.
    if (onForeignValue && !st.manual && input.value && input.value !== st.lastSet) onForeignValue(input.value);

    st.expected = (typeof expected === 'function' ? expected(pub) : expected) || '';

    if (!st.manual && st.expected && !userBusyInCombo()) {
      const full = (includePub ? pub : '') + st.expected;
      if (input.value !== full) { setNativeValue(input, full); st.lastSet = full; }
    }
    let value = input.value || '';
    if (pub && value.toLowerCase().startsWith(pub)) value = value.slice(pub.length);
    renderBadge(input, st, value, evaluate(value));
  }

  function renderBadge(input, st, value, ev) {
    if (!settings.showBadges) { if (st.badge) { st.badge.remove(); st.badge = null; } return; }
    // Mientras el usuario filtra en un desplegable no se toca el DOM: cualquier cambio
    // de layout hace scroll en el panel y Fluent UI cierra el desplegable.
    if (userBusyInCombo()) return;
    if (!st.badge) {
      st.badge = document.createElement('div');
      st.badge.className = 'ecija-nb';
      st.badge.setAttribute('role', 'status');
    }
    // Solo se inserta si no está en su sitio (no se recoloca en cada pasada).
    const anchor = input.closest('.fui-Input, .ms-TextField-fieldGroup, [class*="fieldGroup"]') || input.parentElement;
    if (anchor && anchor.parentElement && (!st.badge.isConnected || st.badge.parentElement !== anchor.parentElement)) {
      anchor.after(st.badge);
    }

    const details = ['Valor: ' + ((st.pub || '') + value || '—')]
      .concat(st.expected ? ['Generado: ' + (st.pub || '') + st.expected] : [], ev.details || []);

    const sig = [ev.level, ev.msg, st.manual, st.expected, value].join('|');
    if (st.badge.dataset.sig === sig) return;
    st.badge.dataset.sig = sig;
    st.badge.dataset.level = ev.level;
    st.badge.title = details.join('\n');
    st.badge.textContent = '';

    const icon = document.createElement('span');
    icon.className = 'ecija-nb-icon';
    icon.textContent = ev.level === 'ok' ? '✔' : '⚠';
    const text = document.createElement('span');
    text.className = 'ecija-nb-text';
    text.textContent = ev.msg;
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
        btn.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          st.manual = false;
          schedule(0);
        });
        st.badge.append(btn);
      }
    }
  }

  function issuesResult(issues, okMsg, details) {
    return issues.length
      ? { level: 'warn', msg: issues[0] + (issues.length > 1 ? ` (+${issues.length - 1})` : ''), details: issues.concat(details) }
      : { level: 'ok', msg: okMsg, details };
  }

  // ---------- Columna / opción global (nombre de esquema) ----------
  function manageSchema(schema, display, type, rawType, proj, extraIssues) {
    const expected = type ? N.buildName({
      displayName: display.value, category: type.category, settings, extraPrefix: proj.extraPrefix
    }) : '';
    manageField(schema, {
      expected,
      publisherPrefix: proj.publisherPrefix,
      evaluate: value => {
        if (!type) {
          return { level: 'warn', msg: 'Tipo de datos no reconocido' + (rawType ? ` («${rawType.slice(0, 40)}»)` : '') + ': no se genera el nombre' };
        }
        const issues = N.validate(value, { category: type.category, settings, extraPrefix: proj.extraPrefix })
          .concat(extraIssues ? extraIssues() : []);
        const details = proj.extraPrefix ? [`Prefijo de proyecto: ${proj.extraPrefix}_ (${proj.source === 'solution' ? 'solución' : 'entorno'})`] : [];
        return issuesResult(issues, `Cumple estándar ECIJA · ${type.label} → ${N.suffixFor(type.category, settings)}`, details);
      }
    });
  }

  // ---------- Relación ----------
  /**
   * primary/secondary: () => { display, logical, source } | null
   * (funciones para que se evalúen después de aprender del valor del portal)
   */
  function manageRelationship(relInput, { primary, secondary, type, proj, onForeignValue }) {
    let P = null, S = null;
    const describe = t => !t ? 'no detectada'
      : (t.logical ? t.logical + ' (nombre lógico)' : `${t.display} (nombre para mostrar · ${t.source}; nombre lógico aún no conocido)`);
    manageField(relInput, {
      publisherPrefix: proj.publisherPrefix,
      onForeignValue,
      expected: pub => {
        P = primary(); S = secondary();
        if (!P || !S || !type) return '';
        const tp = N.relationshipToken({ logical: P.logical, display: P.display, pub, settings });
        const ts = N.relationshipToken({ logical: S.logical, display: S.display, pub, settings });
        return N.buildRelationshipName({ primary: tp, secondary: ts, type, pub });
      },
      evaluate: value => {
        const details = ['Tabla principal: ' + describe(P), 'Tabla secundaria: ' + describe(S)];
        if (!type) return { level: 'warn', msg: 'No se detecta el tipo de relación (1:N / N:N)', details };
        if (!P || !S) {
          const miss = !P && !S ? 'las tablas' : !P ? 'la tabla principal' : 'la tabla secundaria';
          return { level: 'warn', msg: `No se detecta ${miss}: no se genera el nombre de la relación`, details };
        }
        const name = t => t.logical || t.display;
        const issues = N.validateRelationship(value, { type });
        const partial = !P.logical || !S.logical;
        if (!issues.length && partial) {
          return { level: 'warn', msg: `Relación ${type}: ${name(P)} → ${name(S)} · falta el nombre lógico de ${!P.logical && !S.logical ? 'ambas tablas' : 'una tabla'} (se usa el nombre para mostrar)`, details };
        }
        return issuesResult(issues, `Cumple estándar · Relación ${type}: ${name(P)} → ${name(S)}`, details);
      }
    });
  }

  // ---------- Procesado de paneles ----------
  const prefixedDisplays = new WeakSet();

  function processColumnPanel(c, proj, display, dataType) {
    const rawType = readControlText(dataType).trim();
    const type = N.detectType(rawType);
    const relInput = findControl(c, LBL.relName, INPUT_SEL);
    const schema = findControls(c, LBL.schema, INPUT_SEL).find(el => el !== display && el !== relInput);
    if (!schema) { expandAdvanced(c); return; }
    if (isLocked(schema)) { dropState(schema); dropState(relInput); return; } // columna existente

    manageSchema(schema, display, type, rawType, proj);

    if (relInput && type && type.key === 'lookup') {
      const relatedCtl = findControl(c, LBL.relatedTable, INPUT_SEL + ', ' + TYPE_SEL);
      const relatedDisplay = readControlText(relatedCtl).trim();
      const cur = currentTableName(c);
      manageRelationship(relInput, {
        primary: () => tableInfo(relatedDisplay, 'tabla relacionada', false),
        secondary: () => tableInfo(cur && cur.name, cur && cur.source, true),
        type: '1N',
        proj,
        // El valor por defecto del portal contiene los nombres lógicos de ambas tablas.
        onForeignValue: value => {
          const pub = detectAdornment(relInput) || proj.publisherPrefix || '';
          let schemaPart = schema.value || '';
          if (pub && schemaPart.toLowerCase().startsWith(pub)) schemaPart = schemaPart.slice(pub.length);
          const found = N.parsePortalRelationshipDefault(value, { schemaPart, pub });
          if (found.current) rememberLogical({ display: cur && cur.name, logical: found.current, isCurrent: true });
          if (found.related && relatedDisplay) rememberLogical({ display: relatedDisplay, logical: found.related });
        }
      });
    }
  }

  function processChoicePanel(c, proj, display) {
    const schema = findControls(c, LBL.choiceSchema, INPUT_SEL).find(el => el !== display);
    if (!schema) { expandAdvanced(c); return; }
    if (isLocked(schema)) { dropState(schema); return; }

    // Nombre para mostrar con "PREFIJO_" (una sola vez por panel; si se borra, se respeta).
    const displayPrefix = proj.extraPrefix ? proj.extraPrefix.toUpperCase() + '_' : '';
    if (displayPrefix && !prefixedDisplays.has(display) && !isLocked(display)) {
      prefixedDisplays.add(display);
      if (!display.value.toUpperCase().startsWith(displayPrefix)) {
        const focused = document.activeElement === display;
        const pos = focused ? display.selectionStart : null;
        setNativeValue(display, displayPrefix + display.value);
        if (focused && pos != null) {
          const np = pos + displayPrefix.length;
          try { display.setSelectionRange(np, np); } catch (e) { /* noop */ }
        }
      }
    }
    manageSchema(schema, display, N.CHOICE_TYPE, '', proj, () =>
      displayPrefix && !(display.value || '').startsWith(displayPrefix)
        ? ['El nombre para mostrar no empieza por ' + displayPrefix] : []);
  }

  function processRelationshipPanel(c, proj, kind) {
    const relInput = findControl(c, LBL.relName, INPUT_SEL);
    if (!relInput) { expandAdvanced(c); return; }

    const relatedCtl = findControl(c, LBL.relatedTable, INPUT_SEL + ', ' + TYPE_SEL);
    const relatedName = readControlText(relatedCtl).trim();
    const cur = currentTableName(c);
    const related = () => tableInfo(relatedName, 'tabla relacionada', false);
    const current = () => tableInfo(cur && cur.name, cur && cur.source, true);

    const type = kind === 'NN' ? 'NN' : kind ? '1N' : null;
    const [primary, secondary] = kind === '1N-related' ? [related, current] : [current, related];
    manageRelationship(relInput, { primary, secondary, type, proj });

    // Columna de búsqueda que se crea con la relación 1:N / N:1.
    if (kind && kind !== 'NN') {
      const display = findControl(c, LBL.lookupDisplay, INPUT_SEL) ||
        findControls(c, LBL.display, INPUT_SEL).find(el => el !== relInput);
      const schema = display && (findControls(c, LBL.lookupSchema, INPUT_SEL)
        .concat(findControls(c, LBL.schema, INPUT_SEL))
        .find(el => el !== relInput && el !== display));
      if (display && schema) {
        manageSchema(schema, display, { key: 'lookup', label: 'Búsqueda', category: 'lookup' }, '', proj);
      }
    }
  }

  function processContainer(c, proj) {
    const display = findControl(c, LBL.display, INPUT_SEL);
    const dataType = findTypeControl(c);
    if (display && dataType) return processColumnPanel(c, proj, display, dataType);

    const hasRel = !!findControl(c, LBL.relName, INPUT_SEL);
    const kind = relationshipKind(c);
    if (hasRel || kind) return processRelationshipPanel(c, proj, kind);

    if (display && isChoicePanel(c)) return processChoicePanel(c, proj, display);
    // Tablas u otros paneles: no se toca.
  }

  // ---------- Bucle principal ----------
  function scan() {
    for (const [input] of states) if (!input.isConnected) dropState(input);
    if (!settings.enabled) {
      for (const [input] of states) dropState(input);
      return;
    }
    const proj = N.resolveProject(projects, N.parseContext(location.href));
    const containers = new Set();
    findControls(document.body, LBL.display, INPUT_SEL).forEach(el => containers.add(containerOf(el)));
    findControls(document.body, LBL.relName, INPUT_SEL).forEach(el => containers.add(containerOf(el)));
    document.querySelectorAll('[role="dialog"], [aria-modal="true"], .ms-Panel, .fui-OverlayDrawer')
      .forEach(d => { if (relationshipKind(d)) containers.add(d); });
    // Evita procesar a la vez un contenedor y otro anidado dentro.
    const list = Array.from(containers).filter(c => !Array.from(containers).some(o => o !== c && o.contains(c)));
    list.forEach(c => { try { processContainer(c, proj); } catch (e) { console.debug('[ECIJA naming]', e); } });
  }

  let timer = null;
  function schedule(ms) {
    clearTimeout(timer);
    timer = setTimeout(scan, ms == null ? 150 : ms);
  }

  // Escritura manual en un campo gestionado => no volver a tocarlo.
  document.addEventListener('input', e => {
    if (!e.isTrusted) return;
    if (e.target.matches && e.target.matches(COMBO_SEL)) lastComboInput = Date.now();
    const st = states.get(e.target);
    if (st) { st.manual = true; schedule(0); return; }
    schedule(150); // p. ej. nombre para mostrar o búsqueda de tabla relacionada
  }, true);
  document.addEventListener('click', e => { if (e.isTrusted) { schedule(200); setTimeout(scan, 700); } }, true);
  document.addEventListener('keyup', e => { if (e.isTrusted && (e.key === 'Enter' || e.key === ' ')) schedule(200); }, true);

  // Red de seguridad: el portal puede regenerar los nombres por su cuenta.
  setInterval(scan, 800);
})();
