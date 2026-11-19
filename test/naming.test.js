// Ejecutar: node test/naming.test.js
const assert = require('assert');
const N = require('../src/naming.js');

const S = N.mergeSettings({});
let ok = 0;
function t(name, fn) { fn(); ok++; console.log('✔', name); }

t('snake + tildes + ñ + stop words', () => {
  assert.strictEqual(N.toSnake('Fecha de Alta del Cliente', S.stopWords), 'fecha_alta_cliente');
  assert.strictEqual(N.toSnake('Año de creación', S.stopWords), 'ano_creacion');
  assert.strictEqual(N.toSnake('  Importe (€) / IVA  ', S.stopWords), 'importe_iva');
  assert.strictEqual(N.toSnake('De la', S.stopWords), 'de_la'); // si todo son stop words se mantienen
});

t('detección de tipos ES/EN → sufijo del estándar', () => {
  const sx = txt => N.suffixFor((N.detectType(txt) || {}).category, S);
  const cases = {
    'Texto': '_txt', 'Una línea de texto': '_txt', 'Símbolo bursátil': '_txt',
    'Área de texto': '_textarea', 'Varias líneas de texto': '_multitxt', 'Multiple lines of text': '_multitxt',
    'Texto enriquecido': '_richtxt', 'Correo electrónico': '_email', 'Teléfono': '_phone', 'URL': '_url',
    'Número entero': '_int', 'Whole number': '_int', 'Decimal': '_dec', 'Número de punto flotante': '_float',
    'Moneda': '_currency', 'Duración': '_duration', 'Sí/No': '_bool', 'Yes/no': '_bool',
    'Opción': '_choice', 'Opciones': '_multichoice', 'Choices': '_multichoice',
    'Búsqueda': '_lookup', 'Customer': '_lookup', 'Solo fecha': '_date', 'Fecha y hora': '_datetime',
    'Archivo': '_file', 'Imagen': '_image', 'Idioma': '_language', 'Zona horaria': '_timezone',
    'Autonumérico': '_autonum', 'Fórmula': '_formula'
  };
  for (const [txt, suf] of Object.entries(cases)) assert.strictEqual(sx(txt), suf, txt);
  assert.strictEqual(N.detectType('xyz'), null);
  // El desplegable puede mostrar la categoría y el subtipo a la vez
  assert.strictEqual(sx('Fecha y hora Solo fecha'), '_date');
  assert.strictEqual(sx('Fecha y hora › Solo fecha'), '_date');
  assert.strictEqual(sx('Date and time Date only'), '_date');
  assert.strictEqual(sx('Fecha y hora Fecha y hora'), '_datetime');
});

t('comportamiento calculado / acumulativo', () => {
  assert.strictEqual(N.detectBehavior('Calculada'), 'calculated');
  assert.strictEqual(N.detectBehavior('Calculated'), 'calculated');
  assert.strictEqual(N.detectBehavior('Acumulativa'), 'rollup');
  assert.strictEqual(N.detectBehavior('Rollup'), 'rollup');
  assert.strictEqual(N.detectBehavior('Simple'), null);
  assert.strictEqual(N.detectBehavior('Zona horaria independiente'), null);
  assert.strictEqual(N.buildName({ displayName: 'Importe', category: 'calculated', settings: S }), 'Importe_calc');
  assert.strictEqual(N.buildName({ displayName: 'Total facturado', category: 'rollup', settings: S }), 'TotalFacturado_rollup');
});

t('buildName: columnas en PascalCase + sufijo, opción global con prefijo de proyecto', () => {
  const b = (displayName, category, extraPrefix) => N.buildName({ displayName, category, settings: S, extraPrefix });
  assert.strictEqual(b('Sociedad', 'lookup'), 'Sociedad_lookup');
  assert.strictEqual(b('Tipo de movimiento', 'choice'), 'TipoMovimiento_choice');
  assert.strictEqual(b('Fecha de Alta', 'date'), 'FechaAlta_date');
  assert.strictEqual(b('Estado choice', 'choice'), 'Estado_choice');
  assert.strictEqual(b('Total', 'formula'), 'Total_formula');
  assert.strictEqual(b('GS_Tipo de movimiento', 'optionset', 'gs'), 'gs_TipoMovimiento_optionset');
  assert.strictEqual(b('Tipo de movimiento', 'optionset', 'GS'), 'gs_TipoMovimiento_optionset');
  assert.strictEqual(b('Estado optionset', 'optionset'), 'Estado_optionset');
  assert.strictEqual(b('', 'text'), '');
});

t('migración de configuración antigua y sufijos editables', () => {
  const old = N.mergeSettings({ suffixes: { number: '_num', formula: '_fx', text: '_t' }, stopWords: ['de'] });
  assert.strictEqual(N.suffixFor('formula', old), '_formula');
  assert.strictEqual(N.suffixFor('text', old), '_txt');
  assert.deepStrictEqual(old.stopWords, ['de']);
  const cur = N.mergeSettings({ version: 2, suffixes: { text: '_t' } });
  assert.strictEqual(N.buildName({ displayName: 'Nombre', category: 'text', settings: cur }), 'Nombre_t');
});

