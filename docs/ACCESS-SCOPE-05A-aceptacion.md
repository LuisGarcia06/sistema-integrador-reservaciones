# ACCESS-SCOPE-05A — Matriz de aceptación humana

Revisada en ACCESS-SCOPE-05B.1 el 14/10/2026 (America/Cancun).
**35 casos PENDIENTES; ninguno ejecutado ni aprobado por una persona.**
La evidencia automática de 05A se conserva separada y no sustituye esta matriz.

Laboratorio Windows exclusivo, identificado y autorizado; sin empresa/proveedores,
cuentas/reservas reales o impresión física. Véase [preparación 05B.1](ACCESS-SCOPE-05B-preparacion.md).
No crear/arrancar VM ni instalar programas por la mera existencia de este plan.

Responsable: __________  Host/VM/snapshot: __________  Fecha/hora: __________
Artefacto/SHA-256: __________  Anterior/SHA-256/esquema: __________
Cluster (host/puerto/base/usuario/data_directory/system_identifier): __________
Fixture/SHA-256/fecha/IDs/oráculo: __________  Evidencia exportada: __________

Perfiles: A Administrador; A2 Administrador auxiliar; B Consulta all;
C Consulta selected GetYourGuide/FareHarbor; D Consulta selected vacío.
IDs/fechas se obtienen del manifest local. Base nueva con schema.sql completo:
no repetir 016. Nunca ejecutar como preparador los validadores previos que abren
companySnapshot; usar fixture local revisado o respaldo sintético aprobado.

Secuencia: M01/M02/M03, M05/M06 y después M04; M07–M15; M16–M22;
M23–M26; M27–M30; M31–M34; M35. Restaurar fixture/permisos antes de cada
bloque y conservar evidencia antes de revertir. M31 exige anterior calificado.
M20/M21/M26 requieren sesiones independientes y A2; no simular cambios de permisos.
Registrar ruta real de UI/API; no inventar /api/historial. API dentro del invitado;
no registrar JWT, Authorization, password/config sensible ni hashes de contraseña.

Cada caso contiene los ocho campos exigidos y resultado observado. Mientras no
se ejecute, conservar PENDIENTE; motivos bloqueantes son un campo separado.
Tras ejecución humana registrar APROBADO/FALLIDO/BLOQUEADO, fecha, responsable,
resultado real y enlaces a evidencia. Un caso indispensable bloqueado impide
aceptación; no aprobar con inferencias del código o pruebas automáticas.

## M01 — Identificar un laboratorio separado de la empresa

- **Identificador:** M01.
- **Objetivo:** Identificar un laboratorio separado de la empresa.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Registrar host, VM, discos, NIC y autorización. 2. Verificar identidad del cluster invitado y backup sintético restaurado. 3. Revisar que no hay montajes/conexiones empresariales.
- **Resultado esperado:** Destino Windows y PostgreSQL exclusivos del laboratorio; no producción ni red externa.
- **Evidencia requerida:** Autorización, configuración VM, consultas de identidad, hash y restauración de backup sintético.
- **Criterio de aprobación:** Todas las identidades coinciden con el manifest y no hay acceso/montaje productivo.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M02 — Comprobar identidad del artefacto y controles Windows

- **Identificador:** M02.
- **Objetivo:** Comprobar identidad del artefacto y controles Windows.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Calcular SHA-256 dentro de VM. 2. Consultar firma Authenticode. 3. Registrar controles/advertencias al iniciar el flujo autorizado, sin desactivarlos.
- **Resultado esperado:** Hash 596b86a5760fa7dbea4c386f0f130ded4c1a10da54bac2da97fc06999e9497f0 y NotSigned para el artefacto 05A.
- **Evidencia requerida:** Salida hash/firma y captura de advertencias/políticas aplicadas.
- **Criterio de aprobación:** Hash exacto, firma registrada honestamente y controles intactos; un bloqueo no se da por aprobado.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M03 — Instalar por primera vez mediante NSIS

