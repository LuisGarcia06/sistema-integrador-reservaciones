# FASE 2D.9B.3 — Interfaces administrativas 023 y bootstrap local

28 de octubre de 2026. **C y D completados en laboratorio**, con resultados separados.

C aprobó **28 comprobaciones agrupadas en Electron/HTTP/PostgreSQL**, ejecutó los **13 escritores** desde las páginas originales y verificó **28 intenciones auditadas**. Su recorrido final registró **402 solicitudes API**. La verificación A previa se repitió y firmó con el código correspondiente antes de abrir escritores.

D aprobó **18 comprobaciones agrupadas y 23 procesos locales reales**, sobre **tres clústeres nuevos independientes de C**. La creación del primer Administrador y su constancia singleton comparten una transacción. Se demostraron exclusión concurrente, rollback, recuperación local de salida perdida y rechazo de instalaciones con Usuarios existentes.

Jest aprobó **833 pruebas en 21 suites**, sin fallos: 72 pruebas adicionales respecto de las 761 anteriores. Las regresiones reales y sus resultados se detallan por separado.

La entrada principal, frontend/index.html, Electron principal, migraciones 018–023 y base productiva permanecen conservados. No se activaron producción, LAN, integraciones ni instaladores. **No se abrió HTTP sobre los clústeres D**: la condición del primer login se documenta expresamente en la sección 8.

## 1. Preservación e inventario

Se inventariaron **1,526 archivos previos**: 1,506 quedaron idénticos y cambiaron únicamente las veinte fuentes previstas. No falta ningún archivo previo; los veinte respaldos coinciden exactamente con sus hashes anteriores. Todas las entradas Git locales previas siguen presentes. No se utilizó reset, clean ni restauración masiva.

Fuentes modificadas:

| Área | Archivos |
| --- | --- |
| Perfiles y transacciones | backend/config/operationalTransactions.js; backend/config/revisionApiTransactions.js; backend/config/credentialSecurityPolicy.js |
| Seguridad y auditoría | backend/security/credentialPolicy.js; backend/validators/auditoria.validator.js; backend/services/bitacora.service.js; backend/services/comandos.service.js; backend/revisionApiApp.js |
| Componentes compartidos de interfaz | frontend/js/api.js; frontend/js/auth.js; frontend/js/commandLab.js; frontend/js/auditUi.js; frontend/js/revisionConflict.js |
| Páginas originales | frontend/pages/usuarios.js; frontend/pages/configuracion.js; frontend/pages/bitacora.js |
| Preparación y host | scripts/credentialSecurityLab.cjs; scripts/CredentialSecurityLab.ps1; scripts/commandFrontendHost.cjs; scripts/standaloneDev.cjs |

Diecinueve fuentes nuevas:

| Área | Archivos |
| --- | --- |
| Entrada C y contrato | backend/administrativeFrontendApi.js; backend/config/administrativeFrontendPolicy.js |
| Adaptación de comandos | frontend/js/adminUi.js; frontend/js/adminCommands.js |
| Contenedor experimental de páginas originales | frontend/lab/administracion.html; frontend/lab/administracion.js; frontend/lab/administracion.css |
| Corredor C | scripts/administrativeFrontendLab.cjs; scripts/administrativeFrontendDriver.cjs; scripts/administrativeFrontendProbe.cjs; scripts/administrativeFrontendPolicy.cjs |
| Bootstrap | backend/config/bootstrapPolicy.js; backend/services/credentialBootstrap.service.js; scripts/bootstrapAdmin.cjs |
| Corredor D | scripts/BootstrapLab.ps1; scripts/bootstrapLab.cjs; scripts/bootstrapProbe.cjs |
| Jest | backend/__tests__/administrativeFrontend.test.js; backend/__tests__/credentialBootstrap.test.js |

Se añadieron también este informe y sus evidencias en docs/local-fase-2d9b3/. El inventario de eventos, lecturas y campos está en frontend-inventory.json. source-before.json, source-verification.json, created-code-files.json y git-preservation.json contienen los nombres y hashes completos. Los respaldos originales están en originals/; no sustituyen al historial Git ni eliminan el trabajo local previo.

## 2. Contrato integrado C y condición de avance

El nuevo perfil explícito es **administrative-frontend023-lab**, manifiesto versión 11 y protocolo **ctsk-administrative-frontend023-v1**. Usa el esquema 023 exacto y los servicios auditados 022 existentes. No cambia el contrato del perfil anterior de Catálogos para que acepte 023.

