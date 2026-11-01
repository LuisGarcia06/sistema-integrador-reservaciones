# Fase 2D.2 — Cancelación y transporte de reservaciones

Integración local completada y validada el 27 de octubre de 2026. Solo está disponible en el laboratorio integrado. No se activó en `frontend/index.html`, no se conectó la instalación principal al esquema 020 y no se desplegó en producción.

1. **Archivos creados y modificados.**

Se registraron hashes de **817 archivos** antes de editar. Cambiaron diez archivos relacionados; los otros **807 conservaron exactamente su contenido**, sin eliminaciones. Los cambios locales anteriores y archivos sin seguimiento se conservaron. Las diez copias iniciales están en `docs/local-fase-2d2/before/`; los hashes iniciales/finales, en `docs/local-fase-2d2-before.json` y `docs/local-fase-2d2-verification.json`.

| Archivo modificado | Cambio |
| --- | --- |
| `frontend/pages/reservaciones.js` | Cancelación protegida en el modal original; acceso de transporte solo con adaptador; detalle original y controles compartidos; limpieza y reconstrucción tras decisión. |
| `frontend/js/reservationCommands.js` | Coordina las tres intenciones con el mismo CommandSession, comparador, recibo, confirmaciones y recuperación. Selección autorizada y renovación explícita de destinos. |
| `frontend/js/commandLab.js` | Permite comparar mediante GET también las rutas cancelar/transporte; conserva el comportamiento predeterminado de perfiles anteriores. |
| `frontend/js/transportesUi.js` | Recibe los controles originales Asignar/Mover/Quitar asignación y el lector de selección, sin solicitudes HTTP. |
| `frontend/pages/operaciones.js` | Sus filas delegan esos fragmentos al módulo compartido. No se modificaron sus envíos, reglas ni permisos. |
| `frontend/lab/reservaciones.html` | Carga la presentación compartida y actualiza el aviso de alcance. No define otro formulario de reservaciones. |
| `scripts/reservationFrontendPolicy.cjs` | Autoriza las dos rutas PATCH adicionales y dos lecturas exactas para selección. |
| `scripts/reservationFrontendLab.cjs` | Extiende el mismo corredor con fixtures, huellas de negocio y evidencia de auditoría. |
| `scripts/reservationFrontendDriver.cjs` | Conserva los nueve grupos de edición y ejecuta los casos de acciones adicionales. |
| `backend/__tests__/reservationFrontend.test.js` | Adapta las comprobaciones de rutas exactas y extiende comparación por GET a las tres acciones. |

| Archivo creado | Función |
| --- | --- |
| `scripts/reservationActionsFixtures.cjs` | Reservaciones, grupos, vehículos y tercer administrador sintéticos, únicamente durante el aprovisionamiento del clúster nuevo. |
| `scripts/reservationActionsCases.cjs` | Pruebas de cancelación, transporte, concurrencia, recuperación, negocio y permisos con Electron real. |
| `backend/__tests__/reservationActions.test.js` | Regresión del HTML de Operaciones, restricciones de rutas y reglas originales de capacidad. |

También se crearon este informe, inventario previo, respaldos, registros, informes JSON y capturas sintéticas dentro de `docs/local-fase-2d2/`. No cambiaron el esquema, las migraciones, los servicios de reservaciones/capacidad/comandos, el contrato del backend, el cliente HTTP, la autenticación ni las integraciones.

2. **Formularios originales integrados.**

Cancelar sigue abriendo `renderCancelDialog`: código, cliente, motivo obligatorio, Volver y Confirmar cancelación. Antes de abrirlo se obtiene una foto autorizada específica de `/cancelar`; no se utiliza la fila del listado como foto para escribir. Cancelar requiere una segunda confirmación explícita y solo muestra resultado confirmado cuando existe un recibo durable.

El flujo original de transporte estaba en las filas de organización de Operaciones. Se extrajeron sus controles y lector al módulo `transportesUi.js`, ya utilizado por la aplicación. Operaciones consume las mismas funciones y conserva exactamente el HTML de sus filas. En el laboratorio, esos controles se montan en el detalle original de Reservaciones, con sus campos en lectura. No se sirve ni se monta la página Operaciones, ni se crea otro formulario de demostración.

