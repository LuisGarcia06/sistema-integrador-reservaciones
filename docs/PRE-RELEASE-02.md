# PRE-RELEASE-02 — Vehículos del catálogo como referencia principal

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama:** `GYG+FRHB-implementado`.  
**Alcance:** implementación de presentación y actualización del frontend; pruebas y capturas exclusivamente sintéticas.

## 1. Resultado implementado

La identificación del transporte se construye a partir de la operación, vehículo y pasajeros que entrega el API. Se muestra primero:

```text
Grupo 1 · Unidad 2 · 2/12 PAX
Transporte #9401
```

Sin vehículo:

```text
Grupo 1 · Vehículo pendiente · 4/12 PAX
Transporte #9401
```

Los IDs 9401/9402 de las capturas son sintéticos. No se hizo una excepción para el transporte real 425 ni se cambió ningún registro de PostgreSQL. La misma regla se aplica a todas las operaciones existentes y a las que se creen después.

## 2. Archivos modificados y creados

| Archivo | Cambio |
|---|---|
| `frontend/js/transportesUi.js` — nuevo | Función compartida `App.transportesUi.describir(transporte, operacion)`; genera texto principal/secundario, PAX y estado visual de capacidad. |
| `frontend/index.html` | Carga la función compartida antes de las páginas. |
| `frontend/pages/operaciones.js` | Utiliza la descripción en resumen, listado de transportes, cabecera del diálogo, formulario de edición, organización, reservaciones asignadas y opciones de destino. Unifica la actualización del Daily y añade actualización explícita/al recuperar foco. |
| `frontend/css/pages.css` | Estilo mínimo `.transporte-identidad`: texto principal y referencia secundaria en líneas separadas, con ajuste de línea. |
| `frontend/pages/dashboard.js` | Aclara aprobación frente a registro y prioriza los motivos de bloqueo sobre el mensaje de datos manuales faltantes. |
| `backend/__tests__/transportesUi.test.js` — nuevo | Casos de descripción y recorrido Electron con API simulada; comprueba IDs originales y ausencia de escrituras al catálogo. |
| `backend/__tests__/helpers/transportesUiApi.cjs` — nuevo | Simulador HTTP en memoria con operaciones, vehículos y reservas exclusivamente ficticios. No importa el backend del producto, `pg`, `.env` ni clientes de integración. |
| `backend/__tests__/helpers/transportesUiHarness.cjs` — nuevo | Interacciones y capturas del frontend real en Electron; bloqueo de solicitudes fuera del simulador. |
| `docs/pre-release-02/` — nuevo | Trece PNG y evidencia JSON de la validación y solicitudes al simulador. |
| `docs/PRE-RELEASE-02.md` — nuevo | Este informe. |

Los documentos `PRE-RELEASE-01.md` y `RELEASE-01.md` ya existían sin seguimiento al comenzar y se conservaron. No se modificaron servicios, controladores, rutas, SQL, configuración de permisos ni lógica de negocio del backend.

## 3. Regla reutilizable y catálogo

`describir()` es una función de presentación que recibe datos actuales y no los modifica ni guarda etiquetas. Usa `numero_grupo`, `id_vehiculo`, `vehiculo`, `capacidad`, `total_pax_activos` e `id_transporte_operacion`.

- El identificador de unidad proviene del campo `vehiculo` de la respuesta enriquecida del API, que obtiene `vehiculos.identificador` mediante la relación existente. El ID del transporte nunca se convierte en un nombre físico de unidad.
- Con `id_vehiculo` nulo se muestra **Vehículo pendiente**, aunque un objeto incompleto conservara un nombre anterior. Si hay ID pero falta el nombre se muestra **Vehículo por consultar**.
- El límite visual efectivo es `min(12, capacidad física)` con vehículo asignado. Sin vehículo se muestran los 12 del máximo operativo. Una capacidad desconocida se anuncia como **Capacidad por consultar**, sin inventar una capacidad física.
- Si el API no entrega PAX válidos, el texto es **PAX por consultar**. Un cero confirmado sí se muestra como `0/12 PAX`. Mientras se solicita la información se utilizan los indicadores de carga y “Actualizando transporte y PAX…”.
- El ID interno se muestra debajo como dato secundario. Los elementos `<option>` nativos usan una sola línea: primero grupo/unidad/PAX y al final el ID, conservando como `value` el `id_transporte_operacion` original.
- Los PAX activos se toman del agregado del Daily existente. No se recalculan contando filas ni sumando canceladas en el navegador.

La selección del vehículo conserva `renderVehiculoOptions()` y `/api/vehiculos`, el filtrado de activos y la conservación del vehículo actual cuando corresponda. Crear transporte sigue sin asignar vehículo; editarlo utiliza el ID del catálogo y las validaciones actuales. No se crean vehículos por mostrar etiquetas, agregar transporte o asignar pasajeros. El simulador verifica que todas las solicitudes a `/api/vehiculos` fueron GET.

## 4. Actualización y operaciones futuras

