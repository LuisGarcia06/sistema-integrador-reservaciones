# Fase 2E.2 — Informe de preparación y recuperación

Fecha de cierre: 2026-10-29T19:31:32.356Z. Resultado: **fase completada en entornos sintéticos locales; instalación empresarial pendiente**.

## 1. Evaluación de preparación empresarial

Se preparó y comprobó la separación servidor/cliente, instalación limpia y recuperación real. El sistema conserva Electron, HTML/CSS/JavaScript, Express y PostgreSQL, una lógica comercial y los 22 escritores autorizados. Se revisaron AGENTS.md, consolidación 2E.1, entradas originales, pool central, contratos 020–023, JWT/bootstrap, PDF e inventario de empaquetado. Faltan instalación física, protección LAN, distribución y aceptación empresarial. No está declarado listo para producción.

## 2. Arquitectura propuesta

Servidor: PostgreSQL 18.3 central, backend Express y mantenimiento/respaldo privado. Cliente: Electron original conectado por REST al backend identificado, sin base comercial propia, sincronización bidireccional ni conexión SQL. El ensayo utiliza procesos/configuraciones distintos sobre 127.0.0.1; no acredita conectividad entre dos computadoras.

## 3. Dependencias de laboratorio identificadas

Supervisores IPC, manifiestos sintéticos, pruebas A/B, fixtures, puertos aleatorios, clústeres desechables y control de fallos son herramientas de ensayo. El nuevo primer arranque utiliza bootstrap legítimo y singleton vivo; ninguna prueba de otro clúster acredita la instalación. Instrumentación de fallos sólo en supervisor privado/probe y nunca como endpoint público. Su sustitución empresarial está descrita en [CONTRATO-PREPRODUCCION.md](CONTRATO-PREPRODUCCION.md).

## 4. Configuración segura

Perfil explícito y cerrado `preproduction023-local`, raíces nuevas con marcador/ACL, identidad de clúster, huella de código, esquema 023 y rol limitado antes de escuchar. Archivo privado de servidor separado del descriptor público firmado del cliente. Identidad remota por desafío/nonce firmado y fresco; cambio de instancia o desconexión limpia sesión. Los argumentos no deshabilitan verificaciones. Por diferencia observada de 6 ms entre procesos Windows se prueba margen máximo de 1 s de adelanto; caducidad de 30 s, firma e identidad conservadas. La configuración empresarial sigue sin activación.

## 5. Ensayo local servidor/cliente

41 grupos de comprobación del coordinador; regresión comercial integrada de 24 grupos. 5 ejecuciones de Electron original: primer acceso, recorrido completo, reinicio, caída de PostgreSQL y recuperación restaurada. Cliente sin SQL, secretos de servidor ni módulo pg cargado; renderer aislado sin Node. La aplicación conserva sus páginas y formato Daily.

## 6. Instalación limpia y primer acceso

Esquema 023 y permisos verificados; sólo roles/catálogos técnicos previos al bootstrap. Credencial sintética explícita y aleatoria en memoria, sin cuenta/contraseña predeterminada ni archivo de usuario fixture. Singleton único del primer Administrador. Primer login desde Electron antes de cualquier login HTTP directo; segundo Usuario creado en formulario original. Reinicios y reconexión comprobados.

## 7. Respaldo

`pg_dump 18.3` oficial, custom, snapshot exportado de transacción repetible de sólo lectura y ventana sin escritores. Archivo nuevo privado: `C:\Users\luisg\AppData\Local\ctsk-standalone-32b2c60c989b\backup\database.dump`. SHA256: `17109f8896852edd01476891fcdd08d4bd65517d08d19a4965dfdd1b24456802`. Firma y autoridad de origen fijada separadamente, cantidades/huellas de todas las tablas y secuencias, contrato 023 y procedencia. Contraseña por entorno privado, nunca argumentos/logs. Los eventos de herramientas guardan versión, salida y huella del diagnóstico. Procedimiento en [RESPALDO-RESTAURACION.md](RESPALDO-RESTAURACION.md).

## 8. Restauración verificada