Las únicas escrituras C son:

| Recurso | Alta | Modificación |
| --- | --- | --- |
| Usuarios | POST /api/usuarios | PATCH /api/usuarios/:id |
| Contraseña | — | PATCH /api/usuarios/:id/password |
| Tours | POST /api/tours | PATCH /api/tours/:id |
| Guías | POST /api/guias | PATCH /api/guias/:id |
| Operadores | POST /api/operadores | PATCH /api/operadores/:id |
| Vehículos | POST /api/vehiculos | PATCH /api/vehiculos/:id |
| Países | POST /api/paises | — |
| Plataformas | POST /api/plataformas | — |

Son trece combinaciones método/ruta. Lecturas, parámetros, métodos y assets tienen listas cerradas. No se añaden PATCH de Países/Plataformas, escritores de Bitácora, Reservaciones, Daily o integraciones. Los seis Catálogos y Usuarios comparten autenticación, revocación, candado, precondiciones, auditoría y ledger.

Cada VerifyC prepara otro clúster, ejecuta A con los escritores cerrados y solo abre C después de validar la prueba A firmada para el mismo código, clúster, generación y esquema. No se copió una prueba de otro entorno. El resultado C final se firma a su vez mediante HMAC sobre código, identidad, generación, esquema, comprobaciones y digest del informe. D verifica esa prueba y exige un clúster y una generación distintos, sin conectarse a la base C.

La primera validación C ocurrió **antes de implementar D**: c-before-bootstrap.json y c-advance-gate.json conservan 28 comprobaciones, trece escritores y 799 pruebas Jest aprobadas. Después de introducir el código backend del bootstrap se repitió A+C y se generó c-proof.json con el código renovado. Los ajustes posteriores del arnés privado D quedaron ligados al fingerprint propio D; no alteraron el código de la API C.

Se conservaron los contratos SQL y los verificadores exactos. La huella de catálogo 023 continúa siendo 851067a43b10ec23b0b01b6604824c40fe949aeb426254ceb75384246f5843c2. No se editó ninguna migración para conseguir compatibilidad.

## 3. Formularios originales y componentes reutilizados

**Usuarios** mantiene listado, filtros, alta, edición, rol, estado, all/selected, plataformas y reset. Se añadieron motivo, confirmación local de contraseña para altas, política Unicode/bytes y confirmación humana del comando. Edición y botones de estado usan PATCH protegido; selected vacío sigue siendo válido.

**Configuración** mantiene sus seis pestañas, campos y acciones originales. Hay seis altas y cuatro ediciones. Los cambios efectivos exigen motivo; altas lo permiten opcional. El no-op termina sin escritura ni nueva auditoría. La reducción de capacidad se probó con una operación sintética nueva y dos PAX activos: conserva el rechazo comercial original 400 y las relaciones históricas.

Se reutilizan commandLab, commandPanel, revisionConflict y auditUi. Las fotos se consultan al abrir la edición; un conflicto no refresca automáticamente las precondiciones para sobrescribir. Se conserva la propuesta pública y el motivo. La acción humana Revisar obtiene otra foto, reconstruye los campos con el estado autorizado más la propuesta elegida y exige otra confirmación y UUID. Un resultado desconocido bloquea otra intención.

El comparador y los controles de conciliación se insertan dentro del mismo diálogo original, con sus botones accesibles por ratón. Guardar y los campos comerciales quedan bloqueados hasta la revisión explícita cuando hay conflicto o incertidumbre. La recuperación después de login se muestra antes del listado; las referencias de comandos ya conciliados se retiran cuando no hacen falta para el reset propio.

El contenedor experimental carga **App.pages.usuarios, App.pages.configuracion y App.pages.bitacora reales**. No contiene formularios simplificados ni se modificó frontend/index.html. El host loopback sirve únicamente assets declarados y reenvía API al backend verificado.

Se corrigió además un defecto de la página original: setLoading y setFormLoading reactivaban controles que el propio render había deshabilitado para el Administrador autenticado. Al terminar la carga se vuelven a aplicar las protecciones de estado y rol propios. El backend conserva sus guardias independientemente de la interfaz.

## 4. Contraseñas, sesión y recuperación

