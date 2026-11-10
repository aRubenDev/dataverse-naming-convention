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

  // Categorías de sufijo (las del estándar + fórmula). "choice" es fijo.
  const CATEGORIES = [
    { key: 'text',     label: 'Texto',           covers: 'Texto, área de texto, email, teléfono, símbolo bursátil, autonumérico', suffix: '_txt' },
    { key: 'richtext', label: 'Texto enriquecido', covers: 'Texto enriquecido', suffix: '_richtxt' },
    { key: 'url',      label: 'URL',             covers: 'URL', suffix: '_url' },
    { key: 'number',   label: 'Número',          covers: 'Número entero, decimal, flotante, moneda, duración, zona horaria, idioma', suffix: '_num' },
    { key: 'date',     label: 'Fecha',           covers: 'Solo fecha, fecha y hora', suffix: '_date' },
    { key: 'boolean',  label: 'Sí/No',           covers: 'Sí/No', suffix: '_bool' },
    { key: 'choice',   label: 'Choice',          covers: 'Choice, Choices (selección múltiple), opción global', suffix: '_choice', locked: true },
    { key: 'lookup',   label: 'Búsqueda',        covers: 'Búsqueda, cliente', suffix: '_lookup' },
    { key: 'file',     label: 'Archivo',         covers: 'Archivo, imagen', suffix: '_file' },
    { key: 'formula',  label: 'Fórmula',         covers: 'Fórmula (Power Fx)', suffix: '_fx' }
  ];

  // Detección del tipo de datos a partir del texto visible del desplegable.
  // El orden importa: lo más específico primero.
  const TYPE_PATTERNS = [
    [/texto enriquecido|rich ?text/, 'richtext', 'Texto enriquecido', 'richtext'],
    [/area de texto|text ?area|varias lineas|multiple lines/, 'textarea', 'Área de texto', 'text'],
    [/correo|e-?mail/, 'email', 'Correo electrónico', 'text'],
    [/\burl\b/, 'url', 'URL', 'url'],
    [/telefono|phone/, 'phone', 'Teléfono', 'text'],
    [/simbolo|ticker/, 'ticker', 'Símbolo bursátil', 'text'],
    [/autonum|auto ?number/, 'autonumber', 'Autonumérico', 'text'],
    [/formula/, 'formula', 'Fórmula', 'formula'],
    [/moneda|divisa|currency/, 'currency', 'Moneda', 'number'],
    [/duracion|duration/, 'duration', 'Duración', 'number'],
    [/zona horaria|time ?zone/, 'timezone', 'Zona horaria', 'number'],
    [/idioma|language/, 'language', 'Idioma', 'number'],
    [/numero entero|whole number|\bentero\b/, 'wholenumber', 'Número entero', 'number'],
    [/decimal/, 'decimal', 'Decimal', 'number'],
    [/flotante|float/, 'float', 'Flotante', 'number'],
    [/fecha y hora|date and time/, 'datetime', 'Fecha y hora', 'date'],
    [/solo fecha|date only/, 'dateonly', 'Solo fecha', 'date'],
    [/si\s*\/\s*no|yes\s*\/\s*no|dos opciones|two options|boolean/, 'boolean', 'Sí/No', 'boolean'],
    [/opciones|choices|elecciones|seleccion multiple|multi ?select/, 'choices', 'Choices (múltiple)', 'choice'],
    [/opcion|choice|eleccion|option ?set|picklist/, 'choice', 'Choice', 'choice'],
    [/cliente|customer/, 'customer', 'Cliente', 'lookup'],
    [/busqueda|lookup/, 'lookup', 'Búsqueda', 'lookup'],
    [/imagen|\bimage\b/, 'image', 'Imagen', 'file'],
    [/archivo|\bfile\b/, 'file', 'Archivo', 'file'],
    [/numero|number/, 'wholenumber', 'Número', 'number'],
    [/fecha|\bdate\b/, 'dateonly', 'Fecha', 'date'],
    [/texto|\btext\b|una linea|single line/, 'text', 'Texto', 'text']
  ];

  const CHOICE_TYPE = { key: 'globalchoice', label: 'Opción global', category: 'choice' };

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
    if (category === 'choice') return '_choice';
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
    // Evita "estado_choice_choice" si el nombre ya trae el sufijo.
    if (sb && body !== sb && body.endsWith('_' + sb)) body = body.slice(0, -(sb.length + 1));
    const pre = cleanPrefix(extraPrefix);
    if (pre && body !== pre && !body.startsWith(pre + '_')) body = pre + '_' + body;
    return body + suffix;
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
    return issues;
  }

  /**
   * Nombre de relación: {TablaPrincipal}_{1N|NN}_{TablaSecundaria}
   * con los nombres para mostrar de las tablas en snake_case.
   */
  function buildRelationshipName({ primary, secondary, type, settings }) {
    const stop = (settings && settings.stopWords) || DEFAULT_STOP_WORDS;
    const a = toSnake(primary, stop);
    const b = toSnake(secondary, stop);
    if (!a || !b || !type) return '';
    return a + '_' + type + '_' + b;
  }

  function validateRelationship(value, { type }) {
    const v = String(value || '');
    if (!v) return ['El nombre de la relación está vacío'];
    const issues = [];
    if (!/^[a-z0-9]+(_[a-z0-9]+)*_(1N|NN)_[a-z0-9]+(_[a-z0-9]+)*$/.test(v)) {
      issues.push('No sigue el patrón [tabla]_' + (type || '1N') + '_[tabla]');
    } else if (type && !v.includes('_' + type + '_')) {
      issues.push('El tipo de relación debe ser ' + type);
    }
    return issues;
  }

  function defaultSettings() {
    const suffixes = {};
    CATEGORIES.forEach(c => { suffixes[c.key] = c.suffix; });
    return {
      enabled: true,
      autoExpand: true,
      showBadges: true,
      suffixes,
      stopWords: DEFAULT_STOP_WORDS.slice()
    };
  }

  function mergeSettings(stored) {
    const d = defaultSettings();
    const s = stored && typeof stored === 'object' ? stored : {};
    const out = Object.assign({}, d, s);
    out.suffixes = Object.assign({}, d.suffixes, s.suffixes || {});
    out.suffixes.choice = '_choice'; // fijo por estándar
    out.stopWords = Array.isArray(s.stopWords) ? s.stopWords : d.stopWords;
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
    DEFAULT_STOP_WORDS, CATEGORIES, CHOICE_TYPE,
    stripAccents, normalizeText, detectType, toSnake, cleanSuffix, cleanPrefix,
    suffixFor, buildName, validate, buildRelationshipName, validateRelationship,
    defaultSettings, mergeSettings,
    parseContext, resolveProject
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EcijaNaming = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