Otro clúster nuevo, base vacía nueva, `pg_restore --single-transaction --exit-on-error --no-owner`, rol de mantenimiento separado. Verificados todas las filas/secuencias, restricciones, catálogo 023 y permisos de runtime. Restauración: clúster `7702173668590891196`, base `ctsk_standalone_43ab45483ef8_test`. La restauración reconstruye transaccionalmente nueve CHECK cuyo árbol PostgreSQL 18.3 reescribe al importar, usando únicamente SQL original con SHA aprobado y pares de huellas conocidos; exige igualdad exacta posterior. Migraciones y verificadores intactos. Backend iniciado, login autorizado, lectura Reservaciones/Daily y PDF real desde Electron original. El estado final después de esas lecturas coincide exactamente con el snapshot respaldado. Incluye usuarios/roles, plataformas asignadas, versiones, singleton, ledger, relaciones, catálogos, reservas, transportes, operaciones, observaciones y bitácora.

## 9. Sesiones y secretos tras restaurar

Generación de datos y singleton original conservados. Constancia externa firmada liga respaldo/procedencia al clúster y base destino, instalación, época y huella de clave de comandos. Instalación, época de autenticación, JWT, clave de identidad y precondiciones nuevas; descriptor público cliente nuevo. Se revocó un JWT en origen después de respaldar y se comprobó 401 al presentarlo en la aplicación restaurada, aunque la copia conserva la versión de credenciales anterior. La clave de comandos se conserva por custodia privada separada para mantener comandos durables. El dump no reemplaza la custodia de secretos.

## 10. Fallos y recuperación

Backend terminado/reiniciado, PostgreSQL detenido con backend y Electron activos, cliente desconectado, respuesta perdida tras COMMIT, recuperación GET con misma intención, sesiones y respuestas tardías, configuración incorrecta, respaldo corrupto/destino no vacío y privilegios runtime insuficientes. Restauración parcial real que termina con código cero es rechazada al comparar datos; archivo inválido produce error real de pg_restore y cero tablas en destino nuevo. Sin reintentos automáticos de escrituras inciertas, duplicados ni reparaciones automáticas.

## 11. Cupo de 24 PAX

Probados alta exactamente 24, rechazo 25, cambio PAX/tour/fecha/turno, edición sin doble conteo, canceladas excluidas, sin transporte incluidas y dos altas concurrentes bajo transacción/candado. Históricos con sobrecupo y turno NULL se reportan sin modificar ni inferir turno. PAX incluye niños; grupo/transporte máximo 12 y capacidad real del vehículo, mínimos y otras reglas vigentes conservados. Diferencia comercial ya autorizada en 2E.1: antes el cupo se limitaba al asignar; ahora se exige también desde alta/edición. Esta fase vuelve a verificarla y sólo habilita su mismo servicio para el nuevo perfil.

## 12. Aceptación empresarial

Matriz preparada en [DATOS-Y-ACEPTACION.md](DATOS-Y-ACEPTACION.md), con resultados automatizados separados de revisión manual de Community Tours. Login/roles, reservas/cancelaciones/búsquedas, operaciones, transportes, Daily/PDF/impresión, historial/bitácora, Usuarios/Configuración, Avisos, revocación, desconexión y recuperación incluidos. Todos los casos en equipos reales siguen pendientes de ejecución y aprobación del personal.

## 13. Conexión física futura

Definir servidor, dirección/nombre estable, puerto HTTPS, certificados/confianza verificables, cuentas Windows separadas, firewall específico, PostgreSQL accesible sólo desde servidor, inicio/detención y recuperación, almacenamiento y respaldo externo. No asumir seguridad de red privada. No se tocaron LAN, router, firewall, certificados ni servicios Windows. Empaquetado actual incluye backend: debe prepararse después un cliente independiente mediante lista de archivos revisada; ningún instalador definitivo fue generado.

## 14. Regresiones ejecutadas y omitidas

Jest: **932/932**, **27/27** suites. Contratos 021–023 en tres clústeres independientes, después de revisar sus efectos secundarios:

| Informe | Grupos | Resultado |
| --- | ---: | --- |
| [ctsk-standalone-021aba848562-audit-api-verification.json](ctsk-standalone-021aba848562-audit-api-verification.json) | 44 | Aprobado |
| [ctsk-standalone-abd164650055-admin-api-verification.json](ctsk-standalone-abd164650055-admin-api-verification.json) | 73 | Aprobado |
| [ctsk-standalone-5a0dc9233524-administrative-frontend-verification.json](ctsk-standalone-5a0dc9233524-administrative-frontend-verification.json) | 28 | Aprobado |
| [ctsk-standalone-5a0dc9233524-security-verification.json](ctsk-standalone-5a0dc9233524-security-verification.json) | 33 | Aprobado |