Las asignaciones nuevas aplican ocho puntos de código Unicode, máximo 72 bytes UTF-8, texto bien formado y rechazo de NUL, sustitutos aislados y cadenas solo de blancos. No se hace trim ni normalización del secreto. bcrypt conserva costo 12.

Las propuestas y comparadores son públicos. En un comando de credenciales, la contraseña se mantiene temporalmente en un WeakMap y en el cuerpo privado necesario para preparar/despachar. El comando retenido contiene solo **generation, actorId, key y kind**. Después de entregar la solicitud a fetch se liberan las referencias del adaptador, payload y formulario, antes de esperar la respuesta. El transporte conserva lo necesario para enviar la solicitud; no se promete borrado criptográfico de strings de JavaScript.

No hay almacenamiento de borradores, contraseñas, JWT o referencias en localStorage, sessionStorage, URLs ni archivos de evidencia. Los replays adversariales y las duplicaciones deliberadas del corredor son pruebas privadas, no reenvíos del adaptador.

JWT 023 verifica firma, algoritmo, issuer, audience, tipo, generación, tiempos y versión vigente PostgreSQL. Catálogos no tiene una entrada alternativa que acepte JWT anteriores contra 023. Rol, estado y versión se consultan nuevamente después del candado en escritura y recuperación. Altas/reset de Usuarios requieren login de hasta cinco minutos; una sesión antigua se probó con un JWT firmado válido de 301 segundos y el formulario exigió nuevo login.

Ante logout o revocación se abortan/invalida solicitudes, se limpian páginas y se descartan sesiones de edición. Se retuvieron por mecanismos privados una lectura y una respuesta de éxito posterior a COMMIT; ninguna repobló datos ni reabrió formularios después de logout.

La recuperación guarda únicamente referencias en RAM. Una respuesta perdida se concilia por GET, también tras reiniciar el backend. Dos GET con 404 siguen siendo desconocidos; no habilitan otra intención ni reenvían el secreto. Después del reset propio, la interfaz limpia sesión y formulario; el mismo actor, con nuevo login y misma generación, recupera la clave original. Un cambio de actor o generación descarta las referencias y no las transfiere.

## 5. Bitácora administrativa y permisos

La página original presenta histórico sin versión, operativo 2 y administrativo 3, conservando filtros, orden y nombre histórico del responsable. Se identifican los siete recursos administrativos y las fotos públicas, incluidos rol y plataformas anteriores/nuevas.

CAMBIAR_PASSWORD muestra únicamente Usuario afectado, responsable, fecha, acción y motivo. Sus fotos permanecen **NULL SQL** y no se representan aunque un objeto de entrada contuviera fotos. No se muestran contraseñas, hashes, tokens ni versiones internas de credenciales. Textos y JSON se escapan; el recorrido real incluyó texto con etiquetas HTML y comprobó que no se ejecutaran.

Administrador conserva alcance efectivo all. Consulta all puede consultar Configuración en modo lectura. Consulta selected no accede a Usuarios, Bitácora ni Configuración administrativa; sus listas auxiliares siguen la matriz existente. Selected vacío devuelve plataformas vacías. Se verificaron botones y rechazos backend, sin confiar únicamente en visibilidad.

Los paneles muestran recibos de comandos y sus referencias; no presentan el ledger como otra auditoría ni añaden un escritor de Bitácora.

## 6. Resultado C y matriz de cobertura

Evidencia definitiva: c-verification.json, c-electron-checks.json, c-server.log, c-proof.json y las capturas PNG. El resultado C es **28 comprobaciones agrupadas**, trece escritores efectivos, **402 solicitudes API** y **28 pruebas de transacción auditada**. La preparación A final aportó 33 comprobaciones independientes con B/C cerrados, además del módulo SQL 021 de preparación.

