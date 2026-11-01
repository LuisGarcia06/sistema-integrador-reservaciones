# Fase 2D.7 — Historial, Bitácora y Notificaciones originales

**Completada en laboratorio.** Las pantallas originales y sus consultas quedaron validadas: **33 suites / 918 pruebas Jest y 22 grupos integrados aprobados**, sin fallos finales. Pasaron Reservaciones (38), Operaciones (17), Transportes (17), Daily (16), comandos (16), revisiones (16) y standalone (6). Daily conserva cuatro PDFs sintéticos con 13 páginas correctas.

Los **12 laboratorios quedaron detenidos**, con **35 puertos sin listeners y ningún proceso asociado**. No se activó producción. Frente al inventario previo se conservaron **509 archivos idénticos, se modificaron 4 archivos, se agregaron 10 de código/pruebas y no se eliminó ninguno**.

Integración exclusivamente de consultas en laboratorio PostgreSQL 020 nuevo/desechable, HTTP 127.0.0.1 y Electron real. No activa producción, no agrega escrituras de negocio ni modifica servicios, esquema, roles o políticas de plataformas. Los resultados definitivos y las huellas están en `local-fase-2d7-verification.json`; evidencias en `local-fase-2d7/`.

1. **Archivos creados y modificados.**

| Archivo existente | Cambio |
|---|---|
| `frontend/pages/dashboard.js` | Hooks optativos del ámbito de consultas: el modal conserva representación original, deja solo Cerrar, deshabilita captura manual y bloquea tanto el despacho de acciones persistentes como la función de mutación. Sin el flag de esta entrada, su HTML y comportamiento anteriores se conservan. |
| `scripts/commandFrontendHost.cjs` | Ámbito explícito `consultas-integradas`, política cerrada y retención/liberación de GET por IPC privado para probar respuestas tardías reales. Los ámbitos anteriores conservan sus políticas. |
| `scripts/reservationFrontendLab.cjs`, `scripts/operationFrontendLab.cjs` | Coordinan el reinicio planificado mediante pausa/drenaje del proxy, como ya hacían Transportes/Daily. Evitan mezclar el ensayo de recuperación con una consulta de sesión interrumpida por su propio reinicio. No cambian clientes/servicios ni reenvían escrituras. |

Archivos nuevos: `frontend/lab/consultas.html`, `consultas.js`, `consultas.css`; `scripts/consultationFrontendPolicy.cjs`, `ConsultationFrontendLab.ps1`, `consultationFrontendApi.cjs`, `consultationFrontendFixtures.cjs`, `consultationFrontendLab.cjs`, `consultationFrontendDriver.cjs`; `backend/__tests__/consultationFrontend.test.js`. Se agregan informe, inventario, respaldos, registros, JSON y capturas en `docs/`.

Historial, Bitácora, Notificaciones, Centro de Avisos, router/app, auth/api y layout originales no se modifican. Tampoco entrada principal, Electron main/preload, CSS comunes, servicios de negocio, rutas/controladores, migraciones ni módulos/protecciones anteriores. Inventario anterior: 513 archivos de código/configuración; copias puntuales en `local-fase-2d7/before/`. No se utilizó reset/clean ni restauración masiva.

2. **Pantallas originales integradas.**

La entrada carga las páginas originales `historial.js`, `bitacora.js`, `dashboard.js` y componentes `notificaciones.js`/`centroAvisos.js`. También reutiliza router, app, layout, auth y cliente HTTP originales. El Centro sigue siendo el componente real del Dashboard y los avisos abren su modal original; no se inventa una pantalla independiente.

El script de laboratorio instala un guard que admite solo GET/HEAD y POST de login. Limita la navegación lateral a Dashboard/Historial/Bitácora; el router original mantiene sus restricciones de rol/alcance. Otros módulos no se cargan ni se sirven. No se carga preload ni existe IPC de producto en estas vistas.

Las pruebas comparan íntegramente los cuatro componentes de consulta con el respaldo y verifican igualdad del HTML del Dashboard fuera del ámbito optativo. Las capturas se esperan tras dos frames y se revisan visualmente.