Se centralizó la incorporación del Daily en `actualizarDaily()`. Al recibir una respuesta, reemplaza el mapa de operaciones y actualiza los datos del grupo/transporte seleccionado; después vuelve a pintar los resúmenes. Los datos del Daily recién consultado prevalecen sobre los objetos anteriores del listado.

Esto corrige un problema de presentación: antes, editar vehículo o asignar reservas recargaba el panel, pero podía dejar el resumen de operaciones con los datos anteriores.

| Acción | Comportamiento permanente |
|---|---|
| Consultar operaciones o cambiar de fecha | Consulta operaciones y Daily; construye las etiquetas desde esas respuestas. |
| Crear una operación | Conserva el POST existente y vuelve a consultar el listado y Daily; no crea vehículo ni asignaciones. |
| Agregar transporte | Conserva el POST existente, consulta transporte y Daily, y muestra vehículo pendiente hasta una asignación manual. |
| Asignar o retirar reservaciones | Conserva el PATCH por IDs originales; vuelve a consultar Daily y actualiza panel, cabeceras, opciones y resumen. |
| Asignar, cambiar o retirar vehículo | Conserva el PATCH de transporte; vuelve a consultar transporte y Daily y aplica la misma descripción. |
| Actualizar información desde otra sesión | “Actualizar” en Operaciones o en el diálogo vuelve a consultar; recuperar el foco también actualiza cuando no hay formulario ni escritura en curso. |
| Navegar fuera y volver | La página reconstruye sus datos y consulta nuevamente el API. |
| Cerrar y abrir Electron con el código actualizado | Un renderer nuevo obtiene los datos del API; no hay almacenamiento persistente de etiquetas ni pasajeros en el navegador. |

No se añade un sondeo continuo: las etiquetas representan la **última consulta correcta al API**, no una suscripción en tiempo real a PostgreSQL. Los cambios de otras sesiones se incorporan al actualizar, recuperar foco o reabrir la vista. La actualización por foco se omite mientras se edita o guarda para preservar el formulario. Se mantienen las protecciones de sesión y respuestas atrasadas existentes. Ante fallos de consulta no se inventa un cero ni se presenta el contenido anterior de reservaciones como una consulta nueva correcta.

La fuente de datos en la aplicación normal sigue siendo PostgreSQL a través del backend. Esta fase no abrió una conexión real para validar filas: comprobó el contrato con respuestas sintéticas cambiantes. La reapertura probada consiste en **dos procesos Electron independientes**, consultando el mismo simulador cuyo estado se cambió entre ejecuciones. No equivale a una prueba de instalación ni a modificar un ejecutable instalado anteriormente; la distribución de un nuevo instalador permanece fuera de alcance.

## 5. Mensajes de Pendientes de integración

Se conservó el flujo y se ajustaron únicamente los textos de la interfaz:

- El panel explica que aprobado significa revisado y que el registro interno ocurre al aplicar.
- Un detalle `approved/not_applied` indica: “Aprobado, pendiente de aplicar. La aprobación no significa que la reservación esté registrada.”
- El estado de preview FareHarbor da prioridad a los bloqueos existentes. Si la actividad inició y además falta pickup, se muestran ambos motivos, empezando por el bloqueo. Ya no se sustituye ese motivo por una indicación genérica de completar datos.
- El botón sigue deshabilitado cuando el preview existente impide aplicar. No se modifican la validación temporal, la aprobación, la aplicación ni la recepción.

No se implementó archivado, notificaciones nuevas, sincronización ni cambios de integración.

## 6. Pruebas realizadas

**Regresión conjunta: 8 suites y 254 pruebas aprobadas, cero fallos.** Suites: `transportesUi`, `frontendScope`, `brandingScreens`, `capacidad.service`, `accessScope.routes`, `eventosIntegracion.routes`, `fareharborApplication.service` y `getyourguideReservationApplication.service`. La suite nueva contiene ocho casos de descripción y un recorrido Electron. Se repitió el recorrido al afinar la captura de frames del renderer oculto.

Ejecución mediante Jest por rutas explícitas, con `--runInBand --no-cache`, `APP_CONFIG_PATH=NUL`, `DB_HOST=invalid.test`, base sintética y GYG deshabilitado. `helpers/noPostgres.js` bloqueó `pg.Pool`; `scripts/accessScopeNetworkGuard.cjs` bloqueó HTTP/fetch externo del proceso de prueba. Electron solo pudo solicitar recursos del origen loopback del simulador. No se inició `backend/server.js`, no se ejecutó `api.test.js`, ni se cargaron credenciales o proveedores reales.