La acción Transporte aparece en Reservaciones únicamente si está cargado el adaptador del laboratorio y el usuario es Administrador. La entrada principal sigue sin cargarlo.

3. **Reglas comerciales conservadas.**

El backend existente conserva la transacción de datos, bitácora y comando. No se añadieron reglas ni asignaciones automáticas. Se preservan fecha, tour y turno explícito compatibles; relación reservación/operación/transporte/vehículo; capacidad real del vehículo; máximo operativo 12; máximo 24 por tour/fecha/turno; mínimo de 2 activos en transportes con vehículo; y comprobaciones de origen y destino al mover o quitar asignación.

PAX ya incluye niños: se comprobó una asignación con PAX=2 y un niño que suma **2**, y una reservación cancelada con PAX=8 y tres niños que aporta **0 activos**. El estado Cancelada se conserva al asignar transporte. No se altera la lógica de histórico, estado o Daily. Las reglas están en los servicios originales sin cambios.

Los destinos proceden de GET autorizados y se filtran por la fecha, tour y turno de la foto. El identificador actual se excluye de los destinos de movimiento. Las opciones no disponibles no se convierten en asignaciones; el backend vuelve a validar al guardar. El presentador conserva «PAX por consultar» cuando el endpoint no proporciona ese conteo; no inventa ocupación o capacidad disponible.

4. **Cobertura de cancelación y transporte.**

El host integrado admite exactamente estos escritores:

```text
PATCH /api/reservaciones/:id
PATCH /api/reservaciones/:id/cancelar
PATCH /api/reservaciones/:id/transporte
```

Cada solicitud exige protocolo, generación, UUIDv4, If-Match e If-Operational-Match. Las únicas lecturas nuevas son:

```text
GET /api/operaciones?fecha=YYYY-MM-DD
GET /api/transportes?id_operacion_tour=<entero positivo>
```

La política rechaza métodos, parámetros adicionales, sufijos y rutas no contemplados. No permite crear o editar transportes, vehículos u operaciones. Las rutas de precondiciones solo aceptan escritores de este ámbito y siguen pasando por la API protegida original.

5. **Manejo de conflictos.**

Se conserva la foto original, propuesta, ETag, contexto y generación. Un 412 o 409 no reconstruye ni sobrescribe los controles. Se muestra el comparador compartido con original/propuesta/actual y se conserva motivo o destino seleccionado. El actual se consulta mediante GET; no se pide otra precondición para alimentar el comparador.

Revisar exige confirmar la preparación de otra intención. Solo después obtiene otra foto, renueva los destinos autorizados cuando corresponde y conserva la propuesta para revisión. Utilizar información actual exige confirmar el descarte. Cancelar esas decisiones conserva clave/foto/controles y no consulta precondiciones nuevas. La nueva intención no escribe hasta otra confirmación explícita y recibe otra UUID.

Si falla renovar destinos después de la decisión, el formulario queda bloqueado; no se permite guardar desde un selector sin verificar. Nunca existe opción de ignorar conflictos.

6. **Recuperación de comandos.**

Las tres acciones reutilizan `CommandSession`, su sobre profundo inmutable y la guardia privada del cliente HTTP. Un doble gesto de cancelación no genera dos envíos. Tras una respuesta perdida se conservan intención y formulario, se bloquea otro guardado y se permite consultar el identificador/generación originales mediante GET `/api/comandos/:clave`.

La cancelación o asignación solo se considera confirmada con evidencia de recibo. Los rechazos durables permanecen visibles para revisar. Un desconocido sigue no concluyente y no habilita reenvío, otra clave o cierre/sustitución del modal desde la aplicación. No hay reintentos automáticos, y el recibo nunca se utiliza como ETag.

La autenticación y revocación de permisos siguen invalidando el estado anterior. Las referencias y borradores permanecen únicamente en memoria; cerrar la ventana o perder sesión destruye esa referencia local. No se implementó recuperación persistente.

7. **Pruebas ejecutadas y resultados.**

