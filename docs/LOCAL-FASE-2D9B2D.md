# FASE 2D.9B.2D — Backend de credenciales y auditoría 023

28 de octubre de 2026. Entrega A+B, exclusivamente en clústeres sintéticos nuevos y HTTP `127.0.0.1`.

La entrada optativa `backend/credentialSecurityApi.js` incorpora versión durable de credenciales, JWT 023, creación auditada y reset auditado. Los escritores de B requieren una prueba firmada de A para el mismo código, clúster, generación y esquema. La entrada principal, formularios, Electron, migraciones 018–022, integraciones y base `sian_kaan_reservaciones` se conservan. La tabla de inicialización permanece vacía; no se ejecutó bootstrap.

## 1. Archivos y conservación

Se inventariaron 1,327 archivos previos. Solo cambiaron doce fuentes autorizadas; 1,315 permanecen idénticas, no falta ninguna y cada fuente modificada tiene respaldo exacto anterior. La comparación del estado Git conserva todas las entradas locales anteriores. No se usó reset, clean ni restauración masiva.

Fuentes modificadas:

- `backend/config/operationalTransactions.js`: reconoce únicamente el nuevo perfil/esquema 023.
- `backend/config/revisionApiTransactions.js`: contexto de alta/reset y recuperación READ COMMITTED después del candado.
- `backend/controllers/auth.controller.js`: login 023 y descarte de contraseña.
- `backend/controllers/usuarios.controller.js`: motivo separado, validación y errores sin logs sensibles en 023.
- `backend/middleware/auth.middleware.js`: selecciona la autenticación 023 exclusivamente en ese perfil.
- `backend/revisionApiApp.js`: puertas A/B, precondiciones autorizadas y descarte de secretos tras responder.
- `backend/security/revisionApiState.js`: versión de credenciales en la huella opaca, sin incluir hashes.
- `backend/services/bitacora.service.js`: alta pública y evento especial de contraseña 022.
- `backend/services/comandos.service.js`: revalidación de versión y autenticación reciente.
- `backend/services/usuarios.service.js`: correo canónico, rol soportado, alta/reset auditados en la transacción exterior.
- `backend/validators/auditoria.validator.js`: reconoce el perfil 023.
- `backend/validators/usuarios.validator.js`: política de correo y secreto exclusiva de 023.

Quince fuentes nuevas:

| Grupo | Archivos |
| --- | --- |
| Esquema | `database/migrations/023_seguridad_credenciales_lab.sql`, `backend/config/credentialSchema.js`, `backend/config/credentialSchemaContract.js` |
| Perfil e identidad | `backend/config/credentialSecurityPolicy.js`, `backend/credentialSecurityApi.js` |
| Autenticación | `backend/security/credentialPolicy.js`, `backend/services/credentialAuth.service.js` |
| Laboratorio | `scripts/CredentialSecurityLab.ps1`, `scripts/credentialSecurityLab.cjs`, `scripts/credentialSecurityFixtures.cjs`, `scripts/credentialSecurityProbe.cjs` |
| Casos reales | `scripts/credentialSecurityACases.cjs`, `scripts/credentialSecurityBCases.cjs` |
| Cliente privado | `scripts/credentialIntentClient.cjs` |
| Jest | `backend/__tests__/credentialSecurity.test.js` |

El resto de archivos nuevos son este informe y evidencias en `docs/local-fase-2d9b2d/`. `created-code-files.json`, `source-before.json`, `source-verification.json`, `git-preservation.json` y `reversion-manifest.json` permiten revisar los nombres y hashes exactos. El respaldo adicional de `auth.service.js` no implica modificación: su fuente original permanece idéntica.

## 2. Esquema y contrato 023

Migración nueva, sin editar 018–022:

