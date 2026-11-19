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
});

t('comportamiento calculado / acumulativo', () => {
  assert.strictEqual(N.detectBehavior('Calculada'), 'calculated');
  assert.strictEqual(N.detectBehavior('Calculated'), 'calculated');
  assert.strictEqual(N.detectBehavior('Acumulativa'), 'rollup');
  assert.strictEqual(N.detectBehavior('Rollup'), 'rollup');
  assert.strictEqual(N.detectBehavior('Simple'), null);
  assert.strictEqual(N.detectBehavior('Zona horaria independiente'), null);
  assert.strictEqual(N.buildName({ displayName: 'Importe', category: 'calculated', settings: S }), 'importe_calc');
  assert.strictEqual(N.buildName({ displayName: 'Total facturado', category: 'rollup', settings: S }), 'total_facturado_rollup');
});

t('buildName', () => {
  assert.strictEqual(N.buildName({ displayName: 'Fecha de Alta', category: 'date', settings: S }), 'fecha_alta_date');
  assert.strictEqual(N.buildName({ displayName: 'Estado', category: 'optionset', settings: S, extraPrefix: 'GS' }), 'gs_estado_optionset');
  assert.strictEqual(N.buildName({ displayName: 'GS_Estado', category: 'optionset', settings: S, extraPrefix: 'gs' }), 'gs_estado_optionset');
  assert.strictEqual(N.buildName({ displayName: 'Estado optionset', category: 'optionset', settings: S }), 'estado_optionset');
  assert.strictEqual(N.buildName({ displayName: 'Total', category: 'formula', settings: S }), 'total_formula');
  assert.strictEqual(N.buildName({ displayName: '', category: 'text', settings: S }), '');
});

t('migración de configuración antigua y sufijos editables', () => {
  const old = N.mergeSettings({ suffixes: { number: '_num', formula: '_fx', text: '_t' }, stopWords: ['de'] });
  assert.strictEqual(N.suffixFor('formula', old), '_formula');
  assert.strictEqual(N.suffixFor('text', old), '_txt');
  assert.deepStrictEqual(old.stopWords, ['de']);
  const cur = N.mergeSettings({ version: 2, suffixes: { text: '_t' } });
  assert.strictEqual(N.buildName({ displayName: 'Nombre', category: 'text', settings: cur }), 'nombre_t');
});

t('validate', () => {
  assert.deepStrictEqual(N.validate('fecha_alta_date', { category: 'date', settings: S }), []);
  assert.strictEqual(N.validate('FechaAlta', { category: 'date', settings: S }).length, 2);
  assert.ok(N.validate('estado_optionset', { category: 'optionset', settings: S, extraPrefix: 'gs' })[0].includes('gs_'));
  assert.ok(N.validate('estado_choice', { category: 'choice', settings: S })[0].includes('Estado'));
  assert.ok(N.validate('activo_bool', { category: 'boolean', settings: S })[0].includes('Estado'));
  assert.deepStrictEqual(N.validate('estado_civil_choice', { category: 'choice', settings: S }), []);
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

t('relaciones', () => {
  const pub = 'ecija_';
  const tok = (logical, display) => N.relationshipToken({ logical, display, pub, settings: S });
  // Formato del usuario: ecija_gs_sociedad_1N_ecija_gs_auditor (ecija_ inicial lo pone el portal)
  assert.strictEqual(N.buildRelationshipName({ primary: tok('gs_sociedad'), secondary: tok('gs_auditor'), type: '1N', pub }), 'gs_sociedad_1N_ecija_gs_auditor');
  assert.strictEqual(N.buildRelationshipName({ primary: tok('ecija_x'), secondary: tok('ecija_y'), type: '1N', pub }), 'x_1N_ecija_y');
  // Sin nombre lógico: nombre para mostrar en snake_case
  assert.strictEqual(N.buildRelationshipName({ primary: tok(null, 'Punto orden día'), secondary: tok('gs_acta'), type: '1N', pub }), 'punto_orden_dia_1N_ecija_gs_acta');
  assert.strictEqual(N.buildRelationshipName({ primary: tok(null, 'Acta'), secondary: tok(null, 'Asistente de la Reunión'), type: 'NN', pub }), 'acta_NN_asistente_reunion');
  assert.strictEqual(N.buildRelationshipName({ primary: '', secondary: 'acta', type: '1N', pub }), '');
  // Valor por defecto del portal (diagnóstico real)
  assert.deepStrictEqual(
    N.parsePortalRelationshipDefault('gs_acta_puntos_orden_dia_lookup_ecija_gs_puntoordendia', { schemaPart: 'puntos_orden_dia_lookup', pub }),
    { current: 'gs_acta', related: 'gs_puntoordendia' });
  assert.deepStrictEqual(
    N.parsePortalRelationshipDefault('gs_acta_otro_esquema_ecija_gs_puntoordendia', { schemaPart: 'puntos_orden_dia_lookup', pub }),
    { related: 'gs_puntoordendia' });
  assert.deepStrictEqual(N.parsePortalRelationshipDefault('gs_sociedad_1N_ecija_gs_acta', { schemaPart: 'x', pub }), {});
  assert.deepStrictEqual(N.validateRelationship('punto_orden_dia_1N_acta', { type: '1N' }), []);
  assert.strictEqual(N.validateRelationship('gs_acta_puntos_orden_dia_lookup', { type: '1N' }).length, 1);
  assert.ok(N.validateRelationship('acta_NN_contacto', { type: '1N' })[0].includes('1N'));
});

t('varias lookups a la misma tabla', () => {
  const pub = 'ecija_';
  const q = (lookupDisplay, related, extraPrefix) => N.lookupQualifier({ lookupDisplay, related, pub, extraPrefix, settings: S });
  const aud = { logical: 'gs_auditor', display: 'Auditor' };
  assert.strictEqual(q('Auditor', aud), '');
  assert.strictEqual(q('Auditor', { logical: 'gs_auditor' }), '');
  assert.strictEqual(q('GS Auditor', aud, 'gs'), '');
  assert.strictEqual(q('Punto orden día', { logical: 'gs_puntoordendia' }), '');
  assert.strictEqual(q('Puntos orden día', { logical: 'gs_puntoordendia', display: 'Punto orden día' }), '');
  assert.strictEqual(q('Auditores', aud), '');
  assert.strictEqual(q('Auditor principal', aud), 'auditor_principal');
  assert.strictEqual(q('Auditor de la Sociedad', { display: 'Auditor' }), 'auditor_sociedad');
  assert.strictEqual(q('', aud), '');
  const tok = l => N.relationshipToken({ logical: l, pub, settings: S });
  assert.strictEqual(
    N.buildRelationshipName({ primary: tok('gs_auditor'), secondary: tok('gs_sociedad'), type: '1N', pub, qualifier: q('Auditor suplente', aud) }),
    'gs_auditor_1N_ecija_gs_sociedad_auditor_suplente');
  assert.deepStrictEqual(N.validateRelationship('gs_auditor_1N_ecija_gs_sociedad_auditor_suplente', { type: '1N', pub }), []);
  const long = 'a'.repeat(50) + '_1N_' + 'b'.repeat(50);
  assert.ok(N.validateRelationship(long, { type: '1N', pub })[0].includes('100'));
});

console.log(`\n${ok} grupos de tests OK`);