3. **Inventario de lecturas y escrituras.**

El inventario previo a cargar la entrada está en `local-fase-2d7/INVENTARIO.md`.

| Función | Rutas/efectos permitidos |
|---|---|
| Autenticación | POST `/api/auth/login`; GET `/api/auth/sesion`. Token y usuario en memoria. |
| Historial | GET `/api/tours`, `/api/plataformas`; GET `/api/reservaciones` con paginación, resumen de tours, fecha hasta y filtros originales. Detalle de la fila autorizada en memoria, sin GET adicional. |
| Bitácora | GET `/api/bitacora`, con fechas opcionales. |
| Dashboard dependiente | GET `/api/dashboard/resumen?fecha=...`; conserva su proyección parcial cuando corresponde. |
| Centro | GET `/api/eventos-integracion/centro?...`; GET `/centro/:id/historial?page=...&limit=25`. |
| Detalle de aviso | GET `/api/eventos-integracion/:id` y, cuando corresponde al tipo, `/:id/diff`; catálogo de tours si lo necesita la representación. |
| Campana | GET `/api/eventos-integracion/resumen`; sondeo, pausa/visibilidad, coordinación y actualización manual originales. |
| Visto | IDs/tiempos en localStorage por entorno/usuario. No modifica PostgreSQL. |
| Menú lateral | Preferencia local original de presentación. |

La política valida nombres de parámetros, tipos, fechas, rangos, enums, paginación y ausencia de duplicados/traversal. Permite codificación URL de texto de búsqueda, necesaria para nombres con espacios/acentos; no permite rutas codificadas. No habilita GET de comandos, POST de precondiciones ni rutas generales de otros módulos.

Para demostrar auditoría y actualización, el coordinador privado ejecuta siete comandos sintéticos mediante la API protegida existente. No son funcionalidades ni rutas de escritura expuestas al renderer/proxy. Las entradas de Bitácora provienen de esos servicios; no hay INSERT ficticio de auditoría en fixtures. El informe integrado separa `mutations` del coordinador y `calls` del ámbito de consultas.

4. **Historial verificado.**

Se consultan 32 reservaciones sintéticas históricas, con dos plataformas, dos actividades, turnos y estados variados. Se verifican código exacto, nombre, rango de fechas, tour, turno, plataforma y estado; controles originales de paginación 25/50, resumen por tour, validación de rangos y conservación de filtros en memoria por usuario. El botón Limpiar se conserva íntegro, sin afirmar una comprobación UI adicional específica de ese botón. El corte a ayer permanece; no se incorporan hoy o fechas futuras.

El detalle conserva datos de cliente, pickup, finanzas, estado y motivo de cancelación cuando existe. Se muestra una cancelación real de la API, sin permitir edición desde Historial. El detalle representa la fila consultada, no una nueva consulta actual. Una modificación confirmada posterior se refleja al reconsultar el listado y abrir de nuevo su detalle.

La fecha se filtra mediante el rango existente; no se añade un filtro puntual nuevo. No se añade búsqueda por campos no implementados, edición, exportación o persistencia de borradores.

5. **Bitácora verificada y cobertura real de auditoría.**

El coordinador modifica una reservación y cancela otra mediante precondiciones, UUID, protocolo y recibos confirmados de la API existente. La pantalla original muestra actor/correo, fecha/hora, reservación/código, acción y descripción. Se verifica `habitacion: ANTERIOR -> AUDITADA` y el motivo real de cancelación; un cambio posterior muestra `AUDITADA -> ACTUALIZADA`. Los IDs de auditoría de los recibos corresponden a filas reales.

Bitácora solo tiene filtros por fechas. No tiene paginación ni filtros por actor/acción, ni columnas estructuradas antes/después: los cambios son texto de descripción del servicio. No existe un motivo genérico obligatorio para modificar; el motivo de cancelación sí se conserva. Estas diferencias se documentan sin inventar controles ni campos.