- **Identificador:** M03.
- **Objetivo:** Instalar por primera vez mediante NSIS.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Restaurar S1 sin app y registrar estado inicial. 2. Instalar NSIS normal con cuenta sintética. 3. Revisar ruta, recursos, entrada de desinstalación y accesos.
- **Resultado esperado:** Instalación por usuario finaliza sin errores y sin afectar otra instalación/cuenta.
- **Evidencia requerida:** Capturas wizard, ruta real, inventario previo/posterior y versión/hash instalado.
- **Criterio de aprobación:** Wizard completado, recursos/accesos/registro de esa copia presentes y ningún destino ajeno alterado.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M04 — Validar arranque desde un acceso Windows instalado

- **Identificador:** M04.
- **Objetivo:** Validar arranque desde un acceso Windows instalado.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Completar M05/M06 y confirmar 3000 libre. 2. Abrir acceso instalado. 3. Revisar ventana, PID/ruta del backend y listeners.
- **Resultado esperado:** Electron y Express empaquetados arrancan desde la instalación sin consola innecesaria.
- **Evidencia requerida:** Captura ventana, destino del acceso, procesos/rutas/listeners.
- **Criterio de aprobación:** Arranque sin herramientas de desarrollo ni consola auxiliar; backend pertenece a esta instalación y DB invitada.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M05 — Rechazar configuración ausente o incompleta

- **Identificador:** M05.
- **Objetivo:** Rechazar configuración ausente o incompleta.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Con app cerrada y 3000 libre, abrir sin config.env. 2. Registrar mensaje y ruta userData. 3. Repetir con solo DB_HOST configurado. 4. Restaurar config local al finalizar.
- **Resultado esperado:** Errores claros de configuración; no sesión ni backend propio conectado mediante fallback.
- **Evidencia requerida:** Capturas de ambos errores y procesos/listeners antes/después; nombres de claves, sin secretos.
- **Criterio de aprobación:** Ambas variantes impiden acceso y no reutilizan conexión ajena; ruta real de config identificada.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M06 — Usar únicamente configuración PostgreSQL sintética

- **Identificador:** M06.
- **Objetivo:** Usar únicamente configuración PostgreSQL sintética.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Preparar config.env con identidad exacta del cluster invitado y flag GYG_GMAIL_SYNC_ENABLED=false. 2. Revisar ausencia de variables heredadas ajenas. 3. Abrir y verificar destino por proceso/cluster/lecturas.
- **Resultado esperado:** Config del perfil Windows normal dirige el backend solo a DB sintética; integraciones inactivas.
- **Evidencia requerida:** Ruta/ACL y claves sin valores sensibles, identidad DB, procesos/conexiones y manifest.
- **Criterio de aprobación:** Todos los parámetros efectivos coinciden con laboratorio y no hay secretos ni conexiones productivas.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M07 — Conservar acceso funcional del Administrador

- **Identificador:** M07.
- **Objetivo:** Conservar acceso funcional del Administrador.
- **Perfil:** A.
- **Pasos de ejecución:** 1. Iniciar sesión desde acceso instalado. 2. Revisar nombre/rol/menú. 3. Abrir módulos administrativos existentes.
- **Resultado esperado:** Perfil Administrador correcto y acceso administrativo actual.
- **Evidencia requerida:** Capturas de sesión/menú/módulos y GET sesión sin token.
- **Criterio de aprobación:** Identidad correcta; todos los módulos esperados abren sin ampliar permisos de otros perfiles.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M08 — Conservar lectura de Consulta all sin escritura

- **Identificador:** M08.
- **Objetivo:** Conservar lectura de Consulta all sin escritura.
- **Perfil:** B.
- **Pasos de ejecución:** 1. Iniciar sesión B. 2. Consultar reservas de todas las plataformas e Historial. 3. Revisar ausencia de acciones de edición. 4. Intentar POST/PATCH sintéticos por API.
- **Resultado esperado:** Lectura completa según permisos de Consulta; administración/escrituras rechazadas.
- **Evidencia requerida:** Listado comparado con manifest, Historial, menú y respuestas 403 sin JWT.
- **Criterio de aprobación:** Incluye plataformas ajenas a C; escrituras 403 y sin cambios SQL/bitácora.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M09 — Limitar navegación de Consulta selected