| Pruebas solicitadas C | Evidencia y alcance |
| --- | --- |
| 1–4. Alta, edición/plataformas, estado y rol | Formularios originales, filas/relaciones reales y auditoría 3 |
| 5–6. Reset ajeno y propio | Dos JWT revocados; reset propio con respuesta perdida y nuevo login |
| 7–8. Recovery y secretos | GET tras reinicio; DOM/adaptador/recibos/logs sin secretos |
| 9–10. Autenticación reciente, revocación y tardías | JWT firmado de 301s; lectura y éxito retenidos tras logout |
| 11–14. Catálogos, motivos, auditoría y no-op | Seis POST/cuatro PATCH reales; motivo opcional/obligatorio; checksum sin efecto |
| 15–18. Dos Admin, 409/412 y propuestas | Dos ventanas con foto común; comparador escapado sin contraseña; revisión explícita |
| 19–20. Duplicados y recovery sin reenvío | Dos HTTP/una auditoría; GET sin otra clave; 404 no concluyente |
| 21–24. Tres formatos y password | Bitácora real de los tres formatos; evento sin fotos |
| 25–27. Consulta, desactivado y último Admin | Tres alcances, API autoritativa, JWT revocado y controles propios; guardias de negocio cubiertas además por Jest/regresión 023 |
| 28–29. Capacidad e incompatibilidad histórica | Dos PAX activos impiden reducción; all con IDs incompatibles rechaza sin reparación |
| 30–32. Auditoría, ledger y restricción diferida | Tres fallos privados desde formularios con rollback completo y recovery 404 |
| 33–35. Regresiones, pantallas y cierre | Regresiones reales separadas; fuentes originales y Electron; closure.json |

Cada auditoría administrativa final se contrastó con su ledger y con cliente, PID y transacción PostgreSQL compartidos. Usuario/catálogo, asignaciones cuando corresponden, auditoría y comando confirman juntos. Los tres rollbacks C dedicados no dejan éxito aparente ni recibo durable falso. Los históricos anteriores se conservaron exactamente.

## 7. Herramienta local D

El perfil **bootstrap-security023-lab**, manifiesto versión 12, es independiente de HTTP. La herramienta normal es scripts/bootstrapAdmin.cjs. Solo acepta manifiesto y, para consulta, UUID técnico; no acepta contraseña por argv, entorno o archivo.

El operador usa TTY local. La clave SQL del aprovisionador se pide sin eco ni historial; se verifican código, prueba C, identidad exacta, esquema 023, roles SQL y funcionales, Usuarios vacíos y singleton ausente antes de capturar el secreto de aplicación. Después se piden nombre, correo, contraseña y confirmación sin eco y la confirmación explícita INICIALIZAR.

El aprovisionador SQL autorizado es ctsk_standalone_admin; el propietario ctsk_standalone_owner permanece NOLOGIN. El runtime no recibe elevación ni acceso al singleton. La conexión de mantenimiento local está separada de las conexiones HTTP del runtime; ningún frontend o renderer accede a PostgreSQL.

El procedimiento:

1. Valida política 023, correo canónico, identidad y preparación vacía.
2. Calcula bcrypt12 fuera del candado; no mantiene bloqueo mientras el operador escribe.
3. Inicia READ COMMITTED, toma el candado común y bloquea Usuarios en SHARE ROW EXCLUSIVE MODE.
4. Revalida identidad, código, contrato, roles, ausencia de Usuarios y constancia bajo el límite transaccional.
5. Inserta Administrador activo, all, sin asignaciones y con versión default 1.
6. Inserta la constancia singleton con UUID de intento, ID resultante, instante, generación, clúster, esquema inicial 23, huella de herramienta y SESSION_USER real.
7. Confirma mediante un único COMMIT y devuelve solo resultado/IDs no secretos.

No se emite JWT, no se usa POST Usuarios y no se inventa un actor humano ni una entrada Bitácora 022. La constancia no se borra para reintentar. El modo local inspect permite consultar el UUID después de salida perdida y rechaza un UUID ajeno.

Ejemplo de invocación, sin secretos en argumentos:

    node scripts/bootstrapAdmin.cjs --manifest "<directorio privado D>\bootstrap-manifest.json"
    node scripts/bootstrapAdmin.cjs --inspect --manifest "<directorio privado D>\bootstrap-manifest.json" --attempt "<UUID técnico>"

El manifiesto es exclusivamente de laboratorio verificado. No constituye autorización de instalación productiva.

## 8. Resultado D independiente y primer login condicionado

El preparador vacío omite desde el inicio las cuentas administrativas, el hash de fixtures y test-user.json. Solo prepara esquema y roles/datos técnicos necesarios. schema.sql ya contiene 018; se aplicaron los contratos originales 019–023 sin fixtures de Usuarios ni nuevas migraciones. Se verificó el esquema exacto antes y después.

D se ejecutó después de C sobre tres clústeres distintos, todos nuevos:

