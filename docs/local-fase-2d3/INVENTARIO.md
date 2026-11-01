# Inventario previo a habilitar Nueva reservación — 2D.3

Se extiende únicamente el harness integrado. La entrada principal, los perfiles anteriores, el backend y el esquema 020 no cambian.

El formulario original de alta no muestra código: el servidor genera RSV-fecha-10 dígitos hexadecimales y reintenta hasta cinco colisiones. El validador rechaza `codigo` e `id_reservacion` proporcionados por el cliente. El índice único existente permanece intacto.

Abrir Nueva reservación solo renderiza el formulario original y captura identidad; no obtiene precondiciones con datos vacíos. Validar y confirmar congela el cuerpo completo. POST /api/precondiciones recibe ese mismo cuerpo para POST /api/reservaciones, valida respuesta/protocolo/generación y después se genera la clave y se envía un único POST con el cuerpo congelado.

Único escritor nuevo: POST /api/reservaciones, sin query o barra adicional, con cinco cabeceras obligatorias y guardia privada. Las otras tres acciones conservan su contrato. Todos los demás escritores siguen bloqueados. El éxito presenta recibo e identificador; la consulta autorizada del registro creado y su código es un GET separado por la referencia del recibo.

Se conservan login, refresco de permisos, catálogos, filtros, CSS, comparador y recibos. Rechazar una creación no consulta precondiciones automáticamente. Revisar una alta rechazada devuelve el mismo formulario a validación y confirmación; recién después obtiene otra foto ligada al cuerpo. Desconocido no autoriza otro envío ni reemplazo del modal. La referencia sigue solo en memoria; salir no prueba cancelación de la operación.

El host registra huellas, claves y campos de precondiciones de creación, sin JWT, cuerpos libres ni secretos PostgreSQL. Las sondas de colisión y fallo de auditoría usan IPC privado del corredor y un proceso que inicia la API normal con todas sus verificaciones. No hay endpoints de fallos ni cambios del esquema: una envoltura temporal del generador fuerza dos valores sintéticos iguales; otra lanza una excepción después de escribir una bitácora sintética dentro de su transacción. Esas envolturas no se instalan por las entradas normales del producto ni de otros laboratorios.