- **Identificador:** M09.
- **Objetivo:** Limitar navegación de Consulta selected.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Restaurar asignaciones GetYourGuide/FareHarbor. 2. Iniciar sesión C. 3. Revisar menú y abrir pantallas disponibles.
- **Resultado esperado:** Solo Dashboard y Reservaciones en menú; identidad selected y IDs correctos.
- **Evidencia requerida:** Capturas menú/perfil y GET sesión saneado.
- **Criterio de aprobación:** Solo dos pantallas permitidas y asignaciones exactas del manifest.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M10 — Fallar de forma cerrada con selected vacío

- **Identificador:** M10.
- **Objetivo:** Fallar de forma cerrada con selected vacío.
- **Perfil:** D.
- **Pasos de ejecución:** 1. Iniciar sesión D sin asignaciones. 2. Consultar Dashboard/Reservaciones. 3. Pedir detalle de una reserva existente por API.
- **Resultado esperado:** Cero reservas/conteos/PAX; detalle 404; ningún fallback all.
- **Evidencia requerida:** Capturas estados vacíos, respuestas HTTP y oráculo local.
- **Criterio de aprobación:** Todas las métricas de reservas son cero, listado vacío y detalle 404 sin datos.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M11 — Bloquear módulos excluidos también en backend

- **Identificador:** M11.
- **Objetivo:** Bloquear módulos excluidos también en backend.
- **Perfil:** C/D.
- **Pasos de ejecución:** 1. Intentar hashes directos de Historial, Daily, Operaciones, Transportes, Pendientes, Usuarios y Bitácora según router real. 2. Pedir API reales correspondientes. 3. Repetir sin token.
- **Resultado esperado:** UI no presenta datos; GET Daily/Operaciones/Transportes/eventos-integracion/Usuarios/Bitácora devuelven 403; sin token 401. Historial usa API existente, no /api/historial.
- **Evidencia requerida:** Capturas por módulo, rutas reales y respuestas saneadas.
- **Criterio de aprobación:** Cada módulo excluido denegado en UI/API; ninguna respuesta incluye datos ocultos.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M12 — Filtrar todas las métricas y recientes del Dashboard

- **Identificador:** M12.
- **Objetivo:** Filtrar todas las métricas y recientes del Dashboard.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Fijar fechas del manifest. 2. Calcular métricas autorizadas por SQL local. 3. Comparar totales/PAX/resumen/recientes en Dashboard y API.
- **Resultado esperado:** Resumen parcial calculado solo con GetYourGuide/FareHarbor; sin marcadores OCULTA-.
- **Evidencia requerida:** Captura Dashboard, respuesta resumen y oráculo SQL.
- **Criterio de aprobación:** Cada métrica y reciente coincide con oráculo autorizado; cero datos de plataformas excluidas.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M13 — Aplicar alcance a búsquedas y fecha histórica

- **Identificador:** M13.
- **Objetivo:** Aplicar alcance a búsquedas y fecha histórica.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Buscar nombre y código visible. 2. Buscar marcador OCULTA-. 3. Filtrar fecha/rango histórico de 2020 que contiene reserva autorizada.
- **Resultado esperado:** Solo registros autorizados; históricos siguen consultables; búsqueda oculta no muestra resultados.
- **Evidencia requerida:** Capturas filtros/resultados, requests y oráculo por búsqueda.
- **Criterio de aprobación:** Coincidencia exacta de IDs autorizados en cada filtro, incluyendo histórico.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M14 — Filtrar antes de contar y paginar

- **Identificador:** M14.
- **Objetivo:** Filtrar antes de contar y paginar.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Combinar fecha, tour, plataforma y estado del manifest. 2. Paginar API/UI con limit=25 sobre al menos 30 autorizadas. 3. Pedir plataforma no asignada y página fuera de rango.
- **Resultado esperado:** Total/páginas/metadata solo del alcance; filtro no asignado vacío, sin alterar permisos.
- **Evidencia requerida:** Capturas de páginas, filtros, totales y respuestas comparadas con oráculo.
- **Criterio de aprobación:** Sin duplicados/omisiones entre páginas ni conteos/metadatos de plataformas ocultas.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M15 — Evitar enumeración mediante detalle