| Grupo | Comprobaciones | Resultado final |
| --- | --- | --- |
| Concurrencia/salida perdida | 5 | Un Usuario, una constancia, cero Bitácora y cero ledger |
| Rollbacks/validación/permisos | 10 | Fallos dejan instalación vacía; después una inicialización legítima única |
| Usuario existente/inactivo | 3 | Fixture de contraejemplo explícita, un Usuario y cero constancias; bootstrap siempre rechazado |

Fueron **23 procesos de prueba reales**, comunicados por IPC heredado privado. Las claves SQL y secretos de aplicación viajaron exclusivamente en memoria; no se guardó una contraseña del primer Administrador en archivos, variables exportadas ni argumentos. El mecanismo de initdb del preparador conserva su archivo temporal técnico original y lo elimina antes de este flujo; no se reutiliza para capturar el secreto de aplicación.

La captura TTY sin eco/historial se probó con un doble de canal en Jest; las pruebas D reales utilizaron IPC local privado y el mismo servicio de inicialización. No se atribuye una interacción humana manual a esos ensayos automatizados.

| Prueba solicitada D | Resultado |
| --- | --- |
| 1. Instalación sin Usuarios | Verificada antes de cualquier caso en cada clúster |
| 2. Primera inicialización | Administrador activo/all, bcrypt12, compare correcto y versión string 1 |
| 3. Dos procesos | Uno confirma; otro espera y rechaza al encontrar constancia |
| 4. Segundo intento | Rechazado sin otra cuenta/constancia |
| 5–6. Usuario sin constancia / Admin inactivo | Ambos bloquean; no se convierten en bootstrap ni recuperación |
| 7–9. Fallos antes/después de Usuario y constancia | Rollback de ambas filas; también se probó fallo después de constancia |
| 10. Salida perdida tras COMMIT | Inspect local recupera el UUID exacto; no se repite alta |
| 11. Política de contraseña | Cortas, blancos, NUL, sustitutos, exceso, confirmación y correo ambiguo rechazados |
| 12. Secretos | Escaneos en vivo de resultados, logs, PostgreSQL y evidencias |
| 13. Runtime | No inicializa ni inserta singleton; INSERT no cooperativo bloqueado con 55P03 |
| 14. Primer login HTTP del clúster D | **Condicionado; no ejecutado**, conforme a la excepción de la solicitud |
| 15. Cierre | Tres clústeres D finales y procesos propios detenidos |

**Motivo del punto 14:** la entrada HTTP 023 exige una prueba A de su propio clúster/generación y su preparación validada. La prueba C no pertenece a D, y el recorrido A de laboratorio contiene múltiples Usuarios sintéticos. No se fabricó una prueba A ni se sembraron Usuarios adicionales para forzar ese acceso. Se verificaron localmente hash/compare/costo, rol, estado, alcance y versión del primer Administrador. El login 023 real sí se verificó en C y en la regresión 023, de forma separada.

Esta limitación no se presenta como un login D aprobado. Antes de consolidar instalación y aplicación hace falta un contrato revisado de primer acceso que admita legítimamente la constancia de bootstrap.

## 9. Atomicidad, fallos e integridad D

Las trazas de los dos INSERT y COMMIT del primer inicializador acreditan mismo cliente, PID y transacción. La exclusión usa candado cooperativo y bloqueo de tabla: un INSERT directo del runtime mientras el primer inicializador esperaba fue rechazado por timeout de bloqueo y se revirtió sin Usuario adicional.

Se inyectaron fallos privados antes del INSERT de Usuario, después del INSERT, en la restricción de la constancia y después de insertar constancia. Cada caso dejó cero Usuarios, constancias, auditorías y comandos. Los incrementos de secuencias propios de PostgreSQL no se confunden con filas confirmadas.

Se rechazaron identidad de clúster equivocada, rol funcional ausente y principal runtime insuficiente. El ensayo de identidad solo conectó al clúster nuevo propio con una identidad esperada falsa; nunca apuntó a la base principal. La herramienta no crea roles faltantes. La restauración del rol técnico fue un paso explícito del arnés sobre una base todavía vacía.

El grupo Usuario existente crea deliberadamente una fixture de contraejemplo después de probar el estado vacío; no se presenta como primer Administrador creado por bootstrap. Desactivarla tampoco habilita el inicializador. No se deshabilitó la guardia singleton para limpiar escenarios.

## 10. Jest, regresiones y evidencia real