- `usuarios.version_credenciales BIGINT NOT NULL DEFAULT 1`, CHECK positivo.
- Trigger BEFORE INSERT/UPDATE, ENABLE ALWAYS y SECURITY INVOKER. Incrementa una vez por cambio material de hash o estado, incluida reactivación. Nombre, correo, rol, plataformas y estado idéntico conservan el contador.
- Rechaza cambio directo del contador y overflow en `9223372036854775807`. El runtime carece de INSERT/UPDATE sobre contador e identidad, DELETE/TRUNCATE de Usuarios y potestad para alterar guardias.
- `ctsk_correo_clave_023` y un índice único funcional aplican trim explícito de blancos y lower con collation C. Se verifican C/C/UTF8, duplicados y diferencias JS/PostgreSQL antes de migrar. No se fusionan ni reparan cuentas.
- Singleton `inicializacion_sistema`: clave fija 1, UUID de inicialización, Usuario inicial único/FK, instante, generación, clúster, versión inicial 23, huella de herramienta y principal SQL. Guardias ALWAYS impiden UPDATE/DELETE/TRUNCATE; runtime y PUBLIC no tienen acceso.

La huella de catálogo revisado es `851067a43b10ec23b0b01b6604824c40fe949aeb426254ceb75384246f5843c2`. La migración LF tiene SHA-256 `976ba372e048de8c19d7ccd18d6441339f4f2eeeb8b13f9d422fa03302dc5621`.

El verificador compara columnas, tipos, defaults, nulabilidad, identidad, constraints, índices, triggers, propietarios, privilegios de tabla/columna/función, cuerpos SQL, search_path, SECURITY INVOKER y locale. Compone los contratos 019–022 originales. No aprende ni acepta automáticamente el esquema observado: `catalog-reviewed.json` documenta la revisión previa y el digest fijo decide aceptación.

## 3. Hito A independiente y dependencia de B

El primer A validado está en `milestone-a-verification.json`: **33 comprobaciones**, escritores B cerrados, cero intentos de alta/reset por la aplicación y PostgreSQL detenido. Esa validación ocurrió antes de implementar los escritores B.

Cada recorrido A+B posterior vuelve a ejecutar A en un clúster nuevo. Solo después escribe `security-a-proof.json`, firmado mediante HMAC con la clave privada de comandos. El manifiesto B incluye el digest de esa prueba. Se comprueban firma, código, identidad de clúster, generación, esquema y resultado completo. Una prueba ausente, alterada o ajena impide abrir B. El manifiesto de A conserva las rutas B cerradas incluso con el código B presente.

Las comprobaciones A incluyen autenticación HTTP real, esquema/ACL, BIGINT superior a 2^53, overflow y rollback, dos JWT simultáneos revocados, desactivación/reactivación, cambios que no revocan, Unicode, autenticación reciente, correos ambiguos, login concurrente contra reset y recuperación esperando el candado. También rechazan manifiestos/configuraciones/claves alterados y entradas 020–022 con manifiesto 023 antes de escuchar HTTP.

## 4. Contraseñas y compatibilidad histórica

Nuevas asignaciones exigen ocho puntos de código Unicode, máximo 72 bytes UTF-8, texto bien formado y ausencia de NUL y cadenas solo de blancos. No se aplica trim, NFC/NFD ni truncamiento. bcrypt conserva costo 12. El recorrido real acepta exactamente 72 bytes de caracteres astrales aleatorios, compara el hash y autentica después.

El login no impone retrospectivamente el mínimo nuevo: una contraseña histórica de cuatro caracteres astrales sigue autenticando. Sí aplica los límites de entrada segura. Secretos históricos de más de 72 bytes, solo blancos, con NUL o sustitutos aislados quedan fuera del contrato nuevo y necesitan una recuperación autorizada posterior; sus hashes no se alteran automáticamente.

La prueba histórica mayor de 72 bytes demuestra además la limitación previa de bcrypt: el prefijo conocido de 72 bytes puede comparar con ese hash legado. Rechazar entradas largas no deshace esa equivalencia del hash existente. No se intenta reparar, truncar ni rehashear silenciosamente. La collation C es un contrato del laboratorio; requiere una revisión independiente con datos reales antes de producción.