- **Identificador:** M15.
- **Objetivo:** Evitar enumeración mediante detalle.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Abrir detalle autorizado. 2. Pedir ID de reserva oculta conocida. 3. Pedir ID positivo inexistente confirmado en fixture.
- **Resultado esperado:** Detalle autorizado 200; oculta e inexistente 404 sin datos identificativos.
- **Evidencia requerida:** Captura detalle y respuestas de los tres IDs.
- **Criterio de aprobación:** Autorizada completa; las dos 404 no revelan cliente/código/plataforma.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M16 — Crear usuarios con alcance explícito

- **Identificador:** M16.
- **Objetivo:** Crear usuarios con alcance explícito.
- **Perfil:** A.
- **Pasos de ejecución:** 1. Crear Consulta all y selected con plataformas desde catálogo. 2. Crear selected vacío. 3. Intentar Consulta sin modo explícito.
- **Resultado esperado:** Cuentas válidas persisten con modo/IDs exactos; vacío permanece restringido; falta de modo se rechaza.
- **Evidencia requerida:** Formularios, respuestas creación y consultas SQL de usuarios/puente sin password hashes.
- **Criterio de aprobación:** Persistencia exacta de los tres modos; rechazo sin modo y ningún alta parcial.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M17 — Actualizar alcance de forma consistente

- **Identificador:** M17.
- **Objetivo:** Actualizar alcance de forma consistente.
- **Perfil:** A.
- **Pasos de ejecución:** 1. Agregar y retirar plataforma de C. 2. Cambiar all→selected→all en cuenta de prueba. 3. Probar duplicado/ID inexistente y revisar persistencia.
- **Resultado esperado:** Cambios coherentes y atómicos; all sin puente residual; inválidos rechazados sin cambios parciales.
- **Evidencia requerida:** Capturas, PATCH saneados y estado SQL antes/después.
- **Criterio de aprobación:** Cada transición coincide; inválidos no alteran usuario ni puente.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M18 — Controlar cambio de rol y último Administrador

- **Identificador:** M18.
- **Objetivo:** Controlar cambio de rol y último Administrador.
- **Perfil:** A/A2.
- **Pasos de ejecución:** 1. Con A/A2 activos, convertir auxiliar a Consulta indicando alcance. 2. Intentar conversión sin alcance explícito. 3. Intentar degradar/desactivar último Administrador activo.
- **Resultado esperado:** Conversión válida explícita; entradas inválidas y pérdida del último Administrador rechazadas.
- **Evidencia requerida:** Formulario, respuestas y consulta local de roles/cuentas activas.
- **Criterio de aprobación:** Conversión correcta; siempre permanece Administrador activo y rechazo sin cambios indebidos.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M19 — Impedir autoconcesión de permisos

- **Identificador:** M19.
- **Objetivo:** Impedir autoconcesión de permisos.
- **Perfil:** B/C.
- **Pasos de ejecución:** 1. Capturar estado propio. 2. Intentar PATCH rol/alcance/plataformas propios y de tercero. 3. Intentar alta de usuario por API.
- **Resultado esperado:** 403 en administración de usuarios para Consulta; estado sin cambios.
- **Evidencia requerida:** Requests/respuestas sin Authorization y estado SQL previo/posterior.
- **Criterio de aprobación:** Todos los intentos denegados y ninguna asignación/rol nuevo persistido.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M20 — Aplicar revocación inmediata en API y al volver a foco

- **Identificador:** M20.
- **Objetivo:** Aplicar revocación inmediata en API y al volver a foco.
- **Perfil:** A/C.
- **Pasos de ejecución:** 1. Restaurar C con dos plataformas y mantener sesiones Windows independientes. 2. Abrir en C detalle de plataforma que se retirará. 3. A revoca esa plataforma. 4. Pedir detalle/listado con token anterior; volver a foco C.
- **Resultado esperado:** Detalle revocado 404 y listados ya excluyen plataforma; foco limpia detalle y métricas antiguas.
- **Evidencia requerida:** Cronología, captura antes/después y HTTP con mismo token sin divulgarlo.
- **Criterio de aprobación:** Nueva petición aplica revocación inmediatamente; tras foco no quedan datos revocados en pantalla.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M21 — Detectar revocación por renovación periódica

