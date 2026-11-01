# Fase 2E.3 — activación única y recuperación controlada

Fecha: {{DATE}}. **Implementación experimental verificada en laboratorio; sincronización real no activada.** FareHarbor se ensayó con HTTP simulado y PostgreSQL real. GetYourGuide permanece bloqueado para automatización, con reconciliación manual. No se acredita conectividad ni permisos reales.

## 1. Matriz de capacidades oficiales

[MATRIZ-CAPACIDADES.md](MATRIZ-CAPACIDADES.md) documenta la Puerta A, redactada antes de iniciar el proceso automático simulado. FareHarbor dispone de lectura documentada por día de creación UTC y detalle por UUID. Supplier API de GetYourGuide exige otro flujo: el proveedor recibe solicitudes de reserva/booking/cancelación, con requisitos de integración completa. No se inventó una consulta histórica GetYourGuide.

Fuentes: [FareHarbor API](https://demo.fareharbor.com/api/external/v1/api-reference), [FareHarbor integración/límites](https://developer.fareharbor.com/api/external/v1/), [GetYourGuide Supplier API](https://integrator.getyourguide.com/documentation/overview) y [modalidades de conectividad](https://supply.getyourguide.support/hc/en-us/articles/20309311919773-Connecting-Your-Product-to-a-Reservation-System-Inbound-Outbound-Connectors).

## 2. Permisos disponibles y limitaciones

No se usaron credenciales reales ni se probaron sus permisos. Los clientes existentes y reportes antiguos no acreditan acceso vigente. El adaptador nuevo rechaza todo destino externo y requiere empresa sintética/loopback. Las tareas/runtimes independientes descritos en fases anteriores no se detuvieron, reconfiguraron ni revalidaron: su estado operativo actual queda fuera de este ensayo. «Bloqueado» describe la nueva automatización, no una afirmación inventada sobre aquellos procesos.

## 3. Recepción frente a consulta

FareHarbor se consulta mediante los GET documentados; la lista por creación no sustituye la conciliación de UUID ya vinculados para modificaciones/cancelaciones. GetYourGuide necesita modalidad y homologación autorizadas, creación original verificable y continuidad suficiente. Sus reintentos no garantizan recuperación de cinco días. No se publicó receptor, no se abrió túnel/LAN y no se presentó Gmail como Supplier API. Una cola local por sí sola no acredita el cumplimiento de un flujo que debe responder a disponibilidad y confirmaciones en tiempo real.

## 4. Primera activación única

En Configuración de Electron original se confirma fecha/hora America/Cancun, motivo y responsable, con sesión reciente y permisos vivos. El ensayo eligió el ejemplo **2026-12-02 00:00 America/Cancun = 2026-12-02T05:00:00Z**. Es un dato sintético del conductor, no una fecha fija de producción. El trigger conserva corte y responsabilidad originales; otra activación y cualquier cambio directo del corte se rechazan. Pausa/reanudación y recuperación de un recibo no repiten la exclusión inicial.

La corrección excepcional permanece fuera de HTTP/runtime y exige autorización empresarial, inventario, respaldo/restauración verificados y mantenimiento/auditoría específicos revisados; no existe bypass genérico. Procedimiento en [DISENO-Y-OPERACION.md](DISENO-Y-OPERACION.md).

## 5. Estado durable y recuperación

Propuesta024 con SHA fijo **{{MIGRATION_SHA}}**, aplicada sólo a bases sintéticas nuevas. Se reutilizan integracion_sync_estado, eventos, vínculos y equivalencias. Se añaden campos de corte, habilitación/autorización, avance confirmado, intentos/resultado/error, backoff y trabajo pendiente. Gmail/publicación no cambian de semántica; last_history_id no se usa para el nuevo avance. El esquema técnico ctsk_sync024 guarda recibos de controles y baseline de conciliación, separado del ledger020.

El corte original y confirmed_through son independientes. Se serializan dueños y transacciones; run_id, instancia y plazo rechazan respuestas de un ejecutor anterior. Hay solapamiento diario, reanudación de ventana parcial y retención de UUID aunque la lista siguiente lo omita. No se confirma una ventana incompleta ni se descartan pendientes para avanzar.

## 6. Identidad externa y duplicados

Unicidad por proveedor+UUID en vínculos; eventos y snapshot de conciliación participan en la misma transacción del negocio. Duplicados, dos workers reales, dos transacciones concurrentes, respuesta perdida después de COMMIT y reinicio se comprobaron sin doble reserva. Los controles tienen UUID de intención, huella y resultado durable propios; se recuperan por GET tanto éxito como rechazo sin volver a enviar.

## 7. Normalización y equivalencias

Se reutilizan mapper, constructor y validadores FareHarbor existentes. Se verifica identidad/empresa, creación con zona, cantidad de pasajeros consistente, categorías, importes, pickup y equivalencia activa. El constructor se utiliza sólo para producir datos validados; un evento de modificación conserva su tipo real. Faltas o ambigüedades van a revisión. No se crean tours, vehículos ni operadores para acomodar reservas.

## 8. Cancelaciones y modificaciones

Se reconsulta detalle actual de UUID vinculados, incluyendo los cambios del periodo desconectado. Snapshot interno permite detectar cambios humanos: no se sobreescriben observaciones ni asignaciones. Reservas antiguas modificadas después siguen excluidas por creación original. Coincidencias con códigos manuales, vínculos heredados sin baseline, rebookings y reglas ambiguas requieren revisión; no se implementó una vinculación forzada ni se borró información histórica.

## 9. Conflictos y cupo

Los escritores existentes aplican máximo24 PAX activos por tour/fecha/turno desde alta/edición, incluyendo reservas sin transporte y niños y excluyendo canceladas. El ensayo admitió24 y rechazó25 conservando el evento. No asigna transporte automáticamente. La capacidad12/vehículo, mínimos y asignaciones conservan los servicios y regresiones anteriores. Una modificación en conflicto con observaciones humanas quedó pendiente, sin sobrescritura.

## 10. Auditoría y pendientes

Cambios de negocio y auditoría se confirman junto con vínculo/evento/baseline. Fallos inyectados después del negocio y después del recibo revierten todo. El control inicial guarda usuario/motivo y recibo ligado a su auditoría. Errores de proveedor y conflictos quedan en eventos pendientes; no son reservas ficticias. Centro de Avisos conserva sus lecturas y Dashboard añade una señal explícita de reconciliación. GetYourGuide indica recuperación no verificada y mantiene la captura manual.

## 11. Pruebas sintéticas

**{{JEST_TESTS}} pruebas Jest / {{JEST_SUITES}} suites aprobadas.** Se distinguen dobles unitarios, HTTP local real del proveedor simulado, workers separados, backend consolidado023, PostgreSQL18.3 real y Electron original. El coordinador aprobó **{{CHECKS}} grupos** que cubren los28 escenarios solicitados; detalles en [ESCENARIOS.md](ESCENARIOS.md), verification.json y Jest.

Los intentos preliminares y diagnósticos se conservaron. Se corrigieron el permiso frontend de un solo envío para controles, el uso del constructor de datos en modificaciones, retención de pendientes y captura/ruta visual. Ninguno se presentó como verificación exitosa. La instrumentación vive sólo en un canal privado heredado del probe; no hay endpoint público de worker o fallos.

## 12. Persistencia y restauración

Origen: {{SOURCE_DIRECTORY}}. Destino nuevo: {{TARGET_DIRECTORY}}. Base restaurada: {{RESTORED_DATABASE}}. Respaldo: {{BACKUP_DIRECTORY}}; SHA256 **{{BACKUP_SHA}}**.

pg_dump/pg_restore18.3 preservaron **{{BACKUP_TABLES}} tablas**, columnas nuevas, ambos esquemas técnicos, secuencias, relaciones, singleton, usuarios/versiones, recibos, corte, cursor, pendientes, eventos y vínculos. La aplicación restaurada inició y Electron consultó Configuración/Avisos. El snapshot completo coincidió con el respaldo antes de reautorizar. Nueva época/JWT impide sesiones antiguas; el worker exige reautorización administrativa tras restaurar, preservando el corte inicial. Reiniciar normalmente no cambia la época.

## 13. Regresiones comerciales y de seguridad

{{REGRESSIONS}}

Las suites FareHarbor de cliente/mapper/alta/modificación/cancelación y GetYourGuide de continuidad/prioridad usan dobles revisados. Los corredores021–023 se revisaron antes de ejecutarse y sólo modificaron usuarios/datos de sus clústeres nuevos. No se ejecutaron despliegues, respaldos productivos, sincronizadores reales, instaladores, tareas Windows ni corredores sobre la base empresarial.

## 14. Archivos y preservación

Línea base: **{{PRIOR_FILES}}** archivos; **{{UNCHANGED_FILES}}** sin cambios; **{{CHANGED_FILES}}** modificados con originales SHA256 conservados. Migraciones018–023, schema.sql, fuentes y evidencias previas permanecen intactos. No se leyó .env ni se usó reset/clean/restauración masiva. Inventarios en source-before.json y source-verification.json.

Modificados:

{{MODIFIED_LIST}}

Creados en código:

{{CREATED_LIST}}

Además: matriz de capacidades, contrato operativo, escenarios, informe, inventario/cierre, Jest, regresiones, originales selectivos, metadatos públicos firmados del respaldo y capturas. Reversión selectiva: detener procesos propios y comparar SHA posterior antes de reponer sólo estos originales; conservar schema024, datos, pendientes y evidencias. No restaurar un dump sobre datos posteriores como reversión de código.

## 15. Aislamiento y cierre

{{LAB_DIRECTORIES}} directorios de clúster registrados (incluye destinos preliminares vacíos), {{CLIENT_DIRECTORIES}} directorios cliente y {{PORTS}} puertos de la fase. Únicamente loopback, nuevas identidades y ACL privadas. Secret scan aprobado. closure.json acredita **cero procesos propios, cero listeners en sus puertos y cero postmaster.pid**. No se detuvieron procesos ajenos ni se borraron los laboratorios.

## 16. Confirmado y bloqueado por proveedor

| Proveedor | Confirmado en esta fase | Bloqueado / pendiente |
| --- | --- | --- |
| FareHarbor | Contrato documental, simulación HTTP, corte, recuperación del10al15, normalización y deduplicación transaccional | Credenciales/permisos reales, alcance completo/retención/consistencia, cuotas compartidas por IP y piloto autorizado |
| GetYourGuide | Diferencia de modalidad, bloqueo seguro y alertas de reconciliación manual | Homologación Supplier API, autenticación/mensajes reales, creación original y recuperación autorizadas, arquitectura continuamente disponible |

## 17. Riesgos antes de activar

No afirmar garantía histórica por un cliente existente ni por correos. Revisar runtimes independientes instalados antes de cualquier piloto para evitar dos productores, cortes inconsistentes o mezclar publicación con automatización. Resolver equivalencias/campos y autoridad sobre cambios manuales. Acordar retención, reconciliación de ventanas no recuperables, alertas, cuotas y disponibilidad, custodia de secretos, HTTPS y aceptación del personal. El simulador y el límite defensivo no sustituyen validación de producción.

## 18. Piloto posterior recomendado

Mantener captura manual mientras se consigue autorización específica para verificaciones reales de sólo lectura y alcance mínimo por proveedor. FareHarbor: comprobar lista diaria/detalle, identidad/creación y conciliación del periodo autorizado sin aplicar a negocio. GetYourGuide: decidir primero modalidad y continuidad con el proveedor; si no hay recuperación suficiente, seguir manual. Después revisar/autorizar migración definitiva, configuración/secretos, equivalencias y reglas de conciliación; ensayar una activación empresarial explícita con respaldo y aceptación del personal. No se instaló en las dos computadoras ni se activó sincronización real.