| Servicio/acción existente | Auditoría actual |
|---|---|
| Reservaciones: crear | CREAR con código y actor. |
| Reservaciones: modificar | MODIFICAR con campos anterior/nuevo en descripción. |
| Reservaciones: cancelar | CANCELAR con motivo. |
| Asignar/mover/quitar transporte de reservación | MODIFICAR con relación anterior/nueva. |
| Aplicadores que delegan en esos servicios | Producen la auditoría de la reservación que efectivamente crean/modifican/cancelan. No se habilitan aquí. |
| Controles existentes de publicación de integraciones | INTEGRACION_ACTIVADA/INTEGRACION_PAUSADA con `id_reservacion=null`. Verificados por inspección; no se ejecutan ni activan en esta fase. |
| Revisar/rechazar/archivar evento de integración | No agrega por sí mismo una entrada propia mediante bitacora.service. Escritores bloqueados. |
| Operaciones, Transportes y observaciones generales Daily | Sin bitácora propia. Se confirman comandos sintéticos con `ids_bitacora: []` y se comprueba que el conteo de auditoría no aumenta. |

El ledger durable no se muestra como Bitácora. No se agregan nuevas auditorías, tablas o columnas. La trazabilidad operativa faltante sigue pendiente de autorización independiente antes de producción.

6. **Centro de Avisos y Notificaciones.**

Se verifican pestañas Prioritarios/Pendientes/Histórico, grupos por reservación externa, página siguiente, límite 25/50, búsqueda e historial expandido de un grupo con dos eventos reales sintéticos. Los demás controles de filtro/orden se comprueban presentes y el componente se conserva byte a byte; no se afirma haber ejecutado todas sus combinaciones desde Electron. Los datos separan fecha/hora del servicio y recepción conforme al componente vigente. Las representaciones incompletas conservan sus advertencias originales; consultar un aviso no equivale a registrarlo ni aplicarlo.

La campana conserva contadores/categorías y abre desde Historial el Dashboard y el detalle autorizado original. Visto se registra solo después de consultar el detalle vigente. Su localStorage contiene IDs y tiempos, con clave por entorno/usuario; no contiene un recibo de escritura ni cambia el estado de aplicación/revisión en PostgreSQL. Los hashes de negocio y los conteos de auditoría/ledger se mantienen intactos durante esas consultas y acciones locales.

Se conserva el sondeo original de 60 s con backoff, actualización manual/foco y pausa al ocultar. La prueba reproduce visibilidad de primer plano sobre una ventana Electron oculta; no modifica el componente ni activa servicios externos. Web Locks/BroadcastChannel siguen siendo los originales. No se añade sincronización en tiempo real.

| Acción | Clasificación en esta fase |
|---|---|
| Abrir/cerrar/filtrar/ordenar/paginar/expandir | Consulta o estado transitorio local. |
| Visto | Estado local existente, permitido con autorización. |
| Preferencia de menú | Estado local existente. |
| Aprobar/rechazar evento | PATCH persistente, bloqueado. |
| Aplicar/registrar evento | POST persistente, bloqueado. |
| Archivar | PATCH persistente, bloqueado. |
| Confirmar recepción independiente o nuevas preferencias de avisos | No existe ese control/endpoint; no se inventa. |

El modal deja solo Cerrar, deshabilita captura manual y bloquea el despacho/ejecución de mutaciones. Guard del cliente y política del proxy son barreras adicionales; intentos nativos de esos escritores devuelven 405 sin cambiar PostgreSQL.

7. **Matriz de permisos.**

| Perfil | Historial | Bitácora | Centro/campana/detalle externo | Dashboard |
|---|---|---|---|---|
| Administrador | Sí | Sí | Sí, consulta | Original completo |
| Consulta all | Sí | No | Sí, consulta | Original completo |
| Consulta selected | No | No | No | Proyección parcial por plataformas |
| Consulta selected sin plataformas | No | No | No | Proyección parcial vacía |

Se conserva el bloqueo actual de Historial para selected aunque el requisito general describa consulta de historial. No se amplía por suposición. Se verifican permisos en router original y backend. Las lecturas autorizadas de Reservaciones/catálogos y Dashboard no revelan filas, resumen por tour, plataforma oculta, salidas globales ni contadores ajenos. La plataforma oculta arroja cero resultados; el usuario sin plataformas recibe listados/recientes vacíos y contadores cero.