- **Identificador:** M21.
- **Objetivo:** Detectar revocación por renovación periódica.
- **Perfil:** A/C.
- **Pasos de ejecución:** 1. Restaurar C y abrir detalle autorizado. 2. Mantener C visible y sin interacción. 3. A revoca desde sesión independiente. 4. Medir siguiente ciclo sin modificar timer.
- **Resultado esperado:** Renovación normal de 30 s detecta cambio y retira datos.
- **Evidencia requerida:** Video/capturas con tiempos y registro de GET sesión sin JWT.
- **Criterio de aprobación:** El siguiente ciclo efectivo detecta cambio y limpia datos; registrar latencia real, no simular reloj.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M22 — Evitar respuestas de una sesión anterior

- **Identificador:** M22.
- **Objetivo:** Evitar respuestas de una sesión anterior.
- **Perfil:** C/D.
- **Pasos de ejecución:** 1. Con fixture restaurado, iniciar solicitud C y observarla en vuelo usando throttling solo invitado si hace falta. 2. Cerrar sesión y entrar D antes de resolver. 3. Dejar completar la solicitud y revisar UI.
- **Resultado esperado:** Respuesta vieja no reaparece en sesión D ni tras navegación/renovación.
- **Evidencia requerida:** Cronología petición/logout/login/respuesta y captura final.
- **Criterio de aprobación:** D permanece vacío sin ningún dato C; repetir si no se logró solicitud concurrente real.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M23 — Revisar impresión de reserva autorizada sin envío físico

- **Identificador:** M23.
- **Objetivo:** Revisar impresión de reserva autorizada sin envío físico.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Abrir reserva visible del manifest. 2. Invocar impresión y revisar vista previa. 3. Cancelar salida física; si se autoriza, guardar solo PDF sintético.
- **Resultado esperado:** Documento correcto/legible de reserva autorizada; ningún trabajo físico.
- **Evidencia requerida:** Capturas preview, archivo temporal si existe y comprobación de cero trabajos físicos.
- **Criterio de aprobación:** Cliente/código/nota autorizados legibles, sin recortes ni datos ocultos; no impresión física.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M24 — Bloquear impresión oculta y exportación Daily por IPC

- **Identificador:** M24.
- **Objetivo:** Bloquear impresión oculta y exportación Daily por IPC.
- **Perfil:** C/D.
- **Pasos de ejecución:** 1. Intentar imprimir ID oculto mediante flujo de detalle. 2. En consola del renderer instalado invocar desktopAPI.exportDailyPdf con fecha sintética. 3. Revisar archivos/diálogos.
- **Resultado esperado:** Detalle oculto 404; IPC Daily devuelve denegación y no genera documento.
- **Evidencia requerida:** Respuesta detalle/IPC saneada, captura e inventario de carpeta PDF.
- **Criterio de aprobación:** Cero archivos/documentos ocultos y Daily denegado también por IPC directo.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M25 — Guardar y revisar PDF Daily con diálogo real

- **Identificador:** M25.
- **Objetivo:** Guardar y revisar PDF Daily con diálogo real.
- **Perfil:** A.
- **Pasos de ejecución:** 1. Preparar operación/transporte sintéticos con reservas. 2. Abrir Daily y exportar. 3. Elegir carpeta temporal en diálogo nativo. 4. Abrir PDF y revisar todas las páginas/texto.
- **Resultado esperado:** Archivo PDF correcto, legible, completo y solo sintético.
- **Evidencia requerida:** Captura diálogo/ruta, hash PDF, texto y render de todas las páginas.
- **Criterio de aprobación:** Guardado por diálogo real; contenido coincide con Daily/oráculo, sin clipping, solapamientos ni datos ajenos.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M26 — Revalidar permisos después del diálogo PDF

