# Perfil independiente026 — candidato para revisión

Estado: contrato técnico independiente comprobado bajo una autoridad **nueva de aceptación sintética**. No existe autorización de Community Tours para instalar, aprovisionar empresa, usar LAN, firmar un instalador definitivo o cargar datos reales. La versión actual rechaza expresamente una autoridad que declare `productionAuthorized:true` o alcance empresarial. Su aprobación futura exige una revisión y versión explícitas; no basta cambiar un argumento.

## Límites de confianza y credenciales

`shared/release026.js` define firmas Ed25519 con propósito, autoridad, alcance y vencimiento; inventario cerrado SHA256 y bloqueo de resolución de módulos fuera del paquete. No hay clave pública de laboratorio predeterminada ni firma heredada en el código. La confianza se entrega en archivo externo protegido por ACL y se contrasta con la inscripción firmada. La confianza de prueba no equivale a aprobación empresarial.

El servidor exige `server026.json`, `enrollment026.json`, `authority026.json` y certificados privados externos al paquete. La inscripción liga el hash exacto de configuración, el inventario del servidor, instalación, clúster, base y aprovisionamiento. El recibo separado de creación nueva liga también directorio físico y cero tablas previas. El mantenimiento usa `maintenance026.json` separado: su contraseña no llega al backend runtime ni al cliente.

El backend valida identidad efectiva PostgreSQL18.3, puerto/dirección loopback, clúster, permisos runtime y catálogo exacto023/024/025. El supervisor comprueba además directorio y proceso físico, bootstrap propio y Administrador activo. Conserva un candado PostgreSQL de sesión exclusivo; responde al desafío IPC de su backend con prueba de30segundos vinculada a la configuración. El backend comprueba el PID PostgreSQL del supervisor que retiene ese candado. Pérdida de mantenimiento o cambio de configuración/inventario cierra su backend. Sólo se detienen procesos propios.

JWT queda ligado a instalación, generación y época, además de versión de credenciales vigente y rol comprobado por backend. Se conservan precondiciones, bloqueo operacional transaccional, auditoría y ledger durable. El límite24 cuenta toda reservación activa del mismo tour/fecha/turno, incluida la no asignada y excluida la cancelada. PAX incluye niños; siguen12/grupo y capacidad real del vehículo.

## Creación nueva y migraciones

`scripts/enterprise026Provision.cjs` no recibe host, nombre de base, clúster, usuario SQL ni contraseña existentes. Sólo admite un directorio nuevo y vacío bajo LOCALAPPDATA con ACL privada, un candidato íntegro y autoridad de aceptación explícita. Ejecuta herramientas oficiales18.3, `initdb`, verifica clúster nuevo y que sólo existan las tres bases de sistema, y genera nombre `ctsk_install_` aleatorio y credenciales nuevas. No abre5432 ni LAN. No lee `.env`, dumps o perfiles anteriores.

Aplica `schema.sql`, `seeds.sql` y019–025 fijados por SHA. **Ninguna migración histórica se edita.** El aplicador026 verifica el archivo original completo y adapta exclusivamente la expresión de guarda de022 y023: conserva `current_user=ctsk_standalone_owner` y exige el espacio de nombres nuevo más un identificador de aprovisionamiento capturado en esa conexión. Las comprobaciones de colación y correo de023, funciones, triggers, índices, restricciones y privilegios permanecen idénticos. Los verificadores exactos confirman el catálogo resultante. Es una adaptación contractual explícita para ensayo026, pendiente de aprobación empresarial; no se aplican silenciosamente migraciones históricas a empresa.

Los nombres `ctsk_standalone_owner`, `ctsk_standalone_runtime` y `ctsk_standalone_admin` se conservan como **identificadores técnicos del catálogo histórico**; el propietario es NOLOGIN, runtime limitado y el principal de mantenimiento está aislado. No son cuentas funcionales de acceso ni contienen contraseñas predeterminadas. Cambiarlos requiere un contrato nuevo de privilegios/esquema y bootstrap; no se hizo una sustitución nominal que falseara las huellas aprobadas.

Antes de crear usuarios se fijan los cuatro controles técnicos nuevos de integración en apagado. T0 exige23tablas y contenido técnico exacto:2roles sin cuentas,1país neutral,4plataformas,4controles. Las otras19tablas deben contener0filas. Los sentinelas `0`/`not-applicable-024` de los contratos originales no son cursores de proveedores; cortes, vínculos, eventos, autorizaciones, ejecuciones y avances deben estar ausentes. El verificador rechaza cualquier dato comercial, no sólo textos que parezcan ficticios.

## Primer Administrador y activación local

La herramienta separada `scripts/enterprise026Bootstrap.cjs --server <archivo externo> --authority <confianza externa>` exige terminal local. Captura contraseña técnica y nueva contraseña nominativa sin eco, limpia historial y referencias en memoria, revalida identidad/esquema y serializa la creación del primer Administrador con su singleton. No guarda contraseñas en argumentos, cuentas predeterminadas ni archivos de usuarios.