La revocación durante una respuesta retenida de avisos elimina datos/contador y descarta la respuesta anterior. Logout con una consulta histórica retenida y login de otro usuario tampoco restaura filas o filtros anteriores. Token/usuario no se guardan como borrador; el estado Visto anterior permanece separado por usuario/entorno, como en la implementación original.

8. **Pruebas y resultados.**

La suite aislada contiene 48 pruebas nuevas y reejecuta las 870 anteriores: **33 suites, 918 pruebas aprobadas**. El ensayo integrado definitivo contiene **22 grupos aprobados**, sin fallos. Usa PostgreSQL 020/API reales, ventanas/sesiones Electron separadas y HTTP loopback. Se revisaron visualmente las capturas de Historial, cancelada, Bitácora, Centro, modal y campana.

Los grupos cubren carga/filtros/paginación/detalle de Historial; rangos/memoria; Bitácora real y fechas; Centro original/paginación/Histórico/historial de grupo/modal; Visto local sin efectos en BD; visibilidad; tres casos de respuestas antiguas para Historial/Bitácora/Centro; actualización confirmada reflejada en lecturas; ausencia de auditoría operativa inventada; Consulta all/selected/sin plataformas; revocación; logout/otro usuario; y cierre de escritores/assets.

La retención de GET se realiza en el proxy solo después de recibir una respuesta real de la API. Mientras está retenida se cambia el filtro, se revocan permisos o se cierra sesión. Al liberarla, las guardas originales de requestId/versión/sesión descartan sus datos. No se sustituyen respuestas de negocio por fixtures HTTP ni se inventa autorización.

El JSON integrado contiene **intercambios HTTP reales del ámbito (contador exacto en JSON), 0 escrituras de negocio del renderer/proxy, 7 comandos privados del coordinador y 2 comprobaciones directas de auditoría/ledger**. Los checksums comprueban ausencia de efectos de negocio en consultas, marcado local y escritores bloqueados. Registros finales y cierres se consolidan al terminar las regresiones en `local-fase-2d7-verification.json`.

Incidencia del montaje de regresión: los corredores anteriores de Reservaciones y Operaciones no drenaban lecturas al detener su API. Consultas de sesión coincidieron con el reinicio planificado después de una respuesta truncada, invalidaron correctamente la sesión y cortaron el ensayo. Se reutilizó en esos dos corredores la coordinación de reinicio existente en Transportes/Daily; no se relajó autenticación ni se cambiaron servicios, formularios, recibos o lógica de reenvío. Las primeras ejecuciones fallidas quedaron detenidas y sus registros se conservan. Los ensayos se repitieron en clústeres nuevos.

9. **Compatibilidad con los módulos anteriores.**

Se reejecutan en bases nuevas independientes Reservaciones (38 grupos), Operaciones (17), Transportes (17), Daily (16, incluidos cuatro PDFs), comandos (16), revisiones (16) y standalone (6). No se modifican sus formularios/adaptadores/políticas. El ámbito Daily conserva su generación de PDF original y la impresión de prueba, sin trabajos físicos.

| Resultado definitivo | Evidencia |
|---|---|
| Reservaciones: 38 aprobados | `reservations-final.log`, `reservations-regression.json` |
| Operaciones: 17 aprobados | `operations-final.log`, `operations-regression.json` |
| Transportes: 17 aprobados | `transports-regression.log/json` |
| Daily: 16 aprobados | `daily-regression.log/json`, `daily-pdf/verification.json` |
| Comandos / revisión / standalone: 16 / 16 / 6 aprobados | Registros y JSON respectivos de regresión |
| Consultas: 22 aprobados, 230 intercambios HTTP, 0 escritores de negocio del renderer/proxy | `consultations-final.log`, `integrated-verification.json` |
| Jest: 918 pruebas, 33 suites, 0 fallidas | `jest-final.log/json` |
| Cierre: 12 clústeres, 35 puertos sin listeners, 0 procesos | `closure.json` |