| Ejecución final | Resultado |
| --- | --- |
| Jest | 833 pruebas / 21 suites / cero fallos; 72 pruebas adicionales |
| C Electron + HTTP + PostgreSQL | 28 comprobaciones / 402 solicitudes API / trece escritores / 28 intenciones auditadas |
| A previo a C | 33 comprobaciones; escritores cerrados y prueba firmada |
| D procesos + PostgreSQL | 18 comprobaciones agrupadas / 23 procesos / tres instalaciones independientes |
| Regresión API 021 | 44 comprobaciones reales aprobadas |
| Regresión Catálogos 022 | 73 comprobaciones reales aprobadas |
| Regresión A+B 023 | 72 comprobaciones reales aprobadas |

Los dobles/modelos están separados de las pruebas reales. Jest usa la configuración standalone con PostgreSQL/red bloqueados. Los ensayos C usan Electron real, contextIsolation, sandbox y nodeIntegration deshabilitado. La preparación aplica y verifica los contratos 020–023 sin relajar sus definiciones, permisos, funciones o restricciones diferidas.

Antes de ejecutar se revisaron efectos de los corredores. No se ejecutó CommandApiLab.ps1 completo ni AdminAuditSchemaLab.ps1 completo. Las regresiones 021/022 no contienen reset/alta HTTP de Usuarios; sus cuentas iniciales son fixtures privadas. Los cambios de contraseñas de esta fase ocurrieron únicamente en los laboratorios de seguridad 023, C y D autorizados. Los primeros recorridos 021/022 también aprobados se conservan como antecedentes de esta misma fase y no se suman otra vez.

## 11. Incidencias conservadas y correcciones

Todos los intentos fallidos se conservaron; no se contaron como éxitos:

| Intento | Hallazgo | Resolución |
| --- | --- | --- |
| C1 | Una recuperación pública confirmada seguía bloqueando navegación | Resolver la referencia al aceptar recibo durable |
| C2 | El arnés de permisos no pasaba las cabeceras necesarias para atravesar el proxy | Cabeceras de prueba explícitas; el backend siguió siendo autoritativo |
| C3–C4 | Faltaba fixture de PAX/capacidad; su primera versión omitía fechas obligatorias | Operación nueva independiente y campos originales completos |
| C5 | El rechazo original de capacidad es 400, no 409 | Se corrigió la expectativa del arnés; no se cambió la regla |
| C6 | El fin de carga reactivaba controles propios | Se reaplican las protecciones originales al terminar carga |
| D1 | Timeout total de 20s durante verificaciones ACL y espera concurrente; rechazo no manejado del arnés | Timer acotado de 90s, espera ligada al fin del hijo, cleanup al desconectar y cierre verificado del clúster fallido |
| QA visual | El comparador quedaba detrás del diálogo y recovery después del listado largo | Panel dentro del formulario, recovery antes del listado y clics mediante hit-testing de Electron; C y D se repitieron con la prueba renovada |
| Assets | Referencia declarada sobrante a un logo inexistente | Se retiró de la lista; prueba de existencia de todos los assets y rechazo 404 del nombre retirado |
| Regresiones simultáneas | Rechazos en verificaciones negativas de arranque durante ejecución concurrente con D | No se contaron como aprobadas; se repitieron secuencialmente, sin relajar ni modificar los verificadores anteriores |

La primera limpieza D con entorno general no superó el lector de ACL. Se comprobaron las ACL privadas y se repitió el cierre con el mismo entorno limpio del corredor, sin cambiar permisos ni relajar verificadores. El clúster quedó detenido. Los dos directorios D restantes de ese intento nunca iniciaron PostgreSQL.

Las cinco capturas finales se revisaron visualmente. Usuarios documenta el formulario durante el despacho, con campos de contraseña ya vacíos; Configuración recoge el contenido de Vehículos durante una transición visual en la que la pestaña Tours conserva el resaltado en ese frame. No se presentan esas imágenes como pruebas del estado final: las aserciones de pestaña activa, formulario, permisos y resultado durable corresponden al recorrido DOM/HTTP/SQL. El comparador y recovery sí se comprobaron además mediante clic físico y hit-testing en Electron.

No quedan fallos técnicos pendientes en los recorridos completados. Se mantienen como límites el primer login HTTP D condicionado, la ausencia de consolidación principal y la validación futura con datos reales.

## 12. Secretos, aislamiento y cierre