t('validate', () => {
  const v = (value, category, extraPrefix) => N.validate(value, { category, settings: S, extraPrefix });
  assert.deepStrictEqual(v('FechaAlta_date', 'date'), []);
  assert.deepStrictEqual(v('Sociedad_lookup', 'lookup'), []);
  assert.deepStrictEqual(v('gs_TipoMovimiento_optionset', 'optionset', 'gs'), []);
  assert.ok(v('fecha_alta_date', 'date')[0].includes('PascalCase'));
  assert.strictEqual(v('FechaAlta', 'date').length, 1);
  assert.ok(v('TipoMovimiento_optionset', 'optionset', 'gs')[0].includes('gs_'));
  assert.ok(v('Estado_choice', 'choice')[0].includes('Estado'));
  assert.ok(v('Activo_bool', 'boolean')[0].includes('Estado'));
  assert.deepStrictEqual(v('EstadoCivil_choice', 'choice'), []);
});

t('importar JSON de validaciones ECIJA', () => {
  const std = {
    version: '1.0',
    dataverse: {
      columnNaming: { suffixes: { text: '_txt', integer: '_entero', calculated: '_calc', inventado: '_x' } },
      globalOptionSetNaming: { pattern: '<prefix>_<name>_optionset' },
      entityStateManagement: { forbiddenColumns: ['estado_choice', 'Activo_Bool'] }
    }
  };
  const s = N.settingsFromStandard(std, { stopWords: ['de'] });
  assert.strictEqual(s.suffixes.integer, '_entero');
  assert.strictEqual(s.suffixes.optionset, '_optionset');
  assert.strictEqual(s.suffixes.inventado, undefined);
  assert.deepStrictEqual(s.forbiddenColumns, ['estado_choice', 'activo_bool']);
  assert.deepStrictEqual(s.stopWords, ['de']);
  assert.strictEqual(N.settingsFromStandard({ format: 'ecija-naming' }), null);
});

t('columna principal y solución', () => {
  assert.strictEqual(N.buildPrimaryColumnName({ tableDisplay: 'Sociedad', settings: S }), 'IDSociedad');
  assert.strictEqual(N.buildPrimaryColumnName({ tableDisplay: 'Punto de orden del día', settings: S }), 'IDPuntoOrdenDia');
  assert.strictEqual(N.buildPrimaryColumnName({ tableDisplay: 'GS_Sociedad', settings: S, extraPrefix: 'gs' }), 'IDSociedad');
  assert.strictEqual(N.buildPrimaryColumnName({ tableDisplay: '', settings: S }), '');
  assert.deepStrictEqual(N.validatePrimaryColumn('IDSociedad', S), []);
  assert.strictEqual(N.validatePrimaryColumn('Name', S).length, 1);
  assert.strictEqual(N.validatePrimaryColumn('ID_sociedad', S).length, 1);
  assert.strictEqual(N.buildSolutionName({ displayName: 'Gestión societaria', settings: S }), 'BASE_GestionSocietaria');
  assert.strictEqual(N.buildSolutionName({ displayName: 'BASE Gestión de la sociedad', settings: S }), 'BASE_GestionSociedad');
  assert.deepStrictEqual(N.validateSolutionName('BASE_GS', S), []);
  assert.strictEqual(N.validateSolutionName('GestionSocietaria', S).length, 1);
  const s = N.settingsFromStandard({ dataverse: { primaryColumn: { schemaPattern: '^PK[A-Z][A-Za-z0-9]+$' }, solution: { pattern: '^SOL_[A-Za-z0-9]+$' } } });
  assert.strictEqual(N.buildPrimaryColumnName({ tableDisplay: 'Acta', settings: s }), 'PKActa');
  assert.strictEqual(N.buildSolutionName({ displayName: 'Actas', settings: s }), 'SOL_Actas');
});

t('nombre de tabla duplicado por el portal', () => {
  const d = N.dedupeRepeated;
  assert.strictEqual(d('CuentaCuenta'), 'Cuenta');
  assert.strictEqual(d('Cuentacuenta'), 'Cuenta');
  assert.strictEqual(d('Cuenta Cuenta'), 'Cuenta');
  assert.strictEqual(d('Tipo órganoTipo órgano'), 'Tipo órgano');
  assert.strictEqual(d('Tipo órgano Tipo órgano'), 'Tipo órgano');
  for (const x of ['Cuenta', 'Papa', 'Papá', 'Acta', 'Tipo de movimiento', 'Forma jurídica']) assert.strictEqual(d(x), x);
  assert.strictEqual(N.relationshipToken({ display: d('CuentaCuenta'), settings: S }), 'Cuenta');
});

