# Fase2E.6 — cierre técnico independiente en laboratorio

## 1. Estado del contrato empresarial

Perfil026 independiente implementado y comprobado con autoridad de prueba nueva y explícita. La versión sólo acepta synthetic-acceptance-only y productionAuthorized=false. No permite aprobar empresa cambiando un argumento. **Instalación empresarial no lista/no ejecutada.** Procedimiento y límites en [../PERFIL-EMPRESARIAL-026.md](../PERFIL-EMPRESARIAL-026.md).

## 2. Los41 hallazgos originales

Clasificación individual y resolución en [HALLAZGOS-41.md](HALLAZGOS-41.md) y [findings-41.json](findings-41.json). Categorías1/2/3/4/5: 33/1/4/0/3. Las cuatro rutas googleapis/apis/docs eran código legítimo de Google Docs, innecesario aquí; no eran informes de laboratorio. Ninguno de los41archivos originales está en los candidatos nuevos. Los ZIP anteriores y sus evidencias permanecen intactos.

## 3. Paquetes candidatos y contenido

Candidato final: candidate-08; cliente y servidor separados, sin instalador definitivo.

| ZIP | Archivos | Bytes | SHA256 |
|---|---:|---:|---|
| server | 1024 | 1765580 | `98bfa757b7ebbfb2368e69b60cafa8869bee0577c5582aeb0838f5a92d96c091` |
| client | 53 | 379560 | `456bf37b5cc106ec0c6672ada58ec6bd08d9557d173381bc7f3b5b8e5ebf6c0c` |

Servidor: backend consolidado, supervisor, herramientas protegidas de creación/bootstrap/respaldo, contratos SQL y98dependencias transitivas instaladas (seis dependencias directas, incluido peer opcional explícito supports-color para impedir fallback al repositorio). Cliente: ventana/preload/PDF originales derivados, recursos originales y conector HTTPS; sin backend, pg, SQL ni módulos npm de servidor. No se instaló ni descargó ninguna dependencia.

## 4. Dependencias de laboratorio

El fingerprint antiguo se sustituyó por inventario cerrado vinculado a inscripción firmada. No se distribuyen políticas de arranque023, supervisor025, frontend/lab, probes, fixtures o drivers. El cargador bloquea resolver módulos fuera del paquete. El backend cargó 349módulos iniciales propios; cero dependencias del repositorio exterior o firmas anteriores. Nombres técnicos conservados con justificación: adaptadores revisionLab/commandLab de los formularios, roles SQL históricos y contratos _lab.sql inmutables. Las ramas de compatibilidad con perfiles viejos son inalcanzables desde este entrypoint y sus módulos no están incluidos. Véase [candidate-08/package-audit.json](candidate-08/package-audit.json).

## 5. Migraciones y contratos

Nueve fuentes fijadas: schema/seeds y019–025. Se conservaron hashes y catálogo exacto023/024/025, incluidos permisos de referencias manuales e integraciones apagadas. Sólo el aplicador nuevo adapta explícitamente las expresiones de guarda022/023 a base nueva026 más nonce de aprovisionamiento; no edita archivos históricos ni altera objetos/relaciones/columnas. No se aplicó nada a sian_kaan_reservaciones o sian_kaan_reservaciones_dev.

## 6. Certificación T0 independiente

[Certificación técnica](CERTIFICACION-LIMPIA.md):23tablas, cero usuarios y filas comerciales antes del bootstrap; sólo contenido técnico exacto autorizado para el ensayo. Estado y conteos íntegros en [attempt-10/verification.json](attempt-10/verification.json). Certificado T0 anterior conservado sin modificaciones.

## 7. Primer acceso T1

Bootstrap seguro único, contraseña nominativa sin defaults ni textos planos persistidos. Segundo bootstrap rechazado. Login desde ventana original, catálogos y reservaciones, captura/corrección de referencia025 en el formulario original. T1 poblado se rechaza automáticamente como plantilla limpia. Las evidencias con datos T1 están fuera del entregable.

## 8. HTTPS local

TLS estricto con CA sintética nueva, SAN127.0.0.1, vigencia, pin SPKI y desafío firmado fresco. Rechazados: CA desconocida, nombre incorrecto, descriptor inválido, otra instalación, sesión revocada, paquete alterado, segundo supervisor y base incompatible. No se deshabilitó TLS, instaló CA Windows ni abrió LAN/firewall.

## 9. Pruebas

