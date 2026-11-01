# Puerta A — capacidades y autorización

Revisión documental: 29 de octubre de 2026. No se usan credenciales, conexiones, tareas Windows, túneles ni bases empresariales. Las fuentes locales antiguas describen otras instalaciones; no prueban permisos vigentes de esta fase.

| Capacidad | FareHarbor | GetYourGuide |
| --- | --- | --- |
| Canal documentado | External API de lectura y webhooks | Supplier API: GetYourGuide llama al sistema del proveedor |
| Autenticación oficial | App/User en cabeceras; acceso sujeto a permisos | HTTP Basic sobre HTTPS; homologación y credenciales de integrador |
| Identidad | UUID estable de booking; distinguirlo del ID de entrega | Referencias del flujo de reserva/booking; homologar el contrato exacto |
| Creación original | `created_at` del detalle, con zona explícita | No se ha acreditado una fuente de creación original utilizable para este corte |
| Consulta recuperable | Día UTC: `/companies/<shortname>/minimal/bookings-by-create-date/<date>/`; luego detalle por UUID | No se acredita una API de lectura histórica equivalente |
| Cambios/cancelaciones | Reconsultar UUID conocidos; la lista por creación no es un feed de modificaciones | Flujo recibido; modificaciones pueden originar nuevo booking y cancelación del anterior |
| Caída de cinco días | Estrategia viable sólo si las claves permiten listar todos los días y obtener detalles | Los reintentos limitados no garantizan recuperar ese periodo; requiere recepción continua o reconciliación autorizada |
| Límites/errores | 403 no acredita alcance; respetar 429 y límites por IP | Manejar fallos del flujo y discrepancias; no convertir un fallo de recepción en recuperación exitosa |
| Permisos comprobados ahora | Ninguno mediante llamadas reales; prohibidas en esta fase | Ninguno; no se presume que Gmail sea Supplier API |
| Estado operativo | Manual; adaptador sólo habilitable en laboratorio loopback | Manual y bloqueo explícito de automatización real |

Fuentes primarias: [FareHarbor: referencia API](https://demo.fareharbor.com/api/external/v1/api-reference), [FareHarbor: integración y límites](https://developer.fareharbor.com/api/external/v1/), [GetYourGuide: Supplier API](https://integrator.getyourguide.com/documentation/overview), [GetYourGuide: modalidades de conectividad](https://supply.getyourguide.support/hc/en-us/articles/20309311919773-Connecting-Your-Product-to-a-Reservation-System-Inbound-Outbound-Connectors).

La referencia FareHarbor describe una respuesta `bookings` por día, sin cursor de paginación en ese endpoint. No se inventa un parámetro de página. Un fallo, respuesta inválida o detalle pendiente impide confirmar el día. Se solapan días ya consultados y se reconcilian UUID vinculados para cambios ocurridos durante la desconexión. Confirmar con el proveedor alcance completo, retención y consistencia antes de activación real.

La documentación GetYourGuide limita reintentos de booking y exige endpoints de disponibilidad, reserva, booking, cancelaciones y notificación de disponibilidad. El receptor parcial o un parser de correo existente no equivalen a homologación. Para activarla faltan modalidad autorizada, credenciales, mensajes auténticos verificables, mecanismo de recuperación y arquitectura continuamente disponible. No se publica un receptor ni se inventa una consulta histórica.

## Decisión de implementación tras esta puerta

Se autoriza técnicamente un ensayo sintético: estado durable por plataforma, corte inmutable independiente del cursor, idempotencia y recepción/revisión. No se autoriza ni se implementa un interruptor para usar credenciales reales. FareHarbor se prueba con servidor HTTP simulado que reproduce únicamente las consultas documentadas. GetYourGuide se prueba como canal de recepción sin recuperación histórica y debe producir alerta de reconciliación manual.

Se propone una migración **024 sólo experimental**: añadir a `integracion_sync_estado` campos de activación, habilitación, avance y diagnósticos, conservando intacta la semántica de Gmail/publicación y los contratos 018–023. Los estados de una intención administrativa y su auditoría residirán aparte para no cambiar el ledger comercial 020. La identidad externa y la cola pendiente reutilizan vínculos y eventos existentes. Se revisará y ensayará sólo en clúster nuevo; ninguna migración empresarial se ejecutará.
