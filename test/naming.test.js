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

t('detección de tipos ES/EN', () => {
  const c = s => (N.detectType(s) || {}).category;
  assert.strictEqual(c('Texto'), 'text');
  assert.strictEqual(c('Una línea de texto'), 'text');
  assert.strictEqual(c('Texto enriquecido'), 'richtext');
  assert.strictEqual(c('Área de texto'), 'text');
  assert.strictEqual(c('Correo electrónico'), 'text');
  assert.strictEqual(c('URL'), 'url');
  assert.strictEqual(c('Número entero'), 'number');
  assert.strictEqual(c('Moneda'), 'number');
  assert.strictEqual(c('Fecha y hora'), 'date');
  assert.strictEqual(c('Solo fecha'), 'date');
  assert.strictEqual(c('Sí/No'), 'boolean');
  assert.strictEqual(c('Yes/no'), 'boolean');
  assert.strictEqual(c('Opción'), 'choice');
  assert.strictEqual(c('Opciones'), 'choice');
  assert.strictEqual(c('Choices'), 'choice');
  assert.strictEqual(c('Búsqueda'), 'lookup');
  assert.strictEqual(c('Customer'), 'lookup');
  assert.strictEqual(c('Imagen'), 'file');
  assert.strictEqual(c('Archivo'), 'file');
  assert.strictEqual(c('Fórmula'), 'formula');
  assert.strictEqual(N.detectType('xyz'), null);
});

t('buildName', () => {
  assert.strictEqual(N.buildName({ displayName: 'Fecha de Alta', category: 'date', settings: S }), 'fecha_alta_date');
  assert.strictEqual(N.buildName({ displayName: 'Fecha de Alta', category: 'date', settings: S, extraPrefix: 'CRM' }), 'crm_fecha_alta_date');
  assert.strictEqual(N.buildName({ displayName: 'Estado Choice', category: 'choice', settings: S }), 'estado_choice');
  assert.strictEqual(N.buildName({ displayName: 'Total', category: 'formula', settings: S }), 'total_fx');
  assert.strictEqual(N.buildName({ displayName: '', category: 'text', settings: S }), '');
});

t('choice siempre _choice aunque se intente cambiar', () => {
  const s = N.mergeSettings({ suffixes: { choice: '_opt', text: '_t' } });
  assert.strictEqual(N.suffixFor('choice', s), '_choice');
  assert.strictEqual(N.buildName({ displayName: 'Nombre', category: 'text', settings: s }), 'nombre_t');
});

t('validate', () => {
  assert.deepStrictEqual(N.validate('crm_fecha_alta_date', { category: 'date', settings: S, extraPrefix: 'crm' }), []);
  assert.strictEqual(N.validate('FechaAlta', { category: 'date', settings: S }).length, 2);
  assert.ok(N.validate('fecha_alta_date', { category: 'date', settings: S, extraPrefix: 'crm' })[0].includes('crm_'));
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

console.log(`\n${ok} grupos de tests OK`);
