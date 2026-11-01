# PRE-RELEASE-05 — Vista previa interactiva para revisión manual

**Proyecto:** Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.  
**Fecha:** 17 de octubre de 2026, America/Cancun.  
**Rama:** `GYG+FRHB-implementado`. Sin commit, push ni despliegue.

## Qué se preparó

`scripts/PreviewPreRelease.ps1` abre el Electron instalado en el proyecto, con el **frontend actual**, una API exclusivamente ficticia en memoria y un perfil temporal independiente. La ventana permanece abierta para navegar, hacer clic y utilizar los formularios; no toma capturas ni se cierra automáticamente.

La barra amarilla y el título indican **DEMO · DATOS FICTICIOS**. Sus controles solo existen en esta vista previa. No se modificaron las pantallas funcionales, el backend real, reglas productivas, instalador, dependencias ni credenciales.

Se revisaron AGENTS.md, PRE-RELEASE-02/03/03-LAB/04 y los harnesses existentes. Se reutilizan `transportesUiApi.cjs` y `resumenNotificacionesSintetico.cjs`; los recorridos anteriores de Electron se conservan. El helper de transportes ahora expone también su catálogo y función de enriquecimiento, sin cambiar su comportamiento por defecto.

## Abrir desde PowerShell

Desde cualquier directorio:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "A:\sistema-integrador-reservaciones\scripts\PreviewPreRelease.ps1"
```

`-ExecutionPolicy Bypass` afecta únicamente ese proceso; el script no modifica la política de Windows. Se utilizan las dependencias ya instaladas en `node_modules`; no se instala nada. No ejecutar `npm run desktop`, ProdAccessTest ni DevDb03 para esta revisión.

Mantener abierta la consola mientras se revisa Electron. Cada inicio solicita al sistema un **puerto libre (`listen(0)`) en 127.0.0.1**, sin reutilizar 3000 ni conectarse a backends existentes. Pueden coexistir demostraciones independientes.

## Perfiles ficticios

En la barra amarilla seleccionar **Administrador** y pulsar **Entrar / cambiar perfil**. No se necesitan datos reales. Para cambiar, elegir otro perfil y pulsar el mismo botón. La sesión anterior se limpia mediante las funciones originales de autenticación.

También se puede utilizar el formulario original de inicio de sesión:

| Perfil | Correo exclusivamente ficticio | Contraseña exclusivamente ficticia |
|---|---|---|
| Administrador | `admin@demo.invalid` | `Solo-Demo-05` |
| Consulta all | `all@demo.invalid` | `Solo-Demo-05` |
| Consulta selected | `selected@demo.invalid` | `Solo-Demo-05` |

La API sintética emite tokens aleatorios propios y valida el rol/alcance en cada petición. No acepta credenciales reales. Consulta all conserva lectura y avisos, sin escribir operaciones ni archivar. Consulta selected solo consulta los datos ficticios de plataforma 17; no tiene campana, contenido de integraciones ni acceso a Operaciones. Los controles de llegada están deshabilitados para selected y la API rechaza el acceso forzado.

El control **Simular llegada** es una herramienta del laboratorio, disponible para Administrador y Consulta all para probar su recepción visual. No concede acciones administrativas a Consulta all y no existe en el frontend productivo.

## Recorrido de Operaciones — PRE-RELEASE-02

1. Entrar como Administrador y pulsar **Operaciones de hoy**. Si se cambió previamente el filtro, seleccionar la fecha actual de Cancún en el módulo.
2. Abrir el transporte del **Grupo 1**, ID ficticio 9401: muestra **Grupo 1 · Unidad 2 · 2/12 PAX**, con el ID interno secundario. El catálogo simulado contiene Unidad 2 de 12 plazas y Unidad 3 de 8 plazas.
3. Pulsar **Mostrar organización** y asignar manualmente el cliente ficticio Sur (7102) al transporte 9401. Verificar **4/12 PAX**. La cancelada 7103 no suma pasajeros.
4. En **Editar**, elegir **Unidad 3** y guardar. Verificar **4/8 PAX** en la tabla, cabecera y reservaciones asignadas. Seleccionar la opción sin vehículo y guardar: aparece **Vehículo pendiente · 4/12 PAX**. Se conservan los IDs originales.
5. Revisar el **Grupo 2**, transporte 9402: comienza con dos pasajeros y vehículo pendiente. Se puede elegir una unidad del catálogo ficticio.
6. Para revisar una operación futura, pulsar **Nueva operación**, utilizar el mismo tour ficticio, la fecha de hoy, **Tarde** y grupo 1; indicar hora explícita. Crear su transporte desde el diálogo. Comienza sin unidad ni pasajeros; se necesita un mínimo de dos pasajeros activos para asignar vehículo. También puede crearse para otra fecha.
7. Actualizar, cambiar de módulo y volver. Las etiquetas se reconstruyen con la respuesta actual del simulador. Para consultar la operación histórica ficticia, utilizar `2020-01-05`.

No se crean vehículos automáticamente. La API del laboratorio rechaza vehículos fuera de su catálogo, grupos duplicados, turnos implícitos, asignaciones incompatibles y exceso de capacidad. Conserva para el recorrido el máximo de 12 por grupo, límite físico menor y mínimo de dos pasajeros con vehículo. No reemplaza la validación completa del backend PostgreSQL.

## Recorrido de archivo — PRE-RELEASE-03

1. En Dashboard buscar **Pendientes de integración** y abrir **FareHarbor #DEMO-9101** (evento interno 9101).
2. Comprobar **Aprobado / No registrado** y el mensaje de actividad iniciada: aprobar no significa registrar; la aplicación permanece bloqueada.
3. Elegir **Archivar evento**. El motivo es obligatorio; solo espacios no habilitan la confirmación. Escribir, por ejemplo, `Actividad ficticia transcurrida; revisada para demostración.` y confirmar.
4. El evento desaparece de pendientes y del resumen de avisos. En el filtro **Archivados**, abrirlo y verificar motivo, fecha y **Administrador ficticio** responsable. Se conserva su revisión aprobada y aplicación no realizada.
5. Existe además un archivo histórico ficticio inicial, 9099. Consulta all puede consultarlos sin acciones administrativas.

El archivo solo modifica un objeto en memoria. No borra ni registra reservaciones, no cancela proveedores y no ejecuta la migración 017.

## Recorrido de notificaciones — PRE-RELEASE-04

1. Como Administrador o Consulta all, abrir **Avisos**: inicialmente hay tres pendientes, incluido el FH vencido. El contador de sin ver y el total pendiente son conceptos distintos.
2. Cerrar el panel, cambiar a Operaciones y pulsar **Simular llegada GYG** o **Simular llegada FareHarbor** en la barra amarilla.
3. Aparece un aviso discreto durante unos segundos y aumenta la campana. Abrir **Avisos** y pulsar la fila del nuevo evento, desde 9301. Se abre su detalle original en Dashboard.
4. Cerrar el detalle y comprobar que el evento figura **Visto**, mientras continúa **pendiente**. Abrirlo no lo aprueba, aplica ni archiva.
5. Navegar por módulos: los avisos siguen en el encabezado compartido. Repetir **Actualizar** no vuelve a anunciar el mismo ID. Cada pulsación del simulador crea deliberadamente otro ID ficticio.
6. Archivar un evento como Administrador lo excluye del contador y de los avisos. Probar Consulta all para lectura y Consulta selected para ausencia completa de integraciones.

Se reutiliza el coordinador real: sondeo controlado de 60 segundos, pausas al ocultar, revalidación de sesión, prevención de solicitudes concurrentes y vistos por usuario/ambiente en almacenamiento local. El control del laboratorio solicita una actualización inmediata tras insertar el objeto ficticio; no modifica el intervalo productivo.

Los vistos se conservan al navegar y recargar dentro del mismo perfil temporal. **Cerrar y volver a lanzar reinicia los datos, ambiente y perfil de la demostración**; vuelve al escenario inicial. Esta revisión no prueba persistencia PostgreSQL ni recepción externa.

## Cierre y aislamiento

Cerrar mediante **Cerrar demo**, la **X** de Electron o **Ctrl+C** en su consola. El cierre termina el servidor en memoria y Electron, liberando el puerto. El lanzador solicita cierre de su propia ventana; solo si no responde utiliza la terminación del árbol de ese proceso hijo. También se vigila la desaparición de la consola supervisora.

El perfil usa `%TEMP%\ctsk-preview-05-*`, separado del perfil habitual. No se elimina recursivamente ningún directorio del usuario. Windows puede conservar allí caché y vistos exclusivamente ficticios; las reservaciones/eventos de la demostración viven solo en memoria y cada arranque crea un directorio nuevo.

Protecciones:

- Entrada propia `scripts/preview/main.cjs`; no importa `electron/main.js`, `backend/server.js` ni configuración real. El proceso hijo hereda solo variables básicas de Windows, sin DB/PG, tokens, proxies ni NODE_OPTIONS.
- Se bloquea la carga de `pg`, `dotenv`, clientes de Google y módulos del backend real, excepto los dos helpers sintéticos explícitos. No se lee `.env`.
- Los clientes de red Node/TLS/UDP y DNS se bloquean antes del socket; solo se permite resolver la IP literal 127.0.0.1 para escuchar localmente.
- Electron usa sandbox, aislamiento de contexto y sin Node en el renderer. `webRequest` permite exclusivamente el origen HTTP exacto del simulador. CSP limita recursos/conexiones al mismo origen; se deniegan ventanas nuevas, navegación externa, webviews, descargas y permisos.
- La API rechaza Host/Origin ajenos, no habilita CORS, exige sesión/alcance y una capacidad aleatoria de laboratorio para controles especiales. El antiguo control libre `/__synthetic/control` no está disponible.
- Todas las rutas se resuelven localmente o devuelven un error explícito; no existe fallback a una API real. Gmail, FareHarbor, GYG y WhatsApp no se cargan ni se activan.

**No se realizaron conexiones ni cambios en PostgreSQL principal, DEV o el laboratorio persistente de PRE-RELEASE-03-LAB. No se ejecutaron migraciones, sincronizaciones ni escrituras en eventos/reservaciones reales. No se modificaron credenciales, configuración productiva ni instaladores. Sin commit ni push.**

## Componentes reales y simulados

| Componente | Durante esta revisión |
|---|---|
| Electron, HTML/CSS/JS del proyecto, navegación, formularios, etiquetas de transporte, diálogos de archivo y avisos | Reales, leídos del frontend actual. |
| Autenticación, vehículos, pasajeros, operaciones, revisión/archivo y resumen de eventos | API ficticia con estado en memoria. No utiliza servicios ni SQL productivos. |
| Llegadas externas | Inserción explícita de objetos GYG/FH ficticios mediante controles de laboratorio; sin correo ni webhooks. |
| Vistos y antirrepetición | Lógica real del frontend, guardada en el perfil temporal. |
| Registro/aplicación de reservas externas, modificaciones completas de reservaciones, gestión de catálogos/usuarios, exportaciones y otros flujos fuera del recorrido | No implementados en el simulador; las escrituras fuera del recorrido se rechazan claramente. No se envían a ningún backend existente. |

Esta entrega permite aprobar la interacción de PRE-RELEASE-02/03/04. **No certifica integraciones operativas ni sustituye la migración/despliegue autorizado o pruebas de aceptación con recepción externa real.**

## Archivos y pruebas

Nuevos: `scripts/PreviewPreRelease.ps1`, `scripts/preview/{main,api,isolation,selfTest}.cjs`, `scripts/preview/controls.js`, `scripts/preview/controls.css`, `backend/__tests__/previewPreRelease.test.js`, `backend/__tests__/previewPreRelease.electron.test.js`, este informe y `docs/pre-release-05/`.

Único cambio a un archivo de la fase anterior: `backend/__tests__/helpers/transportesUiApi.cjs` expone su catálogo y enriquecedor para reutilización. No se cambiaron fuentes funcionales de PRE-RELEASE-02/03/04 ni SQL.

La evidencia incluye:

- Pruebas API de sesiones, ACCESS-SCOPE, catálogo, capacidad, identificadores, operaciones nuevas, archivo y puertos independientes.
- Recorrido Electron real con clics/formularios, ambos grupos, cambio/retiro de vehículo, canceladas, capacidad 8, operación/transporte nuevos, archivo/historial y ambos proveedores simulados.
- Visto sin resolver, navegación y recarga conservando el estado actual de la API, sin repetir el aviso.
- Consulta selected sin llamadas de integraciones; una petición forzada separada recibe 403.
- Red Node y carga de pg/backend real rechazadas. Un segundo servidor ficticio testigo recibe cero solicitudes porque Chromium bloquea su origen.
- Lanzador manual sin bandera de pruebas: permanece abierto y cierra por su endpoint exclusivo con código 0 y cero listeners posteriores.

El modo `--preview-self-test` es exclusivo de las pruebas: genera capturas y se cierra al terminar. **El lanzador entregado no pasa esa bandera.**

**Resultado:** 5 suites y 22 pruebas distintas aprobadas, distribuidas en dos ejecuciones: regresión de las tres mejoras más API manual (**4 suites / 21 pruebas**) y validación final de la API más Electron del laboratorio (**2 suites / 11 pruebas**; las diez de API se repiten). Ocho capturas nuevas, incluyendo Grupo 2 a 1024 × 768. Sintaxis correcta en ocho archivos JS/CJS y el lanzador PowerShell.

El cierre equivalente a la X se comprobó aparte: código 0 y **cero procesos propios restantes**, revisando también tres procesos hijos. El cierre por el control de laboratorio dejó **cero listeners**. La comparación con los hashes de PRE-RELEASE-04 confirma que solo cambió la exportación del helper sintético; las fuentes funcionales comparadas y el hash de 017 permanecen intactos. Evidencia: `validacion-cierre-ventana.json`, `jest-preview.json` y `verificacion.json` en el directorio de esta fase.

Resultados y capturas: [evidencia Electron](pre-release-05/validacion-electron.json), [lanzador manual](pre-release-05/validacion-lanzador.json) y [regresión Jest](pre-release-05/jest-regresion.json). Capturas de [vehículo cambiado](pre-release-05/operaciones-cambio-vehiculo.png), [grupo 2](pre-release-05/grupo-2-pendiente-1024.png), [operación nueva](pre-release-05/operacion-nueva-turno-tarde.png), [aviso](pre-release-05/aviso-nueva-reservacion.png), [motivo de archivo](pre-release-05/archivo-motivo-obligatorio.png), [historial](pre-release-05/historial-archivado.png) y [Consulta selected](pre-release-05/consulta-selected.png).

La demostración está lista para revisión personal; no requiere preparar ni alterar ninguna base existente.