- **Identificador:** M26.
- **Objetivo:** Revalidar permisos después del diálogo PDF.
- **Perfil:** A/A2/C.
- **Pasos de ejecución:** 1. A abre exportación Daily y deja diálogo pendiente. 2. A2 convierte A a Consulta selected en sesión independiente manteniéndose admin activo. 3. Confirmar guardado en diálogo A. 4. Revisar archivo y UI.
- **Resultado esperado:** Exportación con contexto anterior denegada; no escribe PDF; UI actualizada al alcance vigente.
- **Evidencia requerida:** Tiempos, PATCH, diálogo, respuesta IPC e inventario antes/después.
- **Criterio de aprobación:** Ningún archivo nuevo/sobrescrito con permisos anteriores y datos administrativos retirados al revalidar.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M27 — Mantener reservaciones y auditoría consistentes

- **Identificador:** M27.
- **Objetivo:** Mantener reservaciones y auditoría consistentes.
- **Perfil:** A.
- **Pasos de ejecución:** 1. Crear reserva sintética en fecha aislada. 2. Editar y cancelar. 3. Consultar estado y bitácora tras cada operación.
- **Resultado esperado:** Cambios válidos y auditoría consistente con usuario/reserva/acción/fecha.
- **Evidencia requerida:** Capturas/respuestas y filas locales de reserva/bitácora.
- **Criterio de aprobación:** Cada modificación efectiva tiene entrada coherente y el estado final es Cancelada sin cambios parciales.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M28 — Respetar capacidad y grupos operativos

- **Identificador:** M28.
- **Objetivo:** Respetar capacidad y grupos operativos.
- **Perfil:** A.
- **Pasos de ejecución:** 1. Usar tour/fecha/turno limpios. 2. Llenar grupo 1 con 12 PAX activos; intentar 13. 3. Completar grupo 2 hasta 24 total; intentar 25/grupo 3. 4. Revisar transporte y turno separado.
- **Resultado esperado:** Máximo 12 por grupo y capacidad admitida del vehículo; 24 por tour/fecha/turno; solo grupos 1/2 y un transporte por grupo.
- **Evidencia requerida:** Respuestas aceptadas/rechazadas, capturas y SQL de PAX/grupos/transporte.
- **Criterio de aprobación:** Límites se cumplen y rechazos no crean asignaciones parciales ni grupo 3.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M29 — Fallar cerrado y reconectar tras caída de PostgreSQL

- **Identificador:** M29.
- **Objetivo:** Fallar cerrado y reconectar tras caída de PostgreSQL.
- **Perfil:** C.
- **Pasos de ejecución:** 1. Registrar PID/directorio del cluster invitado. 2. Con sesión abierta detener solo ese cluster ordenadamente. 3. Consultar/refrescar. 4. Reiniciarlo y comprobar identidad y login.
- **Resultado esperado:** Fallo seguro, sesión limpia sin ampliar permisos; Express permanece activo y reconecta.
- **Evidencia requerida:** Log saneado, PIDs/listeners, errores UI/API e identidad tras recuperación.
- **Criterio de aprobación:** Sin secretos volcados ni all por fallback; Express sobrevive y login funciona al recuperar DB.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M30 — Cerrar procesos propios y reabrir sin perder alcance

- **Identificador:** M30.
- **Objetivo:** Cerrar procesos propios y reabrir sin perder alcance.
- **Perfil:** A/C.
- **Pasos de ejecución:** 1. Registrar app/backend propios. 2. Cerrar todas las instancias y confirmar salida. 3. Reabrir desde acceso. 4. Login y revisar config/usuarios/asignaciones.
- **Resultado esperado:** Procesos propios terminan; nueva sesión requiere login; config y alcance persisten en DB.
- **Evidencia requerida:** PIDs antes/después, captura login y comparativa SQL/config sin secretos.
- **Criterio de aprobación:** Sin backend propio huérfano; login nuevo y asignaciones/config exactas.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M31 — Actualizar desde un anterior adecuado y recuperar