Los corredores 021/022 conservan credenciales; 023 sólo cambia credenciales sintéticas autorizadas. No se ejecutan utilidades que lean .env/base empresarial, respaldo productivo, integraciones reales, instaladores ni limpieza. Ensayos preliminares fallidos se conservan en attempt-*; se corrigieron contrato de reloj, cierre de mantenimiento, transición de clúster y aserciones del corredor; no se relajaron migraciones ni reglas de negocio.

## 15. Archivos creados y modificados

Línea base técnica de 1828 archivos, incluida la utilidad preproductionEvidence.cjs creada al inicio de esta fase; 1815 conservan su huella y 13 se modificaron, todos con copia original cuyo SHA coincide con línea base. Migraciones 018–023, .env y evidencias 2E.1 conservadas. No reset/clean/restauración masiva. Inventario reproducible en source-verification.json.

Modificados:

- `backend/config/operationalTransactions.js`
- `backend/config/revisionApiTransactions.js`
- `backend/revisionApiApp.js`
- `backend/security/credentialPolicy.js`
- `backend/services/bitacora.service.js`
- `backend/services/comandos.service.js`
- `backend/services/credentialAuth.service.js`
- `backend/services/credentialBootstrap.service.js`
- `backend/services/reservacionesCapacity023.service.js`
- `backend/validators/auditoria.validator.js`
- `electron/main.js`
- `scripts/unifiedElectronDriver.cjs`
- `scripts/unifiedProbe.cjs`

Creados en código:

- `backend/config/preproductionPolicy.js`
- `backend/preproductionApi.js`
- `backend/__tests__/preproduction.test.js`
- `electron/preproductionBackend.js`
- `electron/preproductionClientPolicy.js`
- `scripts/preproductionBackup.cjs`
- `scripts/preproductionFirstDriver.cjs`
- `scripts/preproductionLab.cjs`
- `scripts/PreproductionLocal.ps1`
- `scripts/preproductionProbe.cjs`
- `scripts/preproductionSchemaRestore.cjs`
- `scripts/preproductionServer.cjs`
- `scripts/preproductionSetup.cjs`
- scripts/preproductionEvidence.cjs (creado antes de tomar la línea base).

Documentación/evidencias: este informe, contrato, procedimiento de respaldo, matriz/datos, verification.json, Jest, regresiones copiadas, inventario/cierre, hashes, originales selectivos y artefactos PDF/PNG. Los archivos adapt-*.cjs conservan cómo se hicieron las adaptaciones; no son utilidades de despliegue.

## 16. Aislamiento

27 directorios de clúster de esta fase inventariados, incluidos destinos preliminares no provisionados; 23 directorios cliente registrados; puertos en inventory.json. Sólo clústeres nuevos marcados, nombres sintéticos, identidad y rutas verificadas, red loopback y barrera de conexiones de cada fase. Al aprovisionar destino se usa el guard propio de standaloneDev antes del guard de ambos clústeres del coordinador. No acceso a sian_kaan_reservaciones, datos reales ni APIs externas. Secret scan aprobado. Los directorios privados/dumps se conservan con ACL; no se entregan secretos en el informe.

## 17. Cierre

closure.json comprobó **cero procesos propios, cero listeners en los puertos registrados y cero postmaster.pid**. Ningún proceso ajeno fue detenido. Incluye el cierre verificado de un intento interrumpido anterior en attempt-8-closure.json. Clústeres y evidencia se preservan detenidos, sin borrado de datos.

## 18. Pendientes y riesgos

Faltan custodia/cifrado/retención/copia externa, responsables y RPO/RTO aprobados; paquete cliente/servidor, actualización/reversión, HTTPS y confianza, dos equipos reales y aceptación del personal. Un backup antiguo recupera datos anteriores al incidente: validar usuarios y decisiones comerciales antes de reabrir, siempre con nueva época. Propuesta de inicialización limpia sin limpiar la empresa: inventariar, clasificar, respaldar, restaurar de prueba y autorizar registros explícitos antes de cualquier limpieza futura. Integraciones FareHarbor/GetYourGuide y WhatsApp siguen pendientes de documentación/acceso/autorización.