Los escaneos en vivo comparan los valores sintéticos reales —contraseñas, hashes, JWT y claves privadas— con respuestas autorizadas, recibos, auditorías, logs de servidor/PostgreSQL e informes. D revisa también ausencia de hashes bcrypt/JWT en su salida. El transporte C utiliza HMAC efímero para la prueba de igualdad de cuerpos, sin persistir un hash simple del cuerpo sensible.

No se copian claves, runtime.env, test-user.json ni carpetas de datos a evidencias públicas. Los prompts de bootstrap no leen .env productivo. La API sigue utilizando su configuración privada y el pool central existente; el mantenimiento privilegiado de D usa solo su conexión local explícita. Los probes de fallo son módulos privados del corredor, no endpoints ni parámetros de la herramienta normal.

Se verificaron **31 clústeres propios detenidos, 71 puertos sin listeners y cero procesos propios Node/PostgreSQL/Electron restantes**. Se conservaron además dos directorios privados nunca iniciados. No se conectó a sian_kaan_reservaciones ni se modificaron servicios, firewall, router, certificados, tareas Windows o integraciones. labs.json y closure.json contienen identidades y comprobaciones.

Evidencias principales en docs/local-fase-2d9b3/:

- c-verification.json, c-electron-checks.json, c-proof.json y c-server.log.
- c-before-bootstrap.json, c-advance-gate.json y a-final-verification.json.
- d-verification.json, d-first-failure.json y logs de sus intentos.
- jest-final.json y jest-final.log.
- api021-final-regression.json, catalog022-final-regression.json, security023-regression.json.
- source-verification.json, git-preservation.json, reversion-manifest.json.
- credential-safety.json, labs.json, closure.json y verification-summary.json.
- Capturas originales de Usuarios, Configuración, conflicto, Bitácora y recuperación propia.

## 13. Reproducción y reversión selectiva

Para C, siempre desde un clúster nuevo:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/CredentialSecurityLab.ps1 -Mode VerifyC

Para D, usando exclusivamente el directorio de un C recién validado y firmado:

    powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/BootstrapLab.ps1 -Mode Verify -CStageDirectory "<directorio privado C>"

D crea tres directorios/clústeres nuevos; no acepta un destino existente para Verify. La consulta local de una constancia usa inspect y no crea otra cuenta. Un 404 HTTP de comando o una salida incierta local nunca autorizan reintentos automáticos.

Para desactivar la entrega basta con no iniciar las entradas experimentales. Para revertir fuentes, revisar reversion-manifest.json, comprobar SHA actual igual a after y respaldo igual a before, y copiar individualmente solo esas veinte fuentes. Si hubo trabajo posterior, revisar el diff y retirar únicamente estas líneas. Las diecinueve fuentes creadas solo se retiran individualmente si aún coinciden con el hash registrado. Conservar evidencia y respaldos; no usar Git HEAD como sustituto del estado local anterior.

No aplicar downmigration a ninguna base existente ni borrar una constancia para repetir bootstrap. Los clústeres de prueba están detenidos; su eliminación posterior requiere seleccionar y validar cada directorio propio de forma explícita. No se efectuó borrado recursivo como parte de esta entrega.

## 14. Recomendación concreta de consolidación

La siguiente entrega debería integrar estas capacidades en **la entrada principal existente**, reutilizando sus páginas y los mismos servicios; no crear una segunda aplicación. Antes de activarla:

1. Aprobar un contrato de primer login que acepte legítimamente la constancia de instalación limpia, con pruebas adecuadas para un solo Administrador y sin simular la prueba A de fixtures.
2. Unificar arranque, manifiesto, esquema verificado, JWT 023 y matriz de permisos para los módulos ya desarrollados. Los tokens anteriores deberán terminar su sesión de forma controlada.
3. Cargar los adaptadores en el router/index principal de forma explícita y conservar propuestas públicas, referencias RAM, confirmaciones y limpieza de sesión. Esa modificación todavía no se realizó.
4. Ensayar backup/restauración y datos reales en una copia expresamente autorizada; revisar collation/correos y casos históricos de contraseña antes de adoptar 023.
5. Ejecutar aceptación integral de Reservaciones, Operaciones, Transportes, Daily/PDF, Historial, Bitácora y administración en un único Electron; después decidir distribución e instalador con aprobación propia.

No se inició esa consolidación ni se tomaron decisiones productivas, de integraciones externas o de distribución empresarial.
