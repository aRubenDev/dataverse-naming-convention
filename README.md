# ECIJA Dataverse Naming

Extensión para Brave/Chrome/Edge (Manifest V3) que, en la interfaz moderna de
`make.powerapps.com`, genera el **nombre lógico** de columnas y opciones globales
según el estándar ECIJA:

```
<prefijo publicador>_<prefijo proyecto>_<nombre_en_snake_case>_<sufijo tipo>
ecj_crm_fecha_alta_cliente_date
```

## Instalación (Brave)

1. Abre `brave://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar extensión sin empaquetar** → selecciona esta carpeta (`ecija-dataverse-naming`).
4. Fija el icono en la barra para tener a mano el popup.

Tras modificar el código: botón ⟳ de la extensión y recarga la pestaña del portal.

## Uso

- **Popup** (icono de la barra), estando dentro de un entorno: nombre del proyecto,
  prefijo adicional y, opcionalmente, un prefijo distinto para la solución abierta.
- **Configuración avanzada**: sufijos por tipo, palabras vacías, lista de proyectos,
  exportar/importar JSON para compartirlo con el equipo.

## Comportamiento

| Situación | Qué hace |
|---|---|
| Escribes el nombre para mostrar o cambias el tipo | Regenera el nombre lógico |
| Escribes tú en el nombre lógico | Deja de tocarlo en ese panel (aunque cambies el tipo) |
| Botón **Regenerar** del aviso | Vuelve al modo automático |
| Panel "Nueva opción" (opción global) | Mismo cálculo con `_choice` y, si hay prefijo de proyecto, el nombre para mostrar empieza por él en mayúsculas (`CRM_Estado`). Se añade una vez; si lo borras, se respeta |
| Columna de tipo Búsqueda | Además, nombre de la relación: `[tabla relacionada]_1N_[tabla actual]` |
| Relaciones → Uno a varios | `[tabla actual]_1N_[tabla relacionada]` + columna de búsqueda con `_lookup` |
| Relaciones → Varios a uno | `[tabla relacionada]_1N_[tabla actual]` + columna de búsqueda con `_lookup` |
| Relaciones → Varios a varios | `[tabla actual]_NN_[tabla relacionada]` |
| Editar columna existente / crear tabla | No hace nada |

En las relaciones se usan los **nombres para mostrar** de las tablas en snake_case
(`Punto orden día` → `punto_orden_dia`). La tabla actual se lee de la ruta de navegación
(breadcrumb) o del título de la página; el aviso (pasa el ratón) indica qué tablas y de
dónde se han detectado.

El aviso bajo el nombre lógico indica si cumple (snake_case, sufijo, prefijo de proyecto).
Es solo informativo: nunca impide guardar.

Conversión: minúsculas, sin tildes ni ñ, sin caracteres especiales y sin palabras vacías
(`Fecha de Alta del Cliente` → `fecha_alta_cliente`).

## Si algo no se detecta

Ejecuta [`tools/diagnostico.js`](tools/diagnostico.js) en la consola (F12) con el panel
abierto y comparte el resultado: indica qué etiquetas y controles usa el portal.

El portal cambia su HTML con frecuencia. Las etiquetas reconocidas están en
`src/content.js` (constante `LBL`) y los textos de tipo de datos en `src/naming.js`
(`TYPE_PATTERNS`). Si el aviso muestra "Tipo de datos no reconocido («…»), añade ese
texto al patrón correspondiente.

## Tests

```
node test/naming.test.js
```
