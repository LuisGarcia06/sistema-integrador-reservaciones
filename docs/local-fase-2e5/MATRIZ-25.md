# Matriz del piloto025

Los estados efectivos se obtienen de verification.json y de los informes de regresión finales. No se suman escenarios, grupos y solicitudes como si fueran pruebas equivalentes.

| N.º | Escenario | Evidencia y alcance |
| ---: | --- | --- |
| 1 | Instalación limpia | Clúster y directorios ACL nuevos; base sintética,023+024+025 revisadas por hash |
| 2 | Bootstrap seguro | initialize legítimo y singleton; una cuenta capturada sin contraseña predeterminada |
| 3 | Servidor candidato | start.cjs → supervisor025 → backend original del paquete; inscripción propia, roles/esquema y candado |
| 4 | Cliente candidato | Electron con ventana/preload/páginas originales, sin pg; harness externo |
| 5 | Primer login | Primer login global desde candidato, antes del primer loginHTTP del coordinador |
| 6 | Usuarios | Después, recorrido original crea segundo Administrador y Consulta all/selected/vacío |
| 7 | Reservaciones manuales | POST/PATCH originales y30 fechas virtuales de servicio; sin simular disponibilidad mensual real |
| 8 | Referencia externa | HTTPFH/GYG y captura/corrección en modal original de Electron |
| 9 | Duplicados | Misma identidad/plataforma409; replay único; otras plataformas permitidas; vacío no asocia |
| 10 | Edición/cancelación | Servicios y formularios originales; referencias preservadas y correcciones con motivo/historia |
| 11 | Cupo24 | Alta/edición, canceladas excluidas, sin transporte incluidas, concurrencia y no doble conteo |
| 12 | Operaciones/Transportes | Grupos1/2,12PAX, capacidad real, mínimos, asignación explícita |
| 13 | Daily/PDF | API original y PDF por IPC original; revisión renderizada; impresión física interceptada |
| 14 | Historial/Bitácora | Formatos históricos/2/3 más cambios de referencia auditados en la misma transacción |
| 15 | Consulta all/selected | Lecturas/rutas/filas originales filtradas;025 decora sólo resultados previamente autorizados |
| 16 | Avisos | Filas sintéticas para UI; API observada se distingue de modificación externa original |
| 17 | Integraciones deshabilitadas | Corte/cursorNULL, automation_enabled=false y cero vínculos al finalizar período manual |
| 18 | Reinicio | Supervisor candidato y backend instrumental posterior reinician con datos idénticos; sesión UI revalidada |
| 19 | Respaldo/restauración | pg_dump/pg_restore oficiales a otro destino nuevo; comparación íntegra incluyendo025 |
| 20 | Revocación | JWT023, reset de password y sesiones viejas rechazadas; nueva época tras restaurar |
| 21 | Comandos inciertos | Mismo motor023: pérdida de respuesta trasCOMMIT y recuperaciónGET,404 no concluyente |
| 22 | Referencias conservadas | Tabla/historia/secuencia/FK/índices y metadatos dentro del respaldo verificado |
| 23 | Primera activación | Sólo FareHarborHTTP simulado, corte único, intento repetido rechazado; GYG manual |
| 24 | Sin duplicados tras activar | Declaración manual coincidente queda pendiente; no reserva/vínculo nuevo ni fusión automática |
| 25 | Cierre | Inventario de clústeres/puertos propios, cero listeners/procesos/PID; tareas anteriores intactas |

La prueba normal del servidor candidato no carga probes. Las regresiones comerciales y de fallos se ejecutan después contra el mismo backend empaquetado con instrumentación privada externa al cliente. Se separan sus trazas de los comandos previos del candidato no instrumentado. El primer acceso genérico del corredor manual heredado es una autenticación posterior; el primer acceso global está acreditado por pilot025.firstElectron.

La puerta de instalación empresarial sigue incompleta aunque el arranque del candidato de ensayo pase. No hay prueba entre dos equipos ni autorización de base real, APIs reales o instalación productiva.