## 19. Reversión selectiva

Con todos los procesos de esta fase detenidos, comparar cada archivo con SHA posterior en source-verification.json; si existe un cambio posterior, detenerse para conservarlo. Sólo reponer los 13 originales desde originals/ después de verificar su SHA inicial y revisar el diff. Deshabilitar el modo explícito basta para volver al camino previo sin tocar datos. Los 14 archivos nuevos pueden retirarse únicamente tras revisar sus referencias y conservar evidencias. No aplicar reversión masiva, no tocar .env ni migraciones, no borrar clústeres/respaldos ni revertir trabajo previo.

## 20. Siguiente etapa propuesta

Preparar un piloto de instalación revisado con personal: aprobar datos/cuentas definitivos, protección LAN y custodia; separar paquetes sin secretos/fixtures; instalar en dos equipos sólo con autorización posterior; ejecutar matriz, restauración cronometrada y revisión de PDF/impresión física autorizada. Resolver incidencias y obtener aceptación antes de cualquier activación productiva.

## Anexo: cantidades e integridad del respaldo recuperado

| Tabla | Filas | SHA256 de filas normalizadas |
| --- | ---: | --- |
| bitacora | 76 | f5ced883152611a1a834eb7a2eab55a242a101b7238cf329eef9094f64254ea1 |
| comandos_idempotentes | 101 | 9adfcb021c14846ab4adbf8471eb55b7eb9e3240844a4db1beb02d1dc31d521a |
| daily_observaciones | 2 | e261f41b8fda70a6b2d57f907e785c3f5c308f514038ecf72874a09bf10f6793 |
| equivalencias_tours_externos | 0 | 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945 |
| eventos_integracion | 3 | 49139253173dd62f5e9047db779c1698cf7fa4b74c1848ae1fc73f72ff37cc17 |
| guias | 2 | bb917a0190563c25ca19e8e5e04181dc6d78afcf473298959bbfb58709589c3c |
| inicializacion_sistema | 1 | bcc048acae0b1c5d021ebddaa9431fc077474d1c1bf826781cc22bd207827f82 |
| integracion_sync_estado | 2 | 75b24433ccdc0d36c760dd2417c97de9e9692680229790bb021660a669b010d7 |
| operaciones_tour | 3 | 0c21866721e006eb1440927bd0a9c1196ee7d027f5cae4a98c8b687f17ac8486 |
| operadores | 2 | 0976c54005e53156029429054b49719e55182c1897da5c29c1c6a822684c465b |
| paises | 2 | 0734c5056cf0560ffa880f373d3d28c8d0bb53be636630223cb19b038beabb8f |
| plataformas | 3 | 6f7c8368f2ab80954c3e472e7d03c6d5ff6247b65fd1b7091d9f0c8603d99be8 |
| reservaciones | 21 | f363795ea033e607862bdfbda7747e3488cb7cbbcc216e919c89c125131478e4 |
| reservas_integracion_link | 0 | 4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945 |
| roles | 2 | c98db3d4a2c5b1faff73e45bbbb4f11695f92ae2e31ffb3a0798318511a04b88 |
| tours | 3 | a876b160dbe52c04a8811bc63113e2d351c2dc6790fd86e01e26e509a28be2ca |
| transportes_operacion | 3 | 9016ac9922a80005953dc629df8958ae840d8aad94633f3913f23c504ceb5c84 |
| usuario_plataformas_visibles | 1 | b1aea0067169fdc4b1fc9a3b7a04745990bbb0c6365fa512dcec77c4b56e1f10 |
| usuarios | 8 | dd937091accc5d04996e0e447fb76d985775efd2f7614772b9eb52dd8d712b83 |
| vehiculos | 3 | f0a24f4da685dfdea2ee97ee164158f7b10f397a6fb4642291889dfe3a334f41 |

Secuencias en verification.json; conjunto completo de restricciones y metadatos públicos firmados en backup-metadata.json. PDFs y capturas en artifacts/source/ y artifacts/restored/; revisión del PDF restaurado en pdf-verification.json.
