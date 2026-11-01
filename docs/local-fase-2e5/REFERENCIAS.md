# Referencias externas declaradas — propuesta025

La referencia declarada por una persona y el vínculo confirmado de integración tienen identidades y responsabilidades distintas. El código interno de Reservaciones sigue autogenerado. Plataforma de venta sigue siendo id_plataforma; Vendedor/SOLD BY no se reinterpreta como identidad técnica del proveedor.

La propuesta025 crea exclusivamente el esquema técnico ctsk_refs025 en una base sintética nueva. No cambia018–024 ni añade columnas a Reservaciones. Cada versión registra reserva, plataforma, proveedor, valor original, clave de comparación, tipo código/UUID, responsable/instante y estado declared. Índices únicos parciales protegen una referencia activa por reserva y una identidad activa por proveedor. FK a Reservaciones, Plataformas y Usuarios. No se cambia reservas_integracion_link.

Corrección: motivo y confirmación explícitos, retiro de versión previa y nueva declaración dentro de la misma transacción. Las versiones anteriores son inmutables; no DELETE/TRUNCATE ni modificación de identidad para runtime. Se conservan responsable y fecha originales. Eliminar el valor opcional retira la declaración con motivo; no borra su historia. Ninguna referencia se extrae de Observaciones ni se reinterpretan registros anteriores.

## Contrato funcional

- Campo omitido: no cambia referencia. Vacío/espacios sin referencia previa: no crea asociación.
- Código: trim/NFC, hasta100caracteres, sin controles. Conserva mayúsculas y signos; no se adivina UUID, prefijo o semántica del proveedor.
- UUID: exige formato explícito y compara sin distinción de mayúsculas. Nunca se genera un UUID de proveedor desde el formulario.
- Proveedor soportado en este ensayo: FareHarbor/GetYourGuide; debe coincidir con la plataforma comercial de la reserva. Cambiar plataforma conservando una referencia incompatible exige corrección explícita.
- Misma clave/proveedor en otra reserva:409 y rollback de negocio/referencia/auditoría. Misma referencia en proveedores distintos: permitida.
- Declaración inexistente en el catálogo simulado: puede guardarse como declared; no demuestra existencia ni permisos reales. No se consulta API para verificarla.
- Corrección sin motivo o sin confirmación: rechazo. Sin cambio: no modifica historia ni añade auditoría.
- Una reserva ya vinculada por integración no admite modificación manual de identidad externa; requiere revisión. Tampoco se reclama un UUID confirmado en otra reserva.

## Backend y formulario

Se añade referencia_externa al cuerpo de los mismos POST/PATCH de Reservaciones únicamente bajo el manifiesto025 verificado. La capa de comandos conserva la intención original para HMAC/idempotencia; separa los campos comerciales para invocar los validadores/servicios existentes y aplica la referencia en el mismo cliente/transacción. No se añade un escritor público alternativo. Autorización viva, ETag, contexto, ledger y rollback existentes continúan vigentes. Las fotos incluyen referencia actual y contexto histórico025 para detectar cambios concurrentes.

El modal original incorpora valor/proveedor/tipo y motivo de corrección opcionales, manteniendo todos los campos comerciales. La confirmación de guardado existente confirma la intención completa. Consulta conserva controles de sólo lectura y filtrado backend antes de decorar resultados; no se consulta una referencia de una reserva oculta.

## Conciliación conservadora

Antes de crear una reserva024, se compara UUID/display_id del proveedor simulado con declaraciones actuales **e históricas**, sin distinguir mayúsculas en esta búsqueda conservadora. Una coincidencia devuelve MANUAL_REFERENCE_REQUIRES_REVIEW y conserva el evento pendiente: no importa otra reserva, no fusiona ni crea un vínculo confirmado. Códigos con semántica ambigua permanecen pendientes. Un humano deberá revisar pruebas del proveedor y definir un procedimiento de confirmación autorizado antes de convertir declaraciones en vínculos administrados.

No se implementa un botón que marque una declaración como verificada sin evidencia de proveedor. La conciliación automática queda detenida de forma segura; el flujo de resolución definitiva y los adaptadores reales siguen pendientes. Respaldos/restauración incluyen la tabla, su secuencia y restricciones, además de corte/cursor/vínculos024.
