# ECIJA Dataverse Naming

Extensión para Brave/Chrome/Edge (Manifest V3) que, en la interfaz moderna de
`make.powerapps.com`, genera el **nombre de esquema** de columnas, opciones globales,
relaciones y tablas según el estándar de validaciones ECIJA (v1.0). Ejemplo en la tabla
*Acción*:

```
Columna:        <publicador>_<NombrePascalCase>_<sufijo tipo>
                «Sociedad» (búsqueda a Cuenta) → ecj_Sociedad_lookup
                «Tipo de movimiento» (opción)  → ecj_TipoMovimiento_choice
Relación:       <publicador>_<TablaRelacionada>_1N_<TablaActual> → ecj_Cuenta_1N_Accion
Opción global:  <publicador>_<proyecto>_<NombrePascalCase>_optionset
                ecj_gs_TipoMovimiento_optionset (nombre para mostrar: GS_Tipo de movimiento)
Tabla:          <publicador>_<proyecto>_<NombrePascalCase> → ecj_gs_PuntoOrdenDia
```

El prefijo del publicador lo pone el portal y no se toca.

### Sufijos

| Tipo | Sufijo | Tipo | Sufijo |
|---|---|---|---|
| Texto, símbolo bursátil | `_txt` | Sí/No | `_bool` |
| Área de texto | `_textarea` | Opción | `_choice` |
| Varias líneas de texto | `_multitxt` | Opciones (múltiple) | `_multichoice` |
| Texto enriquecido | `_richtxt` | Búsqueda, cliente | `_lookup` |
| Correo electrónico | `_email` | Solo fecha | `_date` |
| Teléfono | `_phone` | Fecha y hora | `_datetime` |
| URL | `_url` | Archivo | `_file` |
| Número entero | `_int` | Imagen | `_image` |
| Decimal | `_dec` | Idioma | `_language` |
| Flotante | `_float` | Zona horaria | `_timezone` |
| Moneda | `_currency` | Autonumérico | `_autonum` |
| Duración | `_duration` | Fórmula | `_formula` |
| Comportamiento calculado | `_calc` | Comportamiento acumulativo | `_rollup` |

Con comportamiento calculado o acumulativo el sufijo sustituye al del tipo (`importe_calc`,
no `importe_dec_calc`). Las columnas de estado propias (`estado_choice`, `activo_bool`…)
se marcan en el aviso: hay que usar *Estado* y *Razón para el estado* nativos.

Desde **Configuración avanzada → Importar JSON** se puede cargar directamente el JSON de
validaciones ECIJA: se toman los sufijos, el de opción global, las columnas prohibidas y los
patrones de columna principal y de solución.
Al actualizar desde una versión anterior a la 1.6, los sufijos guardados se sustituyen por
los del estándar.

## Instalación (Brave)

1. Abre `brave://extensions`.
2. Activa **Modo de desarrollador** (arriba a la derecha).
3. **Cargar extensión sin empaquetar** → selecciona esta carpeta (`ecija-dataverse-naming`).
4. Fija el icono en la barra para tener a mano el popup.

Tras modificar el código: botón ⟳ de la extensión y recarga la pestaña del portal.

## Uso

- **Popup** (icono de la barra), estando dentro de un entorno: nombre del proyecto,
  prefijo de proyecto (solo para opciones globales) y, opcionalmente, uno distinto para la solución abierta.
- **Configuración avanzada**: sufijos por tipo, palabras vacías, lista de proyectos,
  exportar/importar JSON para compartirlo con el equipo.

## Comportamiento

| Situación | Qué hace |
|---|---|
| Escribes el nombre para mostrar o cambias el tipo | Regenera el nombre lógico |
| Escribes tú en el nombre lógico | Deja de tocarlo en ese panel (aunque cambies el tipo) |
| Botón **Regenerar** del aviso | Vuelve al modo automático |
| Panel "Nueva opción" (opción global) | Mismo cálculo con `_optionset` y el prefijo de proyecto (`gs_TipoMovimiento_optionset`) y, si hay prefijo de proyecto, el nombre para mostrar empieza por él en mayúsculas (`GS_Tipo de movimiento`). Se añade una vez; si lo borras, se respeta |
| Columna de tipo Búsqueda | Además, nombre de la relación: `TablaRelacionada_1N_TablaActual` |
| Relaciones → Uno a varios | `TablaActual_1N_TablaRelacionada` + columna de búsqueda con `_lookup` |
| Relaciones → Varios a uno | `TablaRelacionada_1N_TablaActual` + columna de búsqueda con `_lookup` |
| Relaciones → Varios a varios | `TablaActual_NN_TablaRelacionada` |
| Botón **Guardar y crear otra** (panel Nueva columna) | Pulsa el *Guardar* del portal, espera a que se cierre el panel y vuelve a abrir uno nuevo con el mismo botón que usaste (*+ Nueva columna* o *Nuevo → Columna*). Los botones del portal no cambian |
| Panel **Nueva tabla** → nombre de esquema | Prefijo de proyecto + nombre en PascalCase: *Punto orden del día* → `ecija_gs_PuntoOrdenDia` (nombre lógico `ecija_gs_puntoordendia`) |
| Panel **Nueva tabla** → columna principal | Nombre de esquema `ID` + nombre de la tabla en PascalCase: *Sociedad* → `ecj_IDSociedad` (nombre lógico `ecj_idsociedad`). Si el nombre de la tabla empieza por el prefijo de proyecto (`GS_Sociedad`), se omite. El nombre de la tabla se toma de la pestaña Propiedades |
| Panel **Nueva solución** | Nombre `BASE_` + nombre para mostrar en PascalCase: *Gestión societaria* → `BASE_GestionSocietaria` |
| Editar columna o tabla existente | No hace nada |