Los PDFs de regresión se verifican por fecha, contenido, número de hojas, logo y ausencia de páginas vacías; la evidencia corresponde a datos sintéticos. No se envían avisos externos, mensajes ni trabajos a impresoras empresariales.

Se renderizaron sus 13 páginas. Las cinco páginas únicas coinciden con el patrón visual validado de 2D.6; las ocho repetidas coinciden con sus páginas equivalentes. Se revisó además una página representativa de la regresión. Ver `daily-pdf/visual-verification.json`. Los dos ensayos iniciales fallidos de reinicio se conservan como incidencia de infraestructura; los resultados definitivos anteriores corresponden a clústeres nuevos con reinicio coordinado.

10. **Aislamiento.**

Verify crea siempre un directorio nuevo con ACL privada y entorno limpio. Reutiliza validación de manifiesto, clúster, identidad/configuración y esquema real 020. No lee el `.env` principal, no utiliza credenciales reales ni accede a `sian_kaan_reservaciones`; no migra bases existentes. Los fixtures se preparan únicamente sobre la base nueva verificada y no insertan Bitácora ficticia.

PostgreSQL/API/proxy se enlazan en 127.0.0.1. El coordinador limita TCP a los puertos propios y bloquea red externa/UDP; Electron deniega permisos, navegación externa y ventanas nuevas. Mantiene sandbox, contextIsolation y webSecurity, sin nodeIntegration ni preload en este ámbito. No modifica firewall, router, LAN, ngrok, certificados, tareas/servicios Windows, integraciones reales ni instaladores.

Los procesos se cierran y PostgreSQL se detiene en finally, también ante error. La comprobación adicional de procesos/listeners reales se guarda en `local-fase-2d7/closure.json`.

11. **Funciones bloqueadas y límites.**

Solo login y lecturas enumeradas. POST/PATCH/PUT/DELETE de negocio, precondiciones/comandos, control de integraciones, administración de usuarios/catálogos y escritores de los demás módulos permanecen bloqueados. Assets de esas pantallas no se sirven. No se presentan como aprobadas la aplicación, aprobación, rechazo, archivo, confirmación de recepción inexistente, nueva auditoría operativa, impresión física, distribución o activación productiva.

Historial conserva el detalle de la consulta, Bitácora sus descripciones textuales y Centro sus advertencias de datos externos incompletos. La falta de auditoría propia de Operaciones/Transportes/Daily y los límites de filtros/paginación de Bitácora son comportamientos actuales documentados, no funcionalidades implementadas silenciosamente.

12. **Ejecución y reversión.**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\ConsultationFrontendLab.ps1 -Mode Verify
```

Cada Verify crea un laboratorio distinto. Si uno queda activo, usar exclusivamente el directorio explícito que produjo el ensayo y sus verificaciones:

```powershell
.\scripts\ConsultationFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

Dejar de iniciar esta entrada retira su disponibilidad experimental. Para retirar código, comparar Dashboard/host y los dos corredores de reinicio contra `local-fase-2d7/before/` y revertir exclusivamente esos hooks/ámbito después de comprobar que no haya trabajo posterior. Los diez archivos nuevos quedan enumerados en el JSON. No usar reset/clean, restauraciones masivas, cambios de huellas para eludir validación ni tocar bases existentes. No hay migración productiva que revertir.

13. **Siguiente fase de auditoría y administración.**

Definir y autorizar por separado qué hechos de Operaciones, Transportes y observaciones Daily deben auditarse, con actor, registro, cambios y motivo cuando corresponda. Incorporar esa trazabilidad en la misma transacción que la escritura y el comando durable; no agregar llamadas independientes de auditoría desde frontend ni presentar el ledger como historial humano.

Después inventariar Usuarios/Configuración y sus escritores reales antes de integrar sus formularios originales con permisos, precondiciones, confirmación e idempotencia. Mantener bloqueados los controles externos que no estén integrados de extremo a extremo. Resolver las decisiones productivas pendientes y aceptación/distribución en su propio alcance; esta fase no autoriza publicar ni activar integraciones.
