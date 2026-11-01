# Fase 2E.1 — informe técnico

Estado: **A, B y C aprobados en laboratorio sintético** el 29-oct-2026. Cupo de 24 confirmado desde alta/edición, Electron original, primer acceso seguro y cierre verificados. No constituye autorización productiva.

Evidencia principal: `consolidation-verification.json`, `MATRIZ-36.md`, `first-access-verification.json`, `jest-final.json`, `closure.json` e índice visual `VISUAL.md`. Los hashes de fuentes y respaldos están separados de los resultados de pruebas.

## 1. Inventario de rutas y módulos

`INVENTARIO.md` y `routes-inventory.json` enumeran 60 rutas existentes, clasificadas por recurso y permiso. Historial reutiliza Reservaciones; Transportes vive dentro de Operaciones; Avisos y Notificaciones reutilizan Eventos de Integración. Los 22 escritores comerciales autorizados incluyen cuatro de Reservaciones, cuatro de Operaciones/Transportes, uno de Daily y trece de Usuarios/Catálogos. Login y comandos son infraestructura. No se recrearon módulos ni endpoints comerciales.

## 2. Primer acceso después del bootstrap

`CONTRATO-PRIMER-ACCESO.md` describe el perfil específico `first-access023-lab`. El supervisor inicializa un clúster nuevo sin Usuarios, ejecuta el bootstrap legítimo y verifica singleton, cuenta inicial, esquema023 exacto y privilegios. La API solicita un desafío aleatorio nuevo; el supervisor firma una atestación Ed25519 de propósito propio y vigencia corta. Primer login y sesión se comprueban sobre ese mismo clúster. Una prueba A de fixtures no se reutiliza como constancia de primer acceso. La repetición final aprobó15 grupos, incluidos negativos de JWT, generación, firma, manifiesto, replay, singleton, permisos y esquema, y cerró PostgreSQL (`first-access-historical-adapter.log`).

## 3. Contrato unificado experimental

`CONTRATO-BACKEND.md` detalla `unified023-lab` y `ctsk-unified023-v1`. La transición exige el JWT real del primer login y su sesión coincidente. El manifiesto liga código, bootstrap, clúster, generación, esquema y claves privadas de laboratorio. Cada reinicio revalida el estado vivo. Los perfiles anteriores no se reetiquetan para aceptar023.

## 4. Un solo backend

`backend/unifiedApi.js` monta los routers y servicios existentes mediante `revisionApiApp`. Todos usan el único pool centralizado en `backend/config/database.js`. La política HTTP es una matriz explícita de métodos, rutas y filtros. Los supervisores privilegiados son instrumentos locales independientes del runtime y no entregan su conexión al HTTP ni al renderer. No existe otra entrada de autenticación antigua válida sobre el contrato023.

## 5. Electron original

`electron/main.js` conserva el camino habitual y añade exclusivamente el modo explícito `--ctsk-mode=unified023-lab`. Requiere IPC privado, manifiesto verificado y prueba B firmada; un mero flag no habilita C. `frontend/index.html` y las páginas originales cargan adaptadores condicionados. El renderer conserva sandbox, contextIsolation, webSecurity y nodeIntegration deshabilitado. No recibe credenciales PostgreSQL.

## 6. Módulos integrados

Login, Dashboard, Reservaciones, Operaciones, Transportes, Daily, Historial, Bitácora, Centro de Avisos/campana, Usuarios y seis Catálogos conservan sus páginas originales. `unifiedActivation.js` ordena los adaptadores; `unifiedAssignments.js` adapta los controles de asignación existentes a comandos protegidos. La CSS nueva sólo delimita los componentes añadidos.

## 7. Roles y alcance

Administrador conserva all; Consulta all conserva sus lecturas aprobadas y carece de escritores. Consulta selected y sin plataformas sólo navegan Dashboard/Reservaciones, con filtrado backend y auxiliares autorizados. Se cierra la discrepancia histórica del menú Integraciones únicamente en el perfil conjunto. Ocultar controles complementa, pero no sustituye, los guards backend.

## 8. Auditoría e idempotencia

Reservaciones mantiene auditoría histórica; Operaciones/Transportes/Daily usan formato2; Usuarios/Catálogos, formato3. No hay backfill de eventos pasados. UUID, ETag, contexto, candado común, savepoints y revalidación de identidad se conservan. Negocio, auditoría y ledger comparten cliente y transacción. Un replay no añade otra auditoría; recuperar se realiza por GET.

## 9. Revocación y respuestas pendientes

La sesión023 valida generación y versión de credenciales. El router descarta páginas retiradas y bloquea la navegación con resultados inciertos. La reconexión sólo acepta el mismo perfil verificado y exige nueva sesión cuando cambia el backend. Los comandos de contraseña conservan exclusivamente actor, generación, clave y tipo; nunca una contraseña para reenvío ni borradores persistentes.