- **Identificador:** M31.
- **Objetivo:** Actualizar desde un anterior adecuado y recuperar.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Calificar anterior por origen/hash/appId/esquema. 2. Restaurar rama S-ANTERIOR instalada/funcional y backup restaurable. 3. Cerrar procesos, migrar solo si corresponde, instalar nuevo. 4. Revisar datos/config/alcance/recursos y restaurar anterior para ensayo de recuperación.
- **Resultado esperado:** Transición reproducible y segura; instalación nueva compatible; recuperación verificada en rama aislada.
- **Evidencia requerida:** Hashes/metadata anterior+nuevo, wizard, SQL/config antes/después, snapshots y registro recuperación.
- **Criterio de aprobación:** Anterior adecuado identificado, transición/humo y recuperación sin pérdida no acordada; misma etiqueta 1.0.0 no prueba actualización.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio autorizado y versión anterior adecuada calificada.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M32 — Desinstalar exclusivamente la copia de laboratorio

- **Identificador:** M32.
- **Objetivo:** Desinstalar exclusivamente la copia de laboratorio.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Registrar ruta/usuario/entrada exactos y cerrar app. 2. Desinstalar desde Windows. 3. Revisar binarios/accesos/registro de esa copia y otras cuentas.
- **Resultado esperado:** Retira recursos de copia indicada; no altera otras cuentas, DB o herramientas independientes.
- **Evidencia requerida:** Wizard, inventario/rutas/registro previo/posterior y comprobación otras cuentas.
- **Criterio de aprobación:** Binarios/accesos/entrada retirados y destinos ajenos preservados; PG independiente documentado.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M33 — Determinar conservación real de datos de usuario

- **Identificador:** M33.
- **Objetivo:** Determinar conservación real de datos de usuario.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Antes de M32 registrar userData/config y hashes sin secretos. 2. Desinstalar sin bandera de borrado. 3. Inspeccionar config/cache/datos después y registrar ACL.
- **Resultado esperado:** Conservación prevista de userData/config comprobada o discrepancia registrada; DB independiente.
- **Evidencia requerida:** Inventario/hashes/ACL antes/después, ruta real y estado PG.
- **Criterio de aprobación:** Resultado real coincide con conservación prevista; cualquier pérdida inesperada es fallo, no aprobación por diseño.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M34 — Revisar residuos, procesos y evidencia

- **Identificador:** M34.
- **Objetivo:** Revisar residuos, procesos y evidencia.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Tras desinstalar, inventariar temporales/caches/PDF y procesos/listeners por PID/ruta. 2. Detener solo PG invitado propio. 3. Exportar evidencia y registrar conservación/limpieza autorizada.
- **Resultado esperado:** Sin procesos/listeners de prueba activos; residuos previstos identificados; evidencia conservada.
- **Evidencia requerida:** Inventarios procesos/puertos/rutas, manifest exportado y hashes.
- **Criterio de aprobación:** Cero procesos propios huérfanos, puertos cerrados tras cierre total y toda evidencia necesaria recuperable.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.

## M35 — Emitir decisión humana trazable

- **Identificador:** M35.
- **Objetivo:** Emitir decisión humana trazable.
- **Perfil:** Responsable.
- **Pasos de ejecución:** 1. Revisar evidencia/resultado de M01–M34 y defectos/repeticiones. 2. Confirmar responsables/fechas/hash/entorno. 3. Exportar evidencia, restaurar snapshot acordado y verificar entorno. 4. Firmar decisión de aceptación o rechazo.
- **Resultado esperado:** Todos los casos indispensables ejecutados y decisión real documentada; no confundir con aptitud productiva.
- **Evidencia requerida:** Matriz completada, defectos, hashes/evidencias exportadas, restauración y firma humana.
- **Criterio de aprobación:** Aceptación solo si indispensables aprobados y sin bloqueos; si falta entorno/anterior/casos, decisión pendiente o rechazo explícito.
- **Estado:** PENDIENTE.
- **Resultado observado:** No ejecutado.
- **Condición pendiente:** Falta laboratorio Windows autorizado; no ejecutado.
- **Registro humano:** fecha/hora __________; responsable __________; evidencia/enlaces __________; defectos/decisión __________.