t('contexto y proyecto', () => {
  const ctx = N.parseContext('https://make.powerapps.com/environments/Default-abc/solutions/11111111-2222-3333-4444-555555555555/objects/all');
  assert.strictEqual(ctx.envId, 'default-abc');
  assert.strictEqual(ctx.solutionId, '11111111-2222-3333-4444-555555555555');
  const projects = { 'default-abc': { name: 'X', extraPrefix: 'crm', publisherPrefix: 'ecj', solutions: { '11111111-2222-3333-4444-555555555555': { extraPrefix: 'fin' } } } };
  assert.strictEqual(N.resolveProject(projects, ctx).extraPrefix, 'fin');
  assert.strictEqual(N.resolveProject(projects, { envId: 'default-abc' }).extraPrefix, 'crm');
  assert.strictEqual(N.resolveProject(projects, { envId: 'default-abc' }).publisherPrefix, 'ecj_');
  assert.strictEqual(N.resolveProject(projects, { envId: 'otro' }).extraPrefix, '');
});

t('nombre de esquema de tabla en PascalCase', () => {
  assert.strictEqual(N.buildTableName({ displayName: 'Punto orden del día', settings: S, extraPrefix: 'gs' }), 'gs_PuntoOrdenDia');
  assert.strictEqual(N.buildTableName({ displayName: 'GS_Sociedad', settings: S, extraPrefix: 'gs' }), 'gs_Sociedad');
  assert.strictEqual(N.buildTableName({ displayName: 'Sociedad', settings: S }), 'Sociedad');
  assert.strictEqual(N.buildTableName({ displayName: '', settings: S, extraPrefix: 'gs' }), '');
  assert.deepStrictEqual(N.validateTableName('gs_PuntoOrdenDia', { extraPrefix: 'gs' }), []);
  assert.ok(N.validateTableName('PuntoOrdenDia', { extraPrefix: 'gs' })[0].includes('gs_'));
  assert.strictEqual(N.validateTableName('gs_punto_orden_dia', { extraPrefix: 'gs' }).length, 1);
});

t('relaciones en PascalCase', () => {
  const pub = 'ecija_';
  const tok = (logical, display, extraPrefix) => N.relationshipToken({ logical, display, pub, settings: S, extraPrefix });
  assert.strictEqual(tok(null, 'Punto orden del día'), 'PuntoOrdenDia');
  assert.strictEqual(tok('gs_auditor', 'Auditor'), 'Auditor');
  assert.strictEqual(tok(null, 'GS_Sociedad', 'gs'), 'Sociedad');
  assert.strictEqual(tok('ecija_gs_auditor', null, 'gs'), 'Auditor');
  assert.strictEqual(N.buildRelationshipName({ primary: tok(null, 'Auditor'), secondary: tok(null, 'Sociedad'), type: '1N' }), 'Auditor_1N_Sociedad');
  assert.strictEqual(N.buildRelationshipName({ primary: tok(null, 'Acta'), secondary: tok(null, 'Asistente de la Reunión'), type: 'NN' }), 'Acta_NN_AsistenteReunion');
  assert.strictEqual(N.buildRelationshipName({ primary: '', secondary: 'Acta', type: '1N' }), '');
  // Valor por defecto del portal (diagnóstico real): se sigue aprendiendo el nombre lógico
  assert.deepStrictEqual(
    N.parsePortalRelationshipDefault('gs_acta_puntos_orden_dia_lookup_ecija_gs_puntoordendia', { schemaPart: 'puntos_orden_dia_lookup', pub }),
    { current: 'gs_acta', related: 'gs_puntoordendia' });
  assert.deepStrictEqual(N.parsePortalRelationshipDefault('Sociedad_1N_Acta', { schemaPart: 'x', pub }), {});
  assert.deepStrictEqual(N.validateRelationship('PuntoOrdenDia_1N_Acta', { type: '1N' }), []);
  assert.deepStrictEqual(N.validateRelationship('Auditor_1N_Sociedad_AuditorPrincipal', { type: '1N' }), []);
  assert.strictEqual(N.validateRelationship('punto_orden_dia_1N_acta', { type: '1N' }).length, 1);
  assert.strictEqual(N.validateRelationship('gs_acta_puntos_orden_dia_lookup', { type: '1N' }).length, 1);
  assert.ok(N.validateRelationship('Acta_NN_Contacto', { type: '1N' })[0].includes('1N'));
});

t('lookup «Sociedad» en Accion hacia Cuenta', () => {
  const tok = d => N.relationshipToken({ display: d, pub: 'ecj_', settings: S });
  assert.strictEqual(N.buildName({ displayName: 'Sociedad', category: 'lookup', settings: S }), 'Sociedad_lookup');
  assert.strictEqual(N.buildRelationshipName({ primary: tok('Cuenta'), secondary: tok('Acción'), type: '1N' }), 'Cuenta_1N_Accion');
  const long = 'A'.repeat(50) + '_1N_' + 'B'.repeat(50);
  assert.ok(N.validateRelationship(long, { type: '1N', pub: 'ecj_' })[0].includes('100'));
});

console.log(`\n${ok} grupos de tests OK`);
