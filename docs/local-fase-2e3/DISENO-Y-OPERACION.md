# Contrato experimental de activación y recuperación

La [Puerta A](MATRIZ-CAPACIDADES.md) distingue documentación pública, pruebas sintéticas y permisos reales. Ambas plataformas permanecen bloqueadas para conexiones reales. No se inspeccionan secretos empresariales ni se prueban claves de instalaciones anteriores.

## Activación única y estado durable

La base comercial conserva el contrato023. La propuesta024 es una extensión experimental, ejecutada únicamente en clúster nuevo. No modifica schema.sql ni migraciones018–023. Su SHA queda fijado en integration024Contract.js y verificado antes de migrar/arrancar. La identidad y los privilegios de la instalación siguen verificándose con el mecanismo023.

Se reutiliza integracion_sync_estado, con dos filas source=automation024. Se añaden campos con semántica explícita: first_activation_at, responsable/motivo original, habilitación, autorización vigente, confirmed_through, intento/resultado/error, Retry-After, identificador/instancia/plazo de trabajo y ventana pendiente. Los campos anteriores de Gmail, recuperación histórica y publicación conservan su significado; last_history_id contiene un literal explícito «not-applicable-024» en estas dos filas y nunca se usa como cursor.

La fecha local elegida por el Administrador se interpreta expresamente en America/Cancun y se almacena en timestamptz UTC. No hay una fecha productiva predeterminada. Confirmación, motivo, sesión reciente y autorización viva son obligatorios. El trigger impide cambiar/borrar un corte ya establecido; pausa/reanudación no lo alteran. Un segundo intento con otra clave no crea otra activación. El mismo UUID de intención recupera su resultado; otro contenido con ese UUID se rechaza.

Se añade el esquema ctsk_sync024 con dos tablas técnicas: admin_receipts conserva resultados/auditoría de controles sin cambiar el ledger020; booking_state conserva vínculo, creación original verificada, huella externa, revisión y snapshot interno de conciliación. No es otra base comercial. El runtime no puede modificar/eliminar recibos ni crear objetos en el esquema. La firma de código, configuración privada, ACL y manifiesto de propósito específico son obligatorios; no basta un argumento de arranque.

## Flujo de lectura FareHarbor

El adaptador de esta fase admite exclusivamente un servidor HTTP simulado en127.0.0.1, empresa sintética y claves sintéticas en memoria. Rechaza direcciones reales incluso si se le pasaran claves válidas. Reproduce sólo GET documentados de lista por día UTC y detalle por UUID. No añade parámetros de paginación inexistentes. Rechaza respuestas no reconocidas, UUID/empresa distintos, tamaños excesivos y detalle incompleto. El ritmo del simulador no constituye aprobación de cuotas reales: antes del piloto se necesita un presupuesto central por IP, contemplando otros consumidores, y verificación del alcance/retención del proveedor.

Un ciclo lee el corte y el avance durable. Un único dueño obtiene un run_id con instancia y plazo; las transacciones se serializan también con el candado comercial existente. El servidor revalida estado/rol/versión de credenciales del responsable antes de escribir. Cada operación renueva el plazo; una respuesta de otro run o instancia se rechaza. Los workers separados sólo acceden al HTTP simulado y al canal privado heredado; no reciben credenciales PostgreSQL.

Primero se concilian UUID vinculados mediante detalle actual. Esto permite observar cancelaciones/modificaciones de reservas creadas antes de la desconexión pero elegibles desde el corte. Después se consultan todos los días pendientes y un día de solapamiento. Las listas son conjuntos, no un orden de eventos. No se aplica directamente un webhook potencialmente atrasado. El contrato documentado no acredita reconstrucción de cada estado intermedio ni garantía de consistencia/retención ilimitada: esas capacidades deberán confirmarse antes de acceso real.

La ventana guarda todos sus UUID y las resoluciones confirmadas. Tras interrupción se reanuda primero esa ventana, uniendo sus UUID con la nueva lista; un registro no se descarta porque desaparezca de una página posterior. Si su detalle falla, el cursor permanece detenido y se pide revisión. Hay un límite defensivo de5000 UUID por ventana; excederlo bloquea con diagnóstico, sin inventar paginación ni saltar registros. El avance sólo se confirma después de resolver todos los elementos. Una ventana antigua no hace retroceder el avance. Las respuestas HTTP perdidas después de COMMIT se concilian con recibos/estado durable, sin repetir automáticamente una escritura incierta.

## Elegibilidad y transformación

Se exige creación original con zona verificable; se normaliza a UTC y se compara con el corte inclusivo. Una reserva antigua permanece excluida aunque el servicio sea futuro o después cambie. Fecha de tour, recepción o última modificación no sustituyen la creación. No se interpreta un turno desde una hora.