## 10. Daily, PDF y cupo

Se conserva el generador PDF/IPC original y se intercepta la impresión física en el driver privado: una impresión interceptada y cero trabajos físicos enviados. `visual/daily-electron-original.pdf` es el archivo real de187437 bytes producido por Electron; una página horizontal, renderizada con Poppler y revisada visualmente. `visual/pdf-review.json` documenta texto, tamaños y exclusión de motivo/reservaciones sin asignar. Conserva logotipo, personalización, guía, vehículo, operador, pickup, PAX/niño, importes y notas. Las observaciones generales por fecha mantienen el control y refresco explícito existentes; el documento original conserva notas de pasajeros y operador.

La confirmación humana del29-oct-2026 endurece el cupo24 desde alta/edición, contando todas las reservaciones activas con o sin transporte del mismo tour/fecha/turno. Canceladas no suman; PAX ya incluye niños; la edición excluye su propia fila. El candado común impide sobrecupo concurrente. No-op conserva sus efectos nulos. Los sobrecupos sintéticos preexistentes se reportan sin cancelación, reasignación o reparación automática; se conserva turnoNULL histórico. Este endurecimiento se limita al perfil conjunto experimental y se documenta expresamente frente al comportamiento anterior.

## 11. Resultados reales

`consolidation-verification.json` final indica `completed:true`, cero fallos, escaneo de secretos aprobado y PostgreSQL detenido. Identidad: clúster `7702116992483490452`, base `ctsk_standalone_080644d2f4c1_test`, generación `32f530bc-1ae6-4433-be42-c0afc66ba6c6`, PostgreSQL63030 y HTTP63031, ambos127.0.0.1. Directorio privado: `C:\Users\luisg\AppData\Local\ctsk-standalone-c4cbb4760148`.

| Evidencia independiente | Resultado real |
| --- | --- |
| A y sus negativos, clúster independiente | 15 grupos aprobados |
| B en el mismo clúster integral antes de C | 25 grupos;220 solicitudes HTTP observadas;25 trazas de cliente/PID/transacción versionadas |
| C con Electron43.4.1, entrada y páginas originales | 31 grupos totales:26 del recorrido,2 puertas de activación,2 del proceso reiniciado y1 de conservación de datos |
| Solicitudes API observadas desde Electron | 666 en recorrido completo y16 después del reinicio |
| Estado sintético final | 75 filas de Bitácora y100 comandos durables |
| Evidencia visual | 17 capturas originales yPDF real de una página |

`unified-backend-final-same-cluster.json`, `original-electron-full.json` y `original-electron-restart.json` separan cada capa. `MATRIZ-36.md` relaciona los36 requisitos con grupos reales; no se presentan como36 ejecuciones independientes. `INTENTOS.md` explica los cinco ensayos integrales fallidos anteriores y sus correcciones; todos se conservan sin sumarlos como aprobados.

## 12. Jest y regresiones

910 pruebas Jest en26 suites pasan (`jest-final.json`/`.log`), incluidas las tres regresiones de validación de motivo por recurso/perfil. Las regresiones independientes021 y022 pasan44 y73 grupos respectivamente. La regresión administrativa023 A+C se ejecutó varias veces sobre clústeres nuevos:33 grupos de seguridad y28 grupos de formularios administrativos. `REVISION-REGRESIONES.md` registra la revisión previa. No se ejecutó `CommandApiLab.ps1` completo; sus pruebas de credenciales no se asumieron inocuas.

## 13. Atomicidad y fallos

El instrumento privado inyecta fallos de auditoría, ledger y restricción diferida y pérdida de respuesta después deCOMMIT. Los hashes de negocio/auditoría/comandos deben conservarse tras rollback. Un404 de recuperación permanece no concluyente y no habilita un reenvío. No se agregaron rutas HTTP públicas de inyección.

## 14. Compatibilidad histórica

Migraciones018–023 y relaciones permanecen intactas. No se añadieron tablas ni columnas. La adaptación selecciona auditoría por recurso y mantiene lectores históricos. El ensayo original detectó que el adaptador de comandos imponía a las ediciones históricas de Reservaciones el motivo obligatorio de auditoría2/3: la excepción explícita se limita a rutas de Reservaciones dentro de `unified023-lab`; los demás recursos conservan su validación. Los perfiles anteriores conservan sus manifiestos/verificadores; el arranque habitual conserva su camino previo. Los turnos no se derivan de horarios.

## 15. Separación de producción

Cada corredor crea un directorio privado y un clúster nuevo con nombre/puertos propios. Los contratos rechazan la base productiva `sian_kaan_reservaciones` y sólo permiten loopback. Los trazados limitan conexiones a PostgreSQL y HTTP propios. No se leyeron credenciales reales, no se activaron APIs externas, webhooks, LAN, WhatsApp Cloud, firewall, ngrok, tareas Windows, instaladores ni despliegues. Los eventos de Avisos son filas sintéticas de laboratorio.