| Verificación final | Resultado |
| --- | --- |
| Jest aislado con guardias PostgreSQL/red | **28 suites, 755 pruebas aprobadas**, 0 fallidas. |
| Electron real + formularios originales + API normal + PostgreSQL 020 nuevo | **25 grupos aprobados**: nueve de edición y dieciséis de acciones adicionales. |
| Regresión del frontend de comandos anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Regresión del frontend de revisiones anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Perfil independiente anterior y Electron principal contra su backend sintético propio | **6 comprobaciones aprobadas**, sin esquema 020 en ese perfil. |

Los dieciséis grupos adicionales comprueban:

- Motivo obligatorio, confirmación cancelable, doble gesto, responsable, recibo y repetición con la misma clave.
- Dos administradores cancelando simultáneamente: una cancelación y bitácora, un rechazo 412 con motivo conservado.
- Cancelación de una reservación modificada y contexto 409; revisión explícita sin precondiciones anticipadas.
- Respuesta truncada después de COMMIT y recuperación GET para cancelación y transporte, por separado.
- Desconocido sin reenvío ni cambio de clave para ambas operaciones.
- Destino obligatorio, asignación válida y repetición idempotente; niños incluidos en PAX.
- Mover y Quitar asignación con los controles originales y confirmaciones propias.
- Dos administradores asignando destinos con vehículos simultáneamente: una asignación y rechazo 412 conservando selección.
- Rechazos por capacidad real, máximo 12, mínimo de origen/destino y mínimo al cancelar, sin cambios parciales.
- Contexto 409 de transporte y revisión confirmada que renueva destinos y conserva selección.
- Dos grupos alcanzando **12+12=24**, con rechazo sin cambios al intentar agregar otro pasajero.
- Destinos incompatibles por fecha/tour/turno excluidos del selector; tres sondas de cliente manipulado rechazadas también por el backend sin cambios.
- Reservaciones canceladas conservando su estado y capacidad activa cero.
- Consulta sin acciones; plataforma oculta sin posibilidad de obtener precondiciones; permisos revocados invalidando la selección.

Las sondas incompatibles utilizan CommandSession y el contrato completo para omitir deliberadamente la validación del selector; no son un formulario alternativo ni una relajación del servidor. El resto de los flujos se opera mediante los controles originales en Electron.

La regresión aislada compara las filas completas originales y actuales de Operaciones con Administrador/Consulta, carga activa/inactiva, reservación activa/cancelada y uno/dos transportes. Conserva además las comparaciones del formulario original y PATCH heredado de 2D.1. Se verifican directamente las fronteras 24/25 y 12/13 de las reglas originales sin modificarlas.