| Caso solicitado | Verificación |
|---|---|
| 1. Operación existente | Grupo 1 sintético: Unidad 2, 2/12 PAX; ID 9401 como referencia secundaria. También se consultó otra operación con fecha de 2020. |
| 2. Operación recién creada | Se creó grupo 2 mediante el formulario y POST al simulador; luego se agregó su transporte 9402. |
| 3. Transporte con vehículo | Etiquetas iguales en resumen, panel y organización; catálogo existente con IDs 6202/6203. |
| 4. Transporte sin vehículo | Grupo nuevo en 0/12 confirmado; después 2/12 con vehículo pendiente; retiro de vehículo en grupo 1 mostró 4/12 pendiente. |
| 5. Cambio de vehículo | Unidad 2 de 12 plazas → Unidad 3 de 8 → sin vehículo → Unidad 2; actualización del panel y resumen. |
| 6. Cambio de pasajeros | Asignación de una reserva de 2 PAX: 2/12 → 4/12; etiquetas y opciones derivadas del nuevo Daily. |
| 7. Grupos 1 y 2 | Descripciones y operaciones distintas, sin cambiar la identidad funcional de los grupos. |
| 8. Capacidad inferior a 12 | 4/8 y 2/8 con Unidad 3; además se comprobó que capacidad física mayor de 12 no eleva el límite operativo visual. |
| 9. Cancelaciones | Una reserva cancelada de 5 PAX siguió visible, sin sumarse; otra cancelación simulada redujo 4 → 2 tras recuperar foco y consultar nuevamente. |
| 10. Cierre y reapertura | Terminó el primer proceso Electron; se cambió el estado del API en memoria; el segundo mostró Unidad 3 y 6/8 PAX, sin reutilizar datos del renderer anterior. |
| Datos pendientes/cargando | PAX nulo/ausente distinto de cero; retraso sintético de Daily con indicador de carga; capacidad desconocida explícita. |
| Identificadores | Los dos PATCH de asignación utilizaron exactamente 9401 y 9402; las PK del simulador permanecieron iguales; no hubo POST/PATCH de vehículos. |
| ACCESS-SCOPE | Consulta all conserva lectura sin controles de escritura; selected no accede a Operaciones. Regresión backend de alcance, autenticación y aplicación aprobada. |
| Integraciones | Preview sintético aprobado con actividad iniciada y pickup faltante: motivos visibles y botón deshabilitado. Sin solicitudes de aplicación o recepción externa. |

Las suites existentes de capacidad y aplicación corroboran las reglas conservadas dentro de su alcance simulado; no certifican concurrencia de PostgreSQL ni aceptación con datos reales.

## 7. Capturas para aprobación

Se generaron **13 PNG** del frontend real con datos sintéticos, en vistas de 1366×900 y 1024×768. Se verificaron visualmente etiquetas, jerarquía, estados y ajuste de línea. El harness comprueba ausencia de desborde global y de controles fuera de la ventana; las tablas anchas conservan su desplazamiento horizontal existente.

| Evidencia | Captura |
|---|---|
| Operación existente | [Resumen inicial](pre-release-02/resumen-operacion-existente-1366.png) |
| Grupo 1 con unidad | [Unidad 2, 2/12 PAX](pre-release-02/grupo-1-unidad-2-1366.png) |
| Selector con ID original | [Selección de destino](pre-release-02/selector-transporte-1366.png) |
| Reservaciones y cancelada excluida | [Reservaciones asignadas](pre-release-02/reservaciones-asignadas-1366.png) |
| Capacidad real inferior | [Unidad 3, 4/8 PAX](pre-release-02/cambio-unidad-capacidad-8-1366.png) |
| Retiro de vehículo | [Vehículo pendiente](pre-release-02/vehiculo-pendiente-1366.png) |
| PAX desconocidos | [PAX por consultar](pre-release-02/pax-por-consultar-1366.png) |
| Espera de respuesta | [Carga del API simulado](pre-release-02/carga-api-1366.png) |
| Grupo 2 creado en el recorrido | [1366 px](pre-release-02/grupo-2-operacion-nueva-1366.png), [1024 px](pre-release-02/grupo-2-operacion-nueva-1024.png) |
| Resumen de dos grupos | [Vista de 1024 px](pre-release-02/resumen-dos-grupos-1024.png) |
| Motivo de bloqueo de integración | [Aprobado y actividad iniciada](pre-release-02/integracion-aprobada-actividad-iniciada-1024.png) |
| Nuevo proceso Electron | [Estado actual después de reabrir](pre-release-02/reapertura-estado-actual-1366.png) |

Evidencia reproducible en `validacion-cambios.json`, `validacion-reapertura.json` y `api-sintetica.json`, dentro de la misma carpeta. Los JSON contienen solo datos y solicitudes sintéticos. La aprobación visual corresponde al usuario; estas capturas no se presentan como aprobación ya obtenida.

## 8. Restricciones y cierre

Se conservaron asignación manual de reservas y vehículos, grupos 1/2, máximos 12/24, capacidad física, mínimo para asignar vehículo, turnos explícitos, pickups individuales y ACCESS-SCOPE. Solo cambian presentación y renovación del estado del frontend; no se modificaron las validaciones funcionales del servidor.

**Sin conexiones ni modificaciones a PostgreSQL principal/DEV; sin migraciones ni cambios reales; sin sincronizaciones, activaciones, cambios de credenciales, instalador, commit o push.** No hay nuevos vehículos ni etiquetas persistidas. La implementación queda lista para aprobación visual y una futura distribución autorizada del código actualizado.