## 16. Archivos y hashes

`source-before.json` preserva la foto inicial de1643 entradas; incluye el helper creado inmediatamente antes, por lo que1642 archivos pertenecían al estado previo del usuario. `source-verification.json` verifica21 modificaciones, todas con respaldo idéntico al hash inicial y ninguna desaparición;1622 entradas de la foto permanecen iguales. `originals/` contiene esas21 copias selectivas. `created-code-files.json` enumera34 fuentes nuevas (incluido ese helper) conSHA256. Los archivos previos sin seguimiento y evidencias anteriores se conservan; no se usaron reset, clean ni restauraciones masivas.

Los21 archivos previos modificados son: ocho del backend (`operationalTransactions`, `revisionApiTransactions`, `revisionApiApp`, `credentialPolicy`, servicios `bitacora`, `comandos`, `reservaciones` y validador `auditoria`); `electron/main.js`; `frontend/index.html`; diez archivos del frontend (`app`, `auth`, `commandLab`, `dailyCommands`, `layout`, `operationCommands`, `reservationCommands`, `router`, `transportCommands` y página `operaciones`); y `scripts/administrativeFrontendDriver.cjs`. Las rutas y hashes exactos están en el JSON. `backend/server.js`, `database/schema.sql`, migraciones018–023 y `package.json` permanecen idénticos al estado inicial.

## 17. Cierre

`closure.json` confirma29 directorios propios: ningún `postmaster.pid`, ningún proceso con su directorio en la línea de comandos y ningún listener en sus puertos PostgreSQL/HTTP/UI, incluidos los hosts UI separados de las regresiones. Incluye regresiones, intentos fallidos y ejecución aprobada. El verificador sólo lee estado del sistema; no detiene servicios ajenos. Los directorios privados se conservan para trazabilidad, con los clústeres apagados. `provenance.json` verifica después del cierre la huella exacta y firma B sin reabrir PostgreSQL; el verificador de arranque completo exige elPID vivo y correctamente rechaza el clúster apagado.

## 18. Limitaciones

La activación es un laboratorio con supervisor privado, no un mecanismo final de distribución ni de operación empresarial. Los datos son sintéticos. No se demuestra compatibilidad de instalaciones en las dos computadoras de la empresa, ni una aceptación con datos reales. El arranque habitual se revisó y su carga inerte se probó automáticamente; no se inició contra su base habitual, cuyo acceso está prohibido en esta fase. Las integraciones permanecen inactivas. La aprobación productiva es posterior y expresa.

Se preservan dos contraejemplos históricos sintéticos sólo para revisión:25 PAX en2099-11-14/Mañana y26 PAX en2099-11-15/turnoNULL, tour1. Se reportan en B sin corrección automática. Chromium puede repetir una solicitud al cortar un socket; el mismo UUID produjo un replay seguro, documentado en el intento4. El ensayo final retuvo la respuesta real después deCOMMIT hasta el timeout del cliente para comprobar el camino incierto y recuperación porGET sin un nuevo envío de la aplicación.

## 19. Reversión selectiva

No revertir automáticamente el árbol de trabajo compartido. Para cada archivo cambiado, comparar primero su hash actual con `after` de `source-verification.json`; sólo si coincide, restaurar su copia individual de `originals/`, verificando el hash previo. Si difiere, revisar cambios posteriores antes de copiar. Para fuentes nuevas, revisar cada ruta de `created-code-files.json` y sus dependencias; no borrar carpetas recursivamente. Las evidencias y clústeres privados pueden conservarse para auditoría. No hay migración productiva que deshacer.

## 20. Requisitos posteriores

Antes de ensayar en las dos computadoras: acordar estrategia de datos reales y aceptación, procedimiento de instalación/configuración segura, distribución de secretos y privilegios, respaldo/restauración, conectividad autorizada, mantenimiento/actualización y escenarios de aceptación por rol. Resolver por separado la sincronización FareHarbor/GetYourGuide conforme a documentación/acceso autorizados. WhatsApp continúa con captura manual y Cloud API permanece descartada. No se implementó ni activó ninguna decisión de distribución o sincronización.

Para repetir exclusivamente el laboratorio: ejecutar `scripts/CredentialSecurityLab.ps1 -Mode VerifyC`, conservar el directorio nuevo aprobado y pasarlo como `-CStageDirectory` a `scripts/FirstAccessLab.ps1` y `scripts/ConsolidationLab.ps1`. Cada wrapper crea otro clúster nuevo. El último repite bootstrap/login y B, firma su puerta y ejecuta `electron .` con la entrada principal; no requiere un backend por módulo. No reutilizar manifiestos de otra huella ni iniciar Electron con un flag aislado.