En las relaciones cada tabla se escribe con su **nombre para mostrar en PascalCase**, sin
prefijo de proyecto; el del publicador lo pone el portal delante:
`ecj_Cuenta_1N_Accion`. El nombre de la columna de búsqueda no se añade: si hay dos lookups
a la misma tabla, el portal avisará del nombre duplicado y se corrige a mano. Si no se detecta el nombre para mostrar de una tabla, se usa
su nombre lógico (aprendido del valor que propone el portal al crear un lookup y guardado
en una caché local) y el aviso lo indica. La tabla actual se identifica por la URL, la
ruta de navegación o el título.

El aviso marca también si el nombre supera los 100 caracteres de Dataverse.

**Guardar y crear otra.** Aparece entre *Guardar* y *Cancelar*, con el mismo aspecto que
los botones del portal, y se desactiva mientras *Guardar* lo esté. Si el portal muestra un error, el panel
se queda abierto y no se crea otra. Cualquier clic tuyo mientras guarda cancela la
reapertura. Se puede ocultar desde la configuración.

Mientras filtras en un desplegable con búsqueda (p. ej. "Tabla relacionada") la
extensión no escribe en ningún campo, y si el portal mueve el foco al rellenar un
campo, lo devuelve a donde estabas.

El aviso bajo el nombre de esquema indica si cumple (PascalCase, sufijo, prefijo de proyecto
en opciones globales y tablas, columnas de estado prohibidas).
Es solo informativo: nunca impide guardar.

Conversión: PascalCase, sin tildes ni ñ, sin caracteres especiales y sin palabras vacías
(`Fecha de Alta del Cliente` → `FechaAltaCliente`). El nombre lógico es el mismo en
minúsculas (`ecj_fechaaltacliente_date`); eso lo hace Dataverse.

## Resaltado de la lista de columnas

En **Tablas → <tabla> → Columnas** cada fila se marca según lo que muestra la propia lista:

| Marca | Significado | Cómo se detecta |
|---|---|---|
| Barra roja | Obligatoria | Columna *Requerido / Obligatorio* de la vista («Obligatorio para la empresa», «Requerido para el sistema», «Sí») |
| Barra azul | Recomendada | «Recomendado para la empresa» |
| Fondo verde | Mía | El nombre lógico empieza por el **prefijo del publicador** configurado en el popup |
| Fondo lila | De otro publicador | Columna *Personalizado* = Sí, o nombre con prefijo si esa columna no está en la vista |
| Atenuada | Estándar | *Personalizado* = No, o nombre sin prefijo (`createdon`, `ownerid`…) |
| Borde ámbar discontinuo | No cumple el estándar | Mía y el nombre no termina en el sufijo de su tipo, o es una columna de estado prohibida. El motivo sale al pasar el ratón |

Dataverse no guarda quién creó cada columna, así que «mía» significa «con el prefijo de mi
publicador». La lista del portal no distingue siempre *Solo fecha* de *Fecha y hora* ni muestra
el comportamiento calculado/acumulativo, así que en esos casos se aceptan los sufijos de la
familia (`_date`/`_datetime`, `_calc`, `_rollup`, `_formula`). Las columnas `_base` (que crea
Dataverse para las de moneda) y la principal `IDNombreTabla` no se revisan.

La **leyenda** flotante (abajo a la derecha) permite activar o desactivar cada marca, se puede
plegar y recuerda la elección en este navegador. Los recuentos son de las filas cargadas: la
lista carga más al desplazarse. Para que salgan las obligatorias, la columna *Requerido* tiene
que estar visible en la vista de la lista. Se desactiva entera en **Configuración avanzada**.

Si no marca nada, ejecuta [`tools/diagnostico-columnas.js`](tools/diagnostico-columnas.js) en la
consola con la lista abierta y comparte el resultado.

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
