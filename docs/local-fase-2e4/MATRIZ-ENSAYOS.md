# Cobertura y límites de los ensayos

Los resultados finales se calculan desde verification.json; esta matriz distingue escenarios de grupos de comprobación, sin sumar revisiones como nuevas ejecuciones. Un mes virtual representa30 fechas de servicio; no equivale a30 días de disponibilidad continua ni a una prueba de carga empresarial.

## Operación manual, integraciones desactivadas

| Requisito | Evidencia prevista en corredor |
| --- | --- |
| Instalación limpia / primer Administrador | empty-bootstrap-lab nuevo, migraciones verificadas, initialize legítimo y singleton; sólo un Usuario antes del primer login |
| Login / Usuarios | primer login Electron antes de HTTP; segundo Administrador por formulario original; Consulta all/selected/vacío por API y formularios |
| Tours / catálogos | seis catálogos vía comandos reales, auditoría3; formulario y edición de Tour en Electron |
| Reservaciones / período manual |30 altas por protocolo023, una por fecha sintética; altas/ediciones/cancelación y no-op del recorrido comercial |
| Referencia externa | texto explícito en Observaciones del día1; código interno autogenerado. Código estructurado externo manual no habilitado por contrato actual |
| Operaciones / Transportes | dos grupos, guía/operador/vehículo, mínimos,12 por grupo y capacidad real; asignación por formulario original |
| Daily / PDF | Daily real, observaciones y PDF por IPC original; impresión física interceptada sólo en instrumento externo |
| Cancelaciones / ediciones | comandos reales, historial de Reservaciones y recálculo de PAX; comparación UI412 |
| Historial / Bitácora | formatos histórico/2/3, lector y snapshots; mismo PID/cliente/transacción para auditoría/comando |
| Cupo24 | exactamente24, rechazo25, altas/ediciones concurrentes, canceladas excluidas, sin transporte incluidas, niños incluidos, no doble conteo |
| Consulta all / selected | backend filtra plataformas; navegación/controles originales y negativos de rutas administrativas |
| Respaldo / restauración | respaldo después de activación simulada incluye todas las filas manuales; destino nuevo, comparación íntegra antes de reautorizar |
| Reinicio / conservación | snapshot exacto antes/después de reinicio y login desde Electron; todas las filas manuales idénticas tras sincronización |
| Desactivación | ambos first_activation_at y confirmed_through NULL, automation_enabled=false y cero vínculos al concluir el período manual |

Las filas de Avisos añadidas para el recorrido visual son fixtures explícitos sin llamadas de proveedor. Dos casos históricos (turnoNULL y código externo preexistente) usan SQL técnico sólo en la base recién creada. No son funciones de captura empresarial ni reparaciones de registros reales.

## Activación posterior con proveedor simulado

| Requisito | Evidencia del corredor024 reutilizado |
| --- | --- |
| Primera activación / corte | formulario original; responsable/motivo/zona, recibo durable; primera fecha inmutable y otra activación rechazada |
| Anteriores / nuevas | anterior excluida, exacta/posterior importadas, UUID único y replay concurrente |
| Duplicados manuales | coincidencia con código histórico de fixture → revisión, sin vínculo ni escritura automática |
| Parada / desconexión | backend terminado y reiniciado; cinco días virtuales nuevos recuperados, reconciliación de vínculos por UUID |
| Modificación / cancelación | cambio válido aplicado con auditoría; conflicto con observación humana conserva datos y exige revisión |
| Avance durable | cursor distinto del corte, ventana parcial, UUID omitido por nueva lista conservado; no avance ante revisión/error |
| Fallos / incertidumbre | pérdida trasCOMMIT, rollback negocio/auditoría/vínculo/baseline y recuperación GET sin reenvío incierto |
| Respaldo / restauración | pg_dump/pg_restore oficiales,22 tablas/2 esquemas previstos, filas/secuencias/restricciones y metadatos exactos |
| Reautorización / corte original | nueva época/identidad, JWT anterior rechazado, REAUTHORIZE_AFTER_RESTORE antes de habilitar, corte original igual |
| GetYourGuide | activación409 y corteNULL; aviso manual; nunca un endpoint histórico inventado |

## Revisión de corredores previa a ejecución

Se revisaron wrappers nuevos, integration024Lab/probe/worker/driver reutilizados, preproductionServer/probe, unifiedBackendCases/CapacityCases, firstDriver/unifiedElectronDriver y políticas023/024. Sólo generan directorios ACL nuevos, bases con nombres sintéticos, puertos127.0.0.1 e instrumentos privados; todos cierran procesos propios. El simulador rechaza orígenes externos. No se invoca servidor productivo ni se lee .env.

Jest usa lista revisada de37 suites, noPostgres y guard de red; clientes FareHarbor/Gmail usan dobles. Las regresiones021/022 y VerifyC023 se revisaron por separado: cada Verify exige directorio nuevo, mutaciones de credenciales/permisos/fallos sólo dentro de su clúster y cierre finally. No se ejecutaron Stop con directorios ajenos, npm test indiscriminado, instaladores, tareas programadas ni utilidades productivas.

Los paquetes se comprueban sin descargar dependencias. El cliente separado se prueba mediante un harness externo al ZIP; el backend funcional del ensayo sigue usando su supervisor sintético verificado. No se presenta ese resultado como arranque del paquete servidor empresarial.