1121pruebas Jest/40suites seleccionadas, con mocks de pg y barrera de red. 15grupos reales PostgreSQL18.3/HTTPS/Electron43.4.1 y4sesiones Electron, con primer login, formulario de referencias, Daily/PDF, reinicio y restauración. Fallo de auditoría provocado por restricción temporal exclusivamente en T1 nuevo: HTTP500 y negocio/bitácora/ledger sin cambios. Se retiró únicamente esa restricción de ensayo y se verificó otra vez el catálogo exacto. Los xmin de SAVEPOINT pueden diferir y nextval no revierte: avanzó bitacora_id_bitacora_seq, sin filas persistidas. La restauración sí exige secuencias exactamente iguales.

La invocación inicial amplia de Jest recorrió copias de evidencia y suites heredadas que exigen una configuración privada; se detuvo tras rechazos PRIVATE_PARENT, sin una conexión autorizada a empresa. La ejecución válida es run-jest.cjs con selección explícita y noPostgres/network guard. Intentos preliminares conservados: error del generador de guarda SQL, cierre de dependencias y dos suposiciones incorrectas del ensayo sobre xmin/secuencias. Cada repetición usa otro entorno nuevo. No se atribuyen resultados aprobados a intentos fallidos.

## 10. Respaldo y restauración

pg_dump/pg_restore oficiales18.3; snapshot consistente, firma y hash del archivo privado externo. Rechazo de metadatos alterados y destino no vacío. Se restauraron23tablas, secuencias, restricciones y referencias; reconstrucción estricta de los nueve CHECK conocidos del roundtrip. Identidad/época/JWT nuevos; token previo401; mismo ledger recuperable con clave durable preservada. SHA del dump de aceptación (no distribuido): `b1402820b27ecc01cd9621026bbd7dfb8df5969f780df5f6ed44e0afd7e60028`.

## 11. Integraciones apagadas

Publicación/automatización/recovery=false; sin fecha de corte, avance, eventos o vínculos heredados. Cero llamadas a proveedores. No se iniciaron ni detuvieron tareas anteriores; WhatsApp no activado. No se fijó una fecha empresarial.

## 12. Integridad de paquetes

Inscripción firma hash de configuración e inventario, identidad de clúster/base e instalación. Inventario cerrado detecta archivos extras/faltantes/alterados; resolución de módulos confinada al paquete. ZIP comprobados con testzip y SHA externo. [Auditoría](candidate-08/package-audit.json), [hashes ZIP](candidate-08/archives.json). Esto no sustituye la firma/canal confiable del ejecutable y verificador inicial pendientes de aprobación.

## 13. Archivos y hashes

23archivos existentes modificados con23copias selectivas verificadas y14fuentes/documentos nuevos. 41926archivos previos contrastados, cero eliminaciones y migraciones históricas intactas. [source-verification.json](source-verification.json) identifica cada archivo, antes/después y copia; [candidate-08/build-report.json](candidate-08/build-report.json) contiene procedencia e inventario de distribución. No git reset/clean ni limpieza de datos.

## 14. Procesos y puertos

[closure.json](closure.json):13clústeres propios detenidos, 32puertos observados sin listeners, cero procesos Node/Electron/PostgreSQL propios. La inspección fue sólo lectura; no detuvo servicios o tareas ajenos.

## 15. Pendientes técnicos

Sin dependencias experimentales obligatorias en el cierre runtime comprobado. Permanecen fuera de alcance autorizado la raíz/custodia empresarial de confianza, firma del ejecutable/verificador inicial e instalador, actualización/revocación, certificados empresariales, diseño y pruebas LAN/two-PC, mecanismo Windows de despliegue y política de cifrado/custodia de respaldos. Esta versión falla cerrada ante autoridad empresarial; requiere revisión/versionado explícito posterior. No se presenta como instalador definitivo.

## 16. Decisiones de Community Tours

Aprobar contrato026/adaptación de guardas y nombres/privilegios técnicos; responsable de instalación y autoridad; equipos/cuentasWindows; política de claves/certificados/rotación; distribución firmada y actualizaciones; respaldos/recuperación; aceptación funcional y ventana de piloto; proceso y mapeos de carga real. Integraciones y fecha de corte requieren autorizaciones independientes posteriores.

## 17. Condiciones para piloto en dos equipos

Autorización nominal y ventana; versiones/inventarios aprobados; ejecutable y verificador inicial firmados por canal confiable; identidad y ACL de ambos equipos; HTTPS/LAN/firewall revisados; destino nuevo y T0 propio; bootstrap real seguro; respaldo/restauración comprobados; aceptación funcional en esos equipos; procedimiento separado de datos reales. Mantener integraciones apagadas hasta autorización específica. Ninguna condición se presume cumplida por este ensayo local. **No instalar ni aprovisionar empresa todavía.**
