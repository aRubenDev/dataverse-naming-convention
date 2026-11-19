/*
 * ECIJA Dataverse Naming — lógica pura de nomenclatura (sin DOM).
 * Se usa desde el content script, el popup, las opciones y los tests (Node).
 */
(function (root) {
  'use strict';

  const DEFAULT_STOP_WORDS = [
    'de', 'del', 'la', 'las', 'el', 'los', 'lo', 'y', 'e', 'o', 'u', 'a', 'al',
    'en', 'con', 'por', 'para', 'un', 'una', 'unos', 'unas', 'su', 'sus', 'se',
    'the', 'of', 'and', 'or', 'to', 'for', 'in', 'on', 'an'
  ];

  // Sufijos por tipo de columna (claves = dataverse.columnNaming.suffixes del estándar ECIJA).
  const CATEGORIES = [
    { key: 'text',          label: 'Texto',                  covers: 'Una línea de texto, símbolo bursátil', suffix: '_txt' },
    { key: 'textarea',      label: 'Área de texto',          covers: 'Área de texto', suffix: '_textarea' },
    { key: 'multilineText', label: 'Varias líneas de texto', covers: 'Varias líneas de texto', suffix: '_multitxt' },
    { key: 'richText',      label: 'Texto enriquecido',      covers: 'Texto enriquecido', suffix: '_richtxt' },
    { key: 'email',         label: 'Correo electrónico',     covers: 'Correo electrónico', suffix: '_email' },
    { key: 'phone',         label: 'Teléfono',               covers: 'Teléfono', suffix: '_phone' },
    { key: 'url',           label: 'URL',                    covers: 'URL', suffix: '_url' },
    { key: 'integer',       label: 'Número entero',          covers: 'Número entero', suffix: '_int' },
    { key: 'decimal',       label: 'Decimal',                covers: 'Número decimal', suffix: '_dec' },
    { key: 'float',         label: 'Flotante',               covers: 'Número de punto flotante', suffix: '_float' },
    { key: 'currency',      label: 'Moneda',                 covers: 'Moneda', suffix: '_currency' },
    { key: 'duration',      label: 'Duración',               covers: 'Duración', suffix: '_duration' },
    { key: 'boolean',       label: 'Sí/No',                  covers: 'Sí/No', suffix: '_bool' },
    { key: 'choice',        label: 'Opción',                 covers: 'Opción (selección única)', suffix: '_choice' },
    { key: 'multichoice',   label: 'Opciones',               covers: 'Opciones (selección múltiple)', suffix: '_multichoice' },
    { key: 'lookup',        label: 'Búsqueda',               covers: 'Búsqueda, cliente', suffix: '_lookup' },
    { key: 'date',          label: 'Solo fecha',             covers: 'Solo fecha', suffix: '_date' },
    { key: 'datetime',      label: 'Fecha y hora',           covers: 'Fecha y hora', suffix: '_datetime' },
    { key: 'file',          label: 'Archivo',                covers: 'Archivo', suffix: '_file' },
    { key: 'image',         label: 'Imagen',                 covers: 'Imagen', suffix: '_image' },
    { key: 'language',      label: 'Idioma',                 covers: 'Idioma', suffix: '_language' },
    { key: 'timezone',      label: 'Zona horaria',           covers: 'Zona horaria', suffix: '_timezone' },
    { key: 'autonumber',    label: 'Autonumérico',           covers: 'Autonumérico', suffix: '_autonum' },
    { key: 'formula',       label: 'Fórmula',                covers: 'Fórmula (Power Fx)', suffix: '_formula' },
    { key: 'calculated',    label: 'Calculada',              covers: 'Comportamiento «Calculada» (sustituye al sufijo del tipo)', suffix: '_calc' },
    { key: 'rollup',        label: 'Acumulativa',            covers: 'Comportamiento «Acumulativa» (sustituye al sufijo del tipo)', suffix: '_rollup' },
    { key: 'optionset',     label: 'Opción global',          covers: 'Opción global (lleva además el prefijo de proyecto)', suffix: '_optionset' }
  ];

  // Detección del tipo de datos a partir del texto visible del desplegable.
  // El orden importa: lo más específico primero. [regex, clave interna, etiqueta, categoría de sufijo]
  const TYPE_PATTERNS = [
    [/texto enriquecido|rich ?text/, 'richtext', 'Texto enriquecido', 'richText'],
    [/varias lineas|multiple lines|multilinea|multi-?line/, 'multiline', 'Varias líneas de texto', 'multilineText'],
    [/area de texto|text ?area/, 'textarea', 'Área de texto', 'textarea'],
    [/correo|e-?mail/, 'email', 'Correo electrónico', 'email'],
    [/\burl\b/, 'url', 'URL', 'url'],
    [/telefono|phone/, 'phone', 'Teléfono', 'phone'],
    [/simbolo|ticker/, 'ticker', 'Símbolo bursátil', 'text'],
    [/autonum|auto ?number/, 'autonumber', 'Autonumérico', 'autonumber'],
    [/formula/, 'formula', 'Fórmula', 'formula'],
    [/moneda|divisa|currency/, 'currency', 'Moneda', 'currency'],
    [/duracion|duration/, 'duration', 'Duración', 'duration'],
    [/zona horaria|time ?zone/, 'timezone', 'Zona horaria', 'timezone'],
    [/idioma|language/, 'language', 'Idioma', 'language'],
    [/numero entero|whole number|\bentero\b/, 'wholenumber', 'Número entero', 'integer'],
    [/decimal/, 'decimal', 'Decimal', 'decimal'],
    [/flotante|float/, 'float', 'Flotante', 'float'],
    [/fecha y hora|date and time/, 'datetime', 'Fecha y hora', 'datetime'],
    [/solo fecha|date only/, 'dateonly', 'Solo fecha', 'date'],
    [/si\s*\/\s*no|yes\s*\/\s*no|dos opciones|two options|boolean/, 'boolean', 'Sí/No', 'boolean'],
    [/opciones|choices|elecciones|seleccion multiple|multi ?select/, 'choices', 'Opciones (múltiple)', 'multichoice'],
    [/opcion|choice|eleccion|option ?set|picklist/, 'choice', 'Opción', 'choice'],
    [/cliente|customer/, 'customer', 'Cliente', 'lookup'],
    [/busqueda|lookup/, 'lookup', 'Búsqueda', 'lookup'],
    [/imagen|\bimage\b/, 'image', 'Imagen', 'image'],
    [/archivo|\bfile\b/, 'file', 'Archivo', 'file'],
    [/numero|number/, 'wholenumber', 'Número', 'integer'],
    [/fecha|\bdate\b/, 'dateonly', 'Fecha', 'date'],
    [/texto|\btext\b|una linea|single line/, 'text', 'Texto', 'text']
  ];

  /** Comportamiento de la columna (Simple / Calculada / Acumulativa) → categoría que sustituye al tipo. */
  function detectBehavior(text) {
    const t = normalizeText(text);
    if (/calculad|calculated/.test(t)) return 'calculated';
    if (/acumulad|acumulativ|rollup|roll-up|resumen/.test(t)) return 'rollup';
    return null;
  }

  // Columnas de estado propias prohibidas: usar Estado / Razón para el estado nativos.
  const DEFAULT_FORBIDDEN_COLUMNS = ['estado_choice', 'estadoactual_choice', 'activo_bool', 'estadoregistro_txt'];

  // Columna principal de tabla y nombre de solución (dataverse.primaryColumn / dataverse.solution).
  const DEFAULT_PRIMARY_PATTERN = '^ID[A-Z][A-Za-z0-9]+$';
  const DEFAULT_SOLUTION_PATTERN = '^BASE_[A-Za-z0-9]+$';

  // Versión del esquema de configuración guardada (2 = sufijos del estándar de validaciones 1.0).
  const SETTINGS_VERSION = 2;

  const CHOICE_TYPE = { key: 'globalchoice', label: 'Opción global', category: 'optionset' };

  function stripAccents(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  /** Minúsculas, sin tildes, espacios colapsados, sin asteriscos de "obligatorio". */
  function normalizeText(s) {
    return stripAccents(s).toLowerCase().replace(/\*/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function detectType(text) {
    const t = normalizeText(text);
    if (!t) return null;
    for (const [re, key, label, category] of TYPE_PATTERNS) {
      if (re.test(t)) return { key, label, category };
    }
    return null;
  }

  /** "Fecha de Alta del Cliente" -> "fecha_alta_cliente" */
  function toSnake(text, stopWords) {
    const words = stripAccents(text).toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!stopWords || !stopWords.length) return words.join('_');
    const stop = new Set(stopWords.map(w => normalizeText(w)));
    const kept = words.filter(w => !stop.has(w));
    return (kept.length ? kept : words).join('_');
  }

  function cleanSuffix(s) {
    const body = toSnake(s, []);
    return body ? '_' + body : '';
  }

  function cleanPrefix(s) {
    return toSnake(s, []);
  }

  function suffixFor(category, settings) {
    const s = settings && settings.suffixes && settings.suffixes[category];
    return cleanSuffix(s != null ? s : (CATEGORIES.find(c => c.key === category) || {}).suffix);
  }

  /**
   * Construye la parte editable del nombre lógico (sin el prefijo del publicador).
   * prefijoProyecto + nombre_en_snake + sufijo
   */
  function buildName({ displayName, category, settings, extraPrefix }) {
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    const core = toSnake(displayName, stop);
    if (!core) return '';
    const suffix = suffixFor(category, settings);
    const sb = suffix.slice(1);
    let body = core;
    // Evita "estado_optionset_optionset" si el nombre ya trae el sufijo.
    if (sb && body !== sb && body.endsWith('_' + sb)) body = body.slice(0, -(sb.length + 1));
    const pre = cleanPrefix(extraPrefix);
    if (pre && body !== pre && !body.startsWith(pre + '_')) body = pre + '_' + body;
    return body + suffix;
  }

  /** "Punto de orden del día" -> "PuntoOrdenDia" (sin tildes ni palabras vacías). */
  function toPascal(text, stopWords) {
    return toSnake(text, stopWords).split('_').filter(Boolean)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }

  /** Prefijo literal al inicio de un patrón: '^ID[A-Z]…' -> 'ID', '^BASE_[…' -> 'BASE_'. */
  function patternLead(pattern) {
    const m = String(pattern || '').match(/^\^([A-Za-z0-9_]+)/);
    return m ? m[1] : '';
  }

  function safeRegExp(pattern, fallback) {
    try { return new RegExp(pattern || fallback); } catch (e) { return new RegExp(fallback); }
  }

  /** Quita el prefijo de proyecto si el nombre para mostrar empieza por él ("GS Sociedad", "GS_Sociedad"). */
  function withoutProjectWord(text, extraPrefix) {
    const pre = cleanPrefix(extraPrefix);
    const snake = toSnake(text, []);
    return pre && snake.startsWith(pre + '_') ? snake.slice(pre.length + 1) : text;
  }

  /**
   * Nombre de esquema de la columna principal (sin el prefijo del publicador):
   * tabla "Sociedad" -> IDSociedad (nombre lógico: idsociedad).
   */
  function buildPrimaryColumnName({ tableDisplay, settings, extraPrefix }) {
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    const core = toPascal(withoutProjectWord(tableDisplay || '', extraPrefix), stop);
    if (!core) return '';
    return patternLead((settings && settings.primaryColumnPattern) || DEFAULT_PRIMARY_PATTERN) + core;
  }

  function validatePrimaryColumn(value, settings) {
    const v = String(value || '');
    if (!v) return ['El nombre de esquema está vacío'];
    const pattern = (settings && settings.primaryColumnPattern) || DEFAULT_PRIMARY_PATTERN;
    return safeRegExp(pattern, DEFAULT_PRIMARY_PATTERN).test(v)
      ? [] : [`No sigue el patrón de columna principal ${patternLead(pattern)}NombreTabla`];
  }

  /**
   * Nombre de esquema de una tabla (sin el prefijo del publicador): prefijo de proyecto
   * en minúsculas + nombre en PascalCase. "Punto orden del día" → gs_PuntoOrdenDia.
   */
  function buildTableName({ displayName, settings, extraPrefix }) {
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    const core = toPascal(withoutProjectWord(displayName || '', extraPrefix), stop);
    if (!core) return '';
    const pre = cleanPrefix(extraPrefix);
    return (pre ? pre + '_' : '') + core;
  }

  function validateTableName(value, { extraPrefix }) {
    const v = String(value || '');
    if (!v) return ['El nombre de esquema está vacío'];
    const issues = [];
    const pre = cleanPrefix(extraPrefix);
    let core = v;
    if (pre) {
      if (v.startsWith(pre + '_')) core = v.slice(pre.length + 1);
      else issues.push('No empieza por el prefijo de proyecto ' + pre + '_');
    }
    if (!/^[A-Z][A-Za-z0-9]*$/.test(core)) issues.push('El nombre no está en PascalCase (sin espacios, tildes ni guiones bajos)');
    return issues;
  }

  /** Nombre (único) de la solución: "Gestión societaria" -> BASE_GestionSocietaria. */
  function buildSolutionName({ displayName, settings }) {
    const lead = patternLead((settings && settings.solutionPattern) || DEFAULT_SOLUTION_PATTERN);
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    let words = toSnake(displayName || '', []);
    const l = lead.replace(/_$/, '').toLowerCase();
    if (l && (words === l || words.startsWith(l + '_'))) words = words.slice(l.length + 1);
    const core = toPascal(words.replace(/_/g, ' '), stop);
    return core ? lead + core : '';
  }

  function validateSolutionName(value, settings) {
    const v = String(value || '');
    if (!v) return ['El nombre de la solución está vacío'];
    const pattern = (settings && settings.solutionPattern) || DEFAULT_SOLUTION_PATTERN;
    return safeRegExp(pattern, DEFAULT_SOLUTION_PATTERN).test(v)
      ? [] : [`No sigue el patrón de solución ${patternLead(pattern)}Nombre`];
  }

  /** Devuelve la lista de incumplimientos (vacía = cumple). Nunca bloquea nada. */
  function validate(value, { category, settings, extraPrefix }) {
    const issues = [];
    const v = String(value || '');
    if (!v) return ['El nombre lógico está vacío'];
    if (!/^[a-z0-9]+(_[a-z0-9]+)*$/.test(v)) issues.push('No está en snake_case (minúsculas, sin tildes, espacios ni "__")');
    if (category) {
      const suffix = suffixFor(category, settings);
      if (suffix && !v.endsWith(suffix)) issues.push('No termina en ' + suffix);
    }
    const pre = cleanPrefix(extraPrefix);
    if (pre && !v.startsWith(pre + '_')) issues.push('No empieza por el prefijo de proyecto ' + pre + '_');
    const forbidden = (settings && settings.forbiddenColumns) || DEFAULT_FORBIDDEN_COLUMNS;
    if (forbidden.includes(v)) issues.push('Columna de estado propia no permitida: usa Estado y Razón para el estado nativos');
    return issues;
  }

  /**
   * Parte de una tabla dentro del nombre de relación, en PascalCase y sin prefijos:
   * - con nombre para mostrar: "Punto orden día" / "GS_Sociedad" → PuntoOrdenDia / Sociedad
   * - sin él, del nombre lógico: ecija_gs_auditor → Auditor
   */
  function relationshipToken({ logical, display, pub, settings, extraPrefix }) {
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    if (display) {
      const t = toPascal(withoutProjectWord(display, extraPrefix), stop);
      if (t) return t;
    }
    if (logical) {
      let l = String(logical).toLowerCase();
      if (pub && l.startsWith(pub)) l = l.slice(pub.length);
      const pre = cleanPrefix(extraPrefix);
      if (pre && l.startsWith(pre + '_')) l = l.slice(pre.length + 1);
      return toPascal(l.replace(/_/g, ' '), []);
    }
    return '';
  }

  /**
   * Nombre de relación (sin el prefijo del publicador, que el portal muestra aparte):
   * {TablaPrincipal}_{1N|NN}_{TablaSecundaria}[_{Calificador}]  →  Auditor_1N_Sociedad_AuditorPrincipal
   */
  function buildRelationshipName({ primary, secondary, type, qualifier }) {
    if (!primary || !secondary || !type) return '';
    const q = qualifier ? toPascal(String(qualifier).replace(/_/g, ' '), []) : '';
    return primary + '_' + type + '_' + secondary + (q ? '_' + q : '');
  }

  /**
   * Calificador para distinguir varias lookups a la misma tabla: el nombre de la
   * lookup en snake_case, solo si no coincide con el de la tabla relacionada.
   *   "Auditor"           → gs_auditor  → ''
   *   "Auditor principal" → gs_auditor  → 'auditor_principal'
   */
  function lookupQualifier({ lookupDisplay, related, pub, extraPrefix, settings }) {
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    let q = toSnake(lookupDisplay || '', stop);
    const xp = cleanPrefix(extraPrefix || '');
    if (xp && q.startsWith(xp + '_')) q = q.slice(xp.length + 1);
    if (!q) return '';
    // Comparación tolerante a plurales: "Puntos orden día" ≈ "Punto orden día" / gs_puntoordendia
    const sing = w => w.length > 4 && /[^aeiou]es$/.test(w) ? w.slice(0, -2) : w.length > 3 && /s$/.test(w) ? w.slice(0, -1) : w;
    const key = snake => String(snake || '').split('_').filter(Boolean).map(sing).join('');
    const same = new Set();
    if (related && related.display) same.add(key(toSnake(related.display, stop)));
    if (related && related.logical) {
      let l = String(related.logical).toLowerCase();
      if (pub && l.startsWith(pub)) l = l.slice(pub.length);
      const add = x => { same.add(key(x)); same.add(sing(x.replace(/_/g, ''))); };
      add(l);
      const i = l.indexOf('_');
      if (i > 0) add(l.slice(i + 1)); // sin prefijo de proyecto (gs_auditor → auditor)
    }
    return same.has(key(q)) ? '' : q;
  }

  /** Límite de Dataverse para el nombre de esquema de una relación (incluye el prefijo). */
  const RELATIONSHIP_MAX = 100;

  /**
   * Extrae los nombres lógicos del valor por defecto que genera el portal para la
   * relación de un lookup: {actual}_{esquemaColumna}_{pub}{relacionada}
   * p. ej. gs_acta_puntos_orden_dia_lookup_ecija_gs_puntoordendia
   */
  function parsePortalRelationshipDefault(value, { schemaPart, pub }) {
    const v = String(value || '').toLowerCase();
    const s = String(schemaPart || '').toLowerCase();
    const out = {};
    if (!v || /_(1n|nn)_/.test(v)) return out; // ya es un nombre nuestro
    if (s) {
      const i = v.indexOf('_' + s + '_');
      if (i > 0) { out.current = v.slice(0, i); out.related = v.slice(i + s.length + 2); }
    }
    if (!out.related && pub) {
      const j = v.lastIndexOf('_' + pub);
      if (j >= 0) out.related = v.slice(j + 1);
    }
    if (out.related && pub && out.related.startsWith(pub)) out.related = out.related.slice(pub.length);
    const valid = x => /^[a-z][a-z0-9_]*[a-z0-9]$/.test(x || '');
    if (!valid(out.current)) delete out.current;
    if (!valid(out.related)) delete out.related;
    return out;
  }

  function validateRelationship(value, { type, pub }) {
    const v = String(value || '');
    if (!v) return ['El nombre de la relación está vacío'];
    const issues = [];
    if (!/^[A-Z][A-Za-z0-9]*_(1N|NN)_[A-Z][A-Za-z0-9]*(_[A-Z][A-Za-z0-9]*)?$/.test(v)) {
      issues.push('No sigue el patrón TablaRelacionada_' + (type || '1N') + '_TablaActual (PascalCase)');
    } else if (type && !v.includes('_' + type + '_')) {
      issues.push('El tipo de relación debe ser ' + type);
    }
    const total = v.length + String(pub || '').length;
    if (total > RELATIONSHIP_MAX) issues.push(`Supera el límite de ${RELATIONSHIP_MAX} caracteres de Dataverse (${total})`);
    return issues;
  }

  function defaultSettings() {
    const suffixes = {};
    CATEGORIES.forEach(c => { suffixes[c.key] = c.suffix; });
    return {
      enabled: true,
      autoExpand: true,
      showBadges: true,
      saveAndNew: true,
      version: SETTINGS_VERSION,
      suffixes,
      stopWords: DEFAULT_STOP_WORDS.slice(),
      forbiddenColumns: DEFAULT_FORBIDDEN_COLUMNS.slice(),
      primaryColumnPattern: DEFAULT_PRIMARY_PATTERN,
      solutionPattern: DEFAULT_SOLUTION_PATTERN
    };
  }

  function mergeSettings(stored) {
    const d = defaultSettings();
    const s = stored && typeof stored === 'object' ? stored : {};
    const out = Object.assign({}, d, s);
    // Configuración anterior a la v2 (sufijos agrupados: _num, _fx…): se descartan sus sufijos.
    const current = (s.version || 1) >= SETTINGS_VERSION;
    out.suffixes = Object.assign({}, d.suffixes, current ? s.suffixes || {} : {});
    out.version = SETTINGS_VERSION;
    out.stopWords = Array.isArray(s.stopWords) ? s.stopWords : d.stopWords;
    out.forbiddenColumns = Array.isArray(s.forbiddenColumns) ? s.forbiddenColumns : d.forbiddenColumns;
    return out;
  }

  /**
   * Convierte el JSON de validaciones ECIJA ({ dataverse: { columnNaming: { suffixes } … } })
   * en ajustes de la extensión. Devuelve null si no tiene ese formato.
   */
  function settingsFromStandard(std, base) {
    const dv = std && std.dataverse;
    if (!dv || typeof dv !== 'object') return null;
    const out = mergeSettings(base);
    const sx = dv.columnNaming && dv.columnNaming.suffixes;
    if (sx && typeof sx === 'object') {
      CATEGORIES.forEach(c => { if (typeof sx[c.key] === 'string' && cleanSuffix(sx[c.key])) out.suffixes[c.key] = cleanSuffix(sx[c.key]); });
    }
    const gp = dv.globalOptionSetNaming && dv.globalOptionSetNaming.pattern;
    const m = typeof gp === 'string' && gp.match(/>_?([a-z0-9]+)\s*$/i);
    if (m) out.suffixes.optionset = '_' + m[1].toLowerCase();
    const fc = dv.entityStateManagement && dv.entityStateManagement.forbiddenColumns;
    if (Array.isArray(fc)) out.forbiddenColumns = fc.map(x => String(x).toLowerCase().trim()).filter(Boolean);
    const valid = x => { try { new RegExp(x); return typeof x === 'string' && !!x; } catch (e) { return false; } };
    const pc = dv.primaryColumn && dv.primaryColumn.schemaPattern;
    if (valid(pc)) out.primaryColumnPattern = pc;
    const sp = dv.solution && dv.solution.pattern;
    if (valid(sp)) out.solutionPattern = sp;
    return out;
  }

  /** Extrae entorno y solución de una URL de make.powerapps.com */
  function parseContext(url) {
    const u = String(url || '');
    const env = u.match(/\/environments\/([^/?#]+)/i);
    const sol = u.match(/\/solutions\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    return {
      envId: env ? decodeURIComponent(env[1]).toLowerCase() : null,
      solutionId: sol ? sol[1].toLowerCase() : null
    };
  }

  function resolveProject(projects, ctx) {
    const env = (projects && ctx && ctx.envId && projects[ctx.envId]) || null;
    const sol = env && ctx.solutionId && env.solutions ? env.solutions[ctx.solutionId] : null;
    const useSol = sol && typeof sol.extraPrefix === 'string';
    return {
      name: env ? env.name || '' : '',
      extraPrefix: cleanPrefix(useSol ? sol.extraPrefix : (env ? env.extraPrefix : '')),
      publisherPrefix: env && env.publisherPrefix ? cleanPrefix(env.publisherPrefix) + '_' : '',
      source: useSol ? 'solution' : (env ? 'environment' : null)
    };
  }

  const api = {
    DEFAULT_STOP_WORDS, DEFAULT_FORBIDDEN_COLUMNS, CATEGORIES, CHOICE_TYPE,
    stripAccents, normalizeText, detectType, detectBehavior, toSnake, cleanSuffix, cleanPrefix,
    suffixFor, buildName, validate, toPascal, patternLead,
    buildPrimaryColumnName, validatePrimaryColumn, buildTableName, validateTableName, buildSolutionName, validateSolutionName, relationshipToken, buildRelationshipName, lookupQualifier, RELATIONSHIP_MAX,
    parsePortalRelationshipDefault, validateRelationship,
    defaultSettings, mergeSettings, settingsFromStandard,
    parseContext, resolveProject
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EcijaNaming = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