## 5. JWT, revocación y login consistente

JWT HS256 con `sub`, `cv` decimal canónica como string, `dg`, `iss=ctsk-lab-023`, `aud=ctsk-desktop-023`, `token_use=access`, `iat` y `exp`, TTL de ocho horas. No contiene rol autoritativo. Se verifican firma, algoritmo, emisor, audiencia, generación, tipo, identidad, tiempos y versión actual PostgreSQL. Se rechazan tokens heredados o sin versión y no se aplican defaults de compatibilidad.

Cada petición verifica cuenta activa, rol soportado y versión. Escrituras y recuperación vuelven a consultar después del candado transaccional común. La recuperación 023 usa READ COMMITTED y lectura posterior al candado; los perfiles previos conservan su contrato anterior.

El login primero compara bcrypt y después relee identidad, correo canónico, estado y versión bajo el candado. Una barrera IPC privada pausa después de compare; un reset SQL 023 confirmado mientras espera impide emitir el token. Para altas y resets nuevos se comprueba antigüedad de login de hasta cinco minutos tanto al preparar como al ejecutar. Recuperar un comando confirmado solo exige sesión y permisos vigentes, sin repetir el requisito de frescura ni reenviar la contraseña.

## 6. Alta y reset auditados

B habilita únicamente:

- POST `/api/usuarios`.
- PATCH `/api/usuarios/:id`.
- PATCH `/api/usuarios/:id/password`.

El alta reutiliza el servicio existente: valida Administrador vigente, rol soportado, identidad inequívoca, contraseña y alcance explícito de Consulta. Admin conserva alcance efectivo all; Consulta admite all, selected y selected vacío. Las plataformas se validan contra PostgreSQL y se ordenan. No se entrega sesión a la nueva cuenta. CREAR guarda exclusivamente los seis campos públicos permitidos por 022.

El reset exige motivo humano, cuenta objetivo, intención única y precondiciones. Dentro de la transacción exterior se revalida al actor, guarda bcrypt12, el trigger incrementa la versión, se registra `CAMBIAR_PASSWORD`, se inserta el ledger y se validan restricciones diferidas antes del COMMIT. El evento usa fotos **SQL NULL**, referencia al Usuario afectado y descripción fija **Cambio de contraseña**. Resetear un Usuario inactivo no lo activa.

Una nueva intención con la misma contraseña vuelve a hashear y revocar. Repetir una intención confirmada devuelve su recibo sin otro hash, incremento o auditoría. La clave con secreto o motivo diferente produce 409. El reset propio puede confirmar e invalidar después al emisor; no se revalida retroactivamente el token ya usado para confirmar esa transacción.

## 7. Recuperación y confirmación

El cliente privado de laboratorio exige `confirmed:true` antes de despachar. Tras éxito, error o pérdida de respuesta elimina body, contraseña, token y headers del comando. Solo conserva en RAM `{generation, actorId, key, kind}`. No tiene persistencia ni reenvío automático. Los replays intencionales del arnés son casos adversariales explícitos que reconstruyen entradas desde fixtures privadas, separados de este adaptador.

Se pierde de forma privada una respuesta después de COMMIT y se recupera el recibo por GET, también después de reiniciar el backend. La pérdida se prueba asimismo al cambiar la contraseña propia: el JWT anterior devuelve 401; un login nuevo como el mismo actor recupera la clave original. Otro Administrador no obtiene ese recibo. Un 404 es desconocido y no concluyente: dos recuperaciones del cliente siguen siendo GET, sin reenviar secreto ni crear otra intención.

Esto valida un adaptador privado y el contrato backend. La confirmación y la conservación de referencias en los formularios originales corresponden a C, que no se inició.

## 8. Integridad, permisos y fallos