Ejecución reproducible, siempre sobre otro clúster nuevo:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\ReservationFrontendLab.ps1 -Mode Verify
```

8. **Evidencia de ausencia de duplicados y cambios parciales.**

`integrated-verification.json` contiene 24 comprobaciones del observador: clave, reservación, número de comandos/entradas de bitácora, actor, descripción, envíos upstream, huella del cuerpo y PAX del transporte cuando corresponde. La cancelación y asignación repetidas con la misma clave conservan **un comando y una bitácora**. En las respuestas perdidas posteriores a COMMIT, la recuperación mantiene **un envío upstream, un comando y una bitácora**.

Las intenciones distintas que compiten pueden registrar un comando confirmado y otro rechazado durable; eso no representa dos efectos de negocio. Se comprobó una sola cancelación/asignación y bitácora en cada carrera.

Para los rechazos se calcularon huellas de todas las tablas de negocio **incluida bitácora**, excluyendo únicamente la tabla de comandos durables. Las huellas antes/después coinciden. Cinco pruebas explícitas de rechazo están en `actionProofs` con sus hashes y claves; las comprobaciones restantes constan en los asserts del corredor y la traza. Un rechazo puede crear su recibo durable, pero no deja modificación parcial del negocio ni auditoría falsa.

Las capturas sintéticas incluyen cancelación confirmada y 412, cancelación/transporte recuperados, asignación y conflicto de transporte, además de las seis capturas de edición anteriores.

9. **Compatibilidad con Fase 2D.1.**

Se repitieron sus nueve grupos sobre el formulario original de 22 controles: validación, guardado, revisión BIGINT, 412, 409, recuperación, desconocido, alcance y permisos durante respuesta. Continúan aprobados. El host ahora amplía exclusivamente las dos acciones autorizadas; la edición conserva su comportamiento y protocolo.

El frontend principal no carga el adaptador y no muestra la acción nueva de transporte. Su modal de cancelación conserva la ruta heredada cuando no existe adaptador. Los componentes de comandos/revisiones anteriores conservan sus políticas por defecto y verificaciones de perfil/esquema: sus regresiones reales pasaron. No se modificaron manifiestos o huellas para reutilizar configuraciones incompatibles.

10. **Aislamiento confirmado e incidencias.**

Se amplió únicamente el harness de 2D.1, previa revisión del [inventario](local-fase-2d2/INVENTARIO.md). Cada Verify crea directorio privado con ACL, clúster nuevo, datos/usuarios sintéticos, generación propia y esquema 020 comprobado. La API inicia por su entrada normal, conservando verificaciones de identidad, huellas, esquema, permisos y protocolo. El observador solo conecta al clúster recién creado.

Todo escucha en 127.0.0.1. Host/Origin, CSP, rutas, métodos, parámetros, assets y cabeceras mantienen listas cerradas. Electron conserva sandbox, contextIsolation, webSecurity y nodeIntegration desactivado, sin preload privilegiado, sin navegación/ventanas/permisos o tráfico fuera de su origen. Ningún secreto PostgreSQL llega al renderer.

No se accedió a `sian_kaan_reservaciones`, no se usaron datos o credenciales reales y no se migraron bases existentes. No cambiaron integraciones, receptores, sincronizadores, ngrok, tareas Windows, firewall, router, LAN, servicios o instaladores. La regresión del Electron principal usó el perfil independiente anterior en su propio clúster sintético, nunca el perfil 020.

Durante las iteraciones se corrigieron únicamente fixtures que omitían descripción/fechas obligatorias, y un identificador duplicado al añadir dos vehículos sintéticos. No se cambió el esquema para aceptarlas. La ejecución completa previa pasó 23 grupos; la final pasó 25 incluyendo renovación de transporte y frontera de 24 PAX. No quedan fallos de las verificaciones finales.

Se crearon ocho directorios/clústeres durante esta fase: cinco iteraciones integradas, incluidas tres de aprovisionamiento fallido, y tres regresiones. Todos están detenidos; los **20 puertos registrados están sin listeners y no quedan procesos asociados**, según `closure.json`. Los secretos permanecen en los directorios privados y no se copiaron a las evidencias.

11. **Funcionalidades todavía pendientes.**

Permanecen bloqueados en el host integrado los demás escritores: altas de reservaciones, administración de operaciones/transportes/vehículos/catálogos/usuarios, Daily, contraseñas e integraciones. Tampoco se habilitan impresión ni los once escritores pendientes del frontend experimental anterior. No se implementaron persistencia de borradores, offline, instaladores, servicios o LAN real.

La integración está completa para las tres acciones autorizadas de Reservaciones dentro del laboratorio. Falta su futura aceptación y validación física con dos equipos antes de plantear distribución o activación productiva. Las pruebas en una computadora no sustituyen esa validación.

12. **Procedimiento de reversión.**

Los ensayos finalizaron detenidos. Si una ejecución futura se interrumpe, identificar y cerrar únicamente sus procesos y detener su directorio validado:

```powershell
.\scripts\ReservationFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Stop conserva la validación de manifiesto/código. No editar hashes para eludirla ni aplicar Stop a instalaciones ajenas. Las configuraciones no se reutilizan tras modificar sus fuentes.

Para revertir código, retirar selectivamente este parche de los diez archivos y los tres archivos de implementación/pruebas creados, conservando las evidencias. Las copias iniciales preservan 2D.1 y el trabajo previo. Restaurarlas completas solo si los archivos actuales coinciden con los hashes finales registrados; si hubo cambios posteriores, hacer reversión selectiva. Revertir conjuntamente los consumidores de Operaciones y los métodos compartidos de transportesUi para mantener su correspondencia. No utilizar reset, clean ni restauraciones masivas. No se necesita migración inversa ni operación alguna sobre una base existente.