FareHarbor reutiliza su mapper y su constructor de datos existente. Para modificaciones se usa el constructor sólo como conversión/validación, sin cambiar el tipo del evento persistido ni invocar el aplicador de altas. Se exige coherencia entre total y detalle de pasajeros, categorías conocidas, importes válidos, pickup suficiente y equivalencia activa de tour/turno. Los catálogos se configuran explícitamente; nunca se inventan tours, operadores o vehículos. Datos insuficientes pasan a revisión.

La reserva usa los servicios actuales de creación, modificación y cancelación dentro de la misma transacción que vínculo, evento aplicado, snapshot y auditoría. Se mantienen máximo24 PAX activos por tour/fecha/turno, incluyendo reservas sin transporte y niños, excluyendo canceladas, con las demás reglas comerciales vigentes. Este worker no asigna transporte; los servicios y regresiones de grupos/capacidad12/vehículo conservan su frontera.

La unicidad proveedor+UUID del vínculo impide doble alta. La huella y revisión técnica distinguen duplicados de cambios legítimos, incluso si una reserva vuelve a un estado externo anterior. Código externo coincidente o candidato manual incierto quedan pendientes, sin autovinculación. Un vínculo anterior sin baseline024 también requiere revisión. No se extraen identificadores de texto libre para afirmar identidades.

Se conserva un snapshot interno después de cada aplicación. Si hubo cambios manuales posteriores, la modificación/cancelación externa se detiene para revisión; no pisa observaciones, habitación, transporte ni otros campos operativos. Una cancelación ya observada no se convierte automáticamente en una reserva nueva. Rebookings, restauraciones de canceladas y reglas de conciliación ambiguas permanecen pendientes hasta decisión administrativa expresa. La fase no añade un escritor para resolver vínculos inciertos: su aprobación deberá definir qué campos conserva la empresa y quedar auditada antes de aplicarse.

## Errores y GetYourGuide

403 no demuestra permisos suficientes ni una modalidad habilitada. 429 conserva Retry-After y evita consultas durante la espera. Timeout, errores5xx y ventanas incompletas no adelantan cursor. Los eventos conflictivos y alertas operativas se conservan en eventos_integracion y aparecen por las lecturas originales de Avisos; no son reservas nuevas inventadas. Un diagnóstico resuelto por una consulta posterior no elimina la evidencia anterior de revisión.

GetYourGuide se mantiene manual: primera activación rechazada con resultado durable y alerta de reconciliación, sin asignar un corte ficticio ni habilitar importaciones. Sus reintentos limitados de Supplier API no acreditan la recuperación de cinco días. Faltan modalidad autorizada, homologación, autenticación real, creación original verificable, recepción continuamente disponible y procedimiento de reconciliación. No se publica un receptor parcial ni se usa Gmail como supuesto histórico Supplier API.

## Respaldo y restauración

El respaldo oficial18.3 ahora incluye también tablas/secuencias y restricciones de ctsk_sync024, además de todas las tablas públicas y columnas nuevas. Se verifican cantidades/huellas, relaciones, catálogo023 y contrato024. Se conserva la reconstrucción acotada de CHECK documentada en2E.2, sin modificar sus migraciones/verificadores. Los secretos permanecen fuera del dump de datos y bajo custodia separada.

La copia conserva corte, avance, pendientes, recibos, versiones, vínculos y singleton. Recibe nueva instalación/época/JWT y descriptor cliente. La autorización del worker está ligada a la época: tras restaurar debe reautorizarse por Administrador, sin repetir el primer corte. Reiniciar normalmente conserva la época y no exige otra activación. Esto evita que un respaldo antiguo resucite una autorización posteriormente revocada. Ningún token anterior se acepta en la nueva instalación.

## Corrección excepcional del corte

No existe endpoint, botón ni variable que permita corregirlo. Antes de cualquier excepción: autorización nominal de la empresa, motivo y corte anterior/propuesto, inventario de reservas afectadas sin modificarlas, pausa/detención, respaldo y restauración verificados y revisión técnica de una migración de mantenimiento nueva. Sólo un principal de mantenimiento separado del runtime podría ejecutarla en una transacción con auditoría del responsable, antes/después y motivo, validación posterior y reanudación expresamente aprobada. No se proporciona un bypass genérico ni se ensaya una corrección sobre datos empresariales. Hasta aprobar ese procedimiento específico, la corrección permanece bloqueada.

## Uso y reversión del ensayo

Ejecutar scripts/Integration024Lab.ps1 crea siempre directorios nuevos privados para origen, destino y clientes; no recibe una ruta empresarial. No instala servicios ni tareas programadas. Su instrumentación y RPC de fallos sólo existen en el probe privado de laboratorio. La API administrativa autenticada no expone llamadas de worker ni acepta payloads del proveedor.

Para revertir código, detener procesos propios, comparar las huellas posteriores y revisar los originales selectivos guardados. Restaurar únicamente los archivos modificados de esta fase si no hubo cambios posteriores; retirar la activación experimental y conservar datos/evidencia. No revertir una base con un dump antiguo ni eliminar schema024, vínculos, reservas o pendientes como reversión de código. No usar reset/clean ni restauraciones masivas.