Tras el COMMIT produce una constancia privada firmada de bootstrap. El responsable de inscripción debe verificarla y el singleton efectivo antes de autorizar `state=initialized` y el origen bootstrap en una nueva inscripción. `enterprise026Provision.persist` exige la clave que corresponde a la autoridad externa; esa clave no forma parte del servidor runtime ni del cliente. El ensayo ejercita el mismo servicio de bootstrap y la reinscripción explícita. Si hay pérdida de respuesta, inspeccionar el singleton y la constancia; nunca crear automáticamente otro usuario ni reiniciar una base poblada.

El supervisor se inicia desde el candidato con configuración y autoridad externas. No migra ni crea usuarios al arrancar. El cliente exige descriptor público firmado por la autoridad, hash exacto del cliente, instalación/época/generación del servidor, CA explícita y pin SPKI. La conexión HTTPS verifica cadena, vigencia, SAN, pin y desafío fresco firmado; Chromium sólo acepta la misma hoja comprobada por OpenSSL. No se instala CA en Windows ni se deshabilita la verificación TLS.

## Respaldo y restauración

`enterprise026Backup.cjs` usa `pg_dump`/`pg_restore` oficiales18.3 con contraseña sólo en entorno privado temporal, snapshot consistente y bloqueo operacional. Incluye23tablas, secuencias, restricciones, origen bootstrap y digest de clave durable. El archivo externo se firma y se contrasta con autoridad de instalación ya confiable; una autoridad declarada dentro del propio dump no basta.

Restaurar únicamente en otro clúster/base nuevos vacíos, creados por el procedimiento026 en modo destino de restauración. Nunca usar `--clean`, sobrescribir una base, modificar un respaldo existente ni restaurar T1 como semilla de distribución. Se conserva la reconstrucción estricta de nueve CHECK cuyo árbol varía en el roundtrip dePG18.3: sólo pares de hashes conocidos, fuentes históricas fijadas y validación final completa; no se relajan verificadores ni se descartan restricciones.

La restauración conserva datos/generación/clave durable, pero genera instalación, época, JWT y clave de identidad nuevos. Una constancia firmada por la autoridad externa liga origen, destino y SHA del archivo. Se verifican filas/secuencias exactas, auditoría, recuperación de comandos, rechazo de JWT anterior y nuevo login. Integraciones siguen apagadas.

## Distribución y puertas empresariales

Sólo candidatos separados de ingeniería. Servidor: backend consolidado, supervisor, bootstrap/aprovisionamiento/respaldo protegidos, contratos SQL históricos y dependencias mínimas fijadas. Cliente: ventana/preload/exportador originales derivados con procedencia verificable, HTML/CSS/JS originales y conector HTTPS; sin pg, backend, SQL, credenciales o módulos npm de servidor. Los informes, drivers, capturas, dumps, autoridades, certificados y configuraciones del ensayo están fuera de ambos paquetes.

Los nombres internos `revisionLab.js`/`commandLab.js` pertenecen ahora también a los adaptadores operativos de precondiciones e idempotencia de los formularios originales: no cargan fixtures ni cuentas de prueba. Se documentan sin ocultar su nombre. Las ramas antiguas de fuentes compartidas no habilitan el entrypoint026 y sus políticas de ensayo no están distribuidas; el cierre runtime comprobado no las importa. Los archivos `_lab.sql` son contratos históricos revisados e inmutables, no datos ni ejecutores de laboratorio.

La integridad interna y las firmas de inscripción se comprobaron con verificadores intactos. **No sustituyen** la firma de código y el canal de distribución confiable del ejecutable/verificador inicial. Community Tours debe aprobar responsables, custodia/rotación/revocación de autoridades y claves, identidad de equipos y bases nuevas, privilegios de mantenimiento, certificados/nombres empresariales, canal de actualización y firma del instalador. Tampoco se ha ensayado LAN ni operación en dos equipos reales.

El piloto en dos equipos requiere autorización nominal y ventana; contrato/versiones e inventarios aprobados; instalador firmado y verificador inicial confiable; diseño HTTPS/LAN y firewall aprobado; dos equipos identificados y cuentasWindows protegidas; respaldo/recuperación aprobado y ensayado en destino nuevo; T0 propio antes del bootstrap; primer Administrador real; aceptación funcional en esa instalación; procedimiento separado y aprobado para datos reales. Las integraciones requieren autorizaciones y cortes elegidos por la empresa posteriormente. Hasta entonces: **instalación empresarial no lista y no ejecutada**.

La clasificación individual y evidencia del ensayo están en [local-fase-2e6-enterprise](local-fase-2e6-enterprise/). La certificación T0 anterior en [local-fase-2e6-clean/CERTIFICACION.md](local-fase-2e6-clean/CERTIFICACION.md) se conserva íntegra.