Las pruebas verifican filas y relaciones reales, hashes por compare, versiones string, IDs de auditoría, recibos y snapshots. La instrumentación privada registra cliente, PID PostgreSQL, ID de transacción y savepoints. Cada intención auditada comparte la transacción principal entre negocio, asignaciones cuando corresponden, Bitácora y ledger.

Se inyectan fallos en negocio, después de negocio, auditoría, después de auditoría, ledger, después de ledger, restricción diferida, INSERT de asignaciones y después de asignaciones. Los nueve casos dedicados restauran hash, versión, cuenta, relaciones, auditoría y ledger según corresponda. Un caso adicional usa fallo comercial técnico privado para probar recuperación 404 sin reenvío. Los fallos técnicos no se convierten en rechazos durables ni en éxito aparente.

Se conservan autodesactivación/autodegradación y último Administrador. El último puede cambiar su propia contraseña, permanece activo y vuelve a entrar. Consulta carece de escritores y recuperación administrativa. El actor, fotografías, hash y contador enviados por el cliente no tienen autoridad. Una carrera de dos Administradores produce un solo reset y un 412; una misma intención simultánea produce un único resultado. Un reset cambia el ETag de la cuenta; un cambio ajeno del contexto produce 409. No-op conserva xmin, versión y ausencia de auditoría.

## 9. Resultados y evidencias

Los totales definitivos, distribución HTTP, IDs de transacción y resultados independientes se registran en `verification-summary.json` y `http-verification.json`. Las comprobaciones SQL 021 de preparación se declaran por separado y no se suman como funcionalidades nuevas de B.

| Verificación | Resultado |
| --- | --- |
| A previo a implementar B | 33 comprobaciones, escritores B cerrados |
| A final, con B cerrado | 33 comprobaciones y 42 solicitudes HTTP |
| B final, tras prueba firmada A | 39 comprobaciones y 226 solicitudes HTTP |
| A+B final | 72 comprobaciones, 268 solicitudes HTTP y cero fallos pendientes |
| Integridad | 19 intenciones auditadas con cliente/PID/transacción comunes; nueve rollbacks dedicados |
| Jest | 761 pruebas, 19 suites, cero fallos; 78 pruebas nuevas |
| Regresión original Catálogos 022 | 73 comprobaciones reales, completa y detenida |
| Regresión original API 021 | 44 comprobaciones reales, completa y detenida |
| Preparación SQL 021 de cada laboratorio 023 | 91 comprobaciones del módulo original, antes de extender a 022/023 |

Jest ejecutó las 18 suites seleccionadas en 2D.9B.2B más `credentialSecurity.test.js`, con dobles de PostgreSQL. Los recorridos reales usan servidores, autenticación y PostgreSQL separados; los resultados de mocks no se presentan como SQL real. Los informes finales conservan tres auditorías históricas, siete operativas y 19 administrativas. El ledger termina con 27 confirmados y 38 rechazados, incluidos los comandos sintéticos de preparación 021; esos 65 recibos no se presentan como 65 modificaciones nuevas de Usuarios.

Antes de ejecutar regresiones se inspeccionaron sus efectos. Catálogos 022 y API 021 crean cuentas iniciales únicamente en fixtures y no ejecutan reset/alta HTTP de Usuarios. **No se ejecutó `CommandApiLab.ps1` completo**, `AdminAuditSchemaLab.ps1` completo, suite global, corredores de interfaces, Electron, PDF, instaladores ni integraciones. La autorización de contraseñas sintéticas se usó solo en el perfil nuevo 023.

## 10. Logs, aislamiento y cierre

La aplicación no devuelve secretos ni hashes en precondiciones, recibos, auditoría o errores. El login devuelve únicamente su JWT autorizado. Contraseñas, hashes y JWT se registran solo en memoria del arnés para compararlos contra respuestas y evidencias. La clave HMAC protege la huella de intención; el ledger no conserva el body ni el JWT. El contexto usa datos públicos de Usuarios y versión, nunca hashes.

