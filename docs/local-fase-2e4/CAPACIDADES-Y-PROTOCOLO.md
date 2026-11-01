# Preparación de proveedores y protocolo posterior

Fecha de revisión documental: 29-oct-2026. **Protocolo real NO ejecutado.** Sólo se consultó documentación pública; no se leyó configuración empresarial ni se accedió a reservas reales.

## Capacidades y límites

| Proveedor | Documentado / observado en código | Comprobable con simulación | Pendiente con acceso autorizado |
| --- | --- | --- | --- |
| FareHarbor | Lectura por día de creación UTC; detalle por UUID; claves App/User y empresa | Corte, exclusión anterior, solapamiento, deduplicación, cambios/cancelaciones y recuperación durable | Identidad/permisos vigentes, empresa, cobertura/retención/completitud, cuotas compartidas, precisión de datos y equivalencias reales |
| GetYourGuide | Supplier API: recepción de disponibilidad, retenciones, confirmaciones y cancelaciones; conectividad por opciones/producto | Bloqueo de automatización, aviso manual, permisos y conservación de estado | Modalidad contratada, homologación, identidad externa/origen temporal verificables, continuidad y recuperación suficiente |

FareHarbor documenta `GET /companies/<shortname>/minimal/bookings-by-create-date/<date>/` para creación UTC y `GET /companies/<shortname>/bookings/<uuid>/` para detalle. La lista muestra UUID; la elegibilidad usa `created_at` original del detalle, no la fecha de servicio ni recepción. La lista diaria no demuestra por sí sola la integridad de una cuenta concreta. No se inventan parámetros de paginación. [Referencia oficial](https://demo.fareharbor.com/api/external/v1/api-reference), [centro de integración](https://developer.fareharbor.com/api/external/v1/).

GetYourGuide documenta un receptor Supplier API con componentes obligatorios y exigencia de disponibilidad mensual de 99.8%. Sus reintentos de booking son limitados: hasta diez, separados por diez minutos; no acreditan recuperación de días apagado. Las modificaciones pueden implicar nueva reserva/confirmación y cancelación de la anterior. No encontramos una capacidad histórica autorizada suficiente para esta operación. Esto es un bloqueo de evidencia, no una afirmación de inexistencia universal. [Supplier API oficial](https://integrator.getyourguide.com/documentation/overview).

El portal distingue conectores inbound/outbound y mapeo de opciones. Community Tours aún debe confirmar con GetYourGuide cuál corresponde a su cuenta y sistema; no puede deducirse del código Gmail. [Conectividad oficial](https://supply.getyourguide.support/hc/en-us/articles/20309311919773-Connecting-Your-Product-to-a-Reservation-System-Inbound-Outbound-Connectors).

## Inspección existente

El cliente FareHarbor existente obtiene URL y claves de variables de entorno y realiza GET. Eso acredita una implementación, no permisos reales. `fareharborContinuous.service.js` persiste eventos y puede aplicar altas con un actor explícito: es otra vía de producción que debe inventariarse antes de autorizar un productor nuevo.

GetYourGuide existente usa Gmail/OAuth, historyId, recuperación de mensajes y bloqueo PostgreSQL propio. Es captura de correo; no acredita homologación Supplier API. El nuevo adaptador024 sólo admite un servidor HTTP 127.0.0.1 con empresa y claves sintéticas; no puede utilizarse como adaptador real.

`previous-processes.json` registra dos tareas anteriores: CommunityTours-FareHarborContinuous (Ready) y CommunityTours-GetYourGuideContinuous (Running). No se iniciaron/detuvieron/modificaron. No se exportaron argumentos, rutas privadas de configuración ni credenciales. La ausencia de procesos coincidentes en ese instante no demuestra ausencia de actividad: la enumeración es parcial. Antes del piloto se requiere inventario empresarial autorizado de responsables, origen, tablas/escritores, bloqueos y ventanas, y una decisión explícita de transición. Los candados de vías distintas no garantizan exclusión mutua entre productos.

## Protocolo FareHarbor de sólo lectura, pendiente de autorización

1. Obtener autorización nominal con empresa/shortname, entorno, persona responsable, ventana UTC exacta, UUID de muestra permitidos, presupuesto de solicitudes, tratamiento de datos y fecha de expiración. No reutilizar ni buscar claves antes de esa autorización. Confirmar con el proveedor los grants efectivos y su alcance; no asumir Full Capture.
2. En estación autorizada y sin escritores automáticos, entregar claves mediante custodia privada externa. Lista de destinos y métodos GET cerrada, redirecciones rechazadas, tiempos/tamaños limitados. No usar endpoints de crear/editar/cancelar, correo ni administración. No guardar cuerpos con datos personales ni headers en repositorio/logs.
3. Confirmar identidad de empresa y entorno mediante las respuestas y documentación del grant aprobado. Un 200 aislado no acredita todas las reservas. Ante 403 detener y clasificar permisos/cuota sin probar claves distintas; ante 429 respetar Retry-After y el presupuesto compartido. Pactar cuotas efectivas por IP con los otros productores.
4. Leer un día autorizado por creación UTC, otro vacío y los límites de día; registrar sólo cantidades y hashes/UUID seudonimizados en evidencia privada. Comparar contra un inventario autorizado independiente. Investigar paginación, truncamiento y retención con el proveedor si la respuesta/documentación no prueban completitud. Ningún cursor debe avanzar si queda incertidumbre.
5. Leer detalles de UUID seleccionados: empresa, UUID estable, `created_at` original con zona, estado y categorías/PAX (niños incluidos), actividad/opción, moneda/importes y pickup. Rechazar fechas ambiguas y campos ausentes. No inferir turno por hora. Ejecutar conversión y comparación de equivalencias en memoria, sin escribir en la base comercial.
6. Comparar dos lecturas autorizadas de una modificación y cancelación previamente existentes. No provocarlas mediante esta prueba. Verificar semántica de rebooking con el proveedor y dejarlo manual hasta disponer de regla aprobada. La fecha de observación no es fecha de modificación original.
7. Simular una interrupción del lector y repetir días con solapamiento; contrastar el conjunto recuperado contra el inventario independiente autorizado y volver a leer UUID vinculados. No apagar sistemas empresariales ni provocar errores/restricciones del proveedor para hacer esta prueba.
8. Entregar resultados por comprobación: pasa / falla / evidencia insuficiente, límites de cobertura y riesgos. No importar, activar ni fijar corte. La activación posterior exige otra autorización y revisión de equivalencias, capacidad, conflictos, responsable y respaldo.

## Decisión GetYourGuide pendiente

Mantener captura manual con referencia externa y conciliación diaria en el portal autorizado por el personal. Ante desconexión, listar pendientes y comparar modificaciones/cancelaciones antes de reabrir. Correos son apoyo operativo, no sustituto de una API homologada.

Opciones sujetas a decisión empresarial: continuar manual; usar un sistema/conector ya homologado con recuperación contractual comprobada; o financiar un receptor propio continuamente disponible con monitoreo, custodia, alta disponibilidad y homologación. No se implementó infraestructura pública ni se escogió una opción. Debe verificarse cómo obtener la creación original y cómo recuperar eventos que excedan los reintentos; sin ello, 024 permanece bloqueado para GetYourGuide.