Los logs de servidor y PostgreSQL, auditorías, ledger e informes se escanean contra valores sintéticos reales. PostgreSQL usa `log_statement=none` y `log_min_error_statement=panic`. No se copian runtime.env, test-user.json, claves ni datos del clúster a las evidencias públicas. El probe y sus fallos son IPC privado; la entrada normal no los importa ni expone rutas de pruebas.

Cada ejecución crea directorio privado, clúster, puertos y credenciales nuevos. Se validan propietario/runtime, identidad, versión 18.3, generación, ACL y huella antes de escuchar. Se trazan sockets de padres y backend, limitados a sus puertos loopback propios. `labs.json` identifica las ejecuciones y `closure.json` comprueba ausencia de postmaster.pid, listeners y procesos propios al terminar. No se sondea la base principal ni se cambia firewall, servicios, certificados o configuración de red.

## 11. Intentos previos, límites y reversión

El cierre final verificó **siete clústeres detenidos, catorce puertos sin listeners y cero procesos propios restantes**. `credential-safety.json` documenta además 57 archivos públicos revisados contra 43 secretos privados distintos, sin coincidencias, además del escaneo en vivo de contraseñas, hashes y JWT generados durante A/B.

Se conserva el primer intento de inventario, cerrado deliberadamente antes de abrir HTTP para revisar y fijar el digest del catálogo. El primer B llegó al escaneo final, que detectó que la contraseña de una fixture Unicode coincidía con un motivo público de la prueba histórica 021. No se omitió ese control: las fixtures pasaron a secretos Unicode aleatorios y se repitió A+B en un clúster nuevo hasta completar el escaneo. `ab-first-attempt.json` conserva el rechazo; no se suma como éxito. Una ejecución A+B posterior ya válida se conserva como antecedente de la última ampliación de evidencia de logs/404.

La activación sigue siendo optativa y limitada a laboratorio; no es despliegue productivo ni integración con formularios. Quedan pendientes revisión de correos/datos reales, recuperación de casos históricos fuera del contrato, aceptación operativa y distribución. No se introducen sesiones persistidas, refresh tokens ni bootstrap ejecutable.

Para desactivar la entrega basta con no iniciar `credentialSecurityApi.js`. No se requiere downmigration sobre ninguna base existente. Para una reversión de fuentes, revisar `reversion-manifest.json`, comprobar que cada archivo actual aún tiene su hash `after`, y copiar individualmente su respaldo exacto de `originals/`. Si cambió después, revisar el diff y retirar solo estas líneas; no reemplazar trabajo posterior. Las quince fuentes creadas solo se retiran individualmente si siguen teniendo el hash registrado. Conservar informes y respaldos. No usar Git HEAD como sustituto del estado local previo ni eliminar directorios calculados de forma recursiva.

## 12. Recomendación para C+D

Para reproducir la evidencia con clústeres nuevos, ejecutar desde el repositorio `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/CredentialSecurityLab.ps1 -Mode VerifyA` o `-Mode Verify` para A+B. Verify no acepta reutilizar directorio; Stop requiere el directorio privado propio explícito. Los manifiestos y claves quedan en ese directorio privado y no deben trasladarse a producción ni incluirse en evidencias públicas.

Avanzar primero con la integración de formularios autorizada por separado: confirmación humana de alta/reset, motivo, precondiciones, JWT solo en memoria, terminación de sesión revocada y referencia mínima de recuperación que sobreviva al descarte local de credenciales sin persistir el secreto. Los comparadores deben mostrar campos públicos y nunca contraseñas.

Diseñar y probar después el bootstrap offline con privilegio y propósito propios, transacción atómica y constancia singleton; la existencia de la tabla no autoriza inicializar cuentas. Revalidar correos, collation, hashes históricos, esquema y modelo de distribución con datos reales antes de activar una entrada empresarial. Esta entrega no inicia C, D ni producción.
