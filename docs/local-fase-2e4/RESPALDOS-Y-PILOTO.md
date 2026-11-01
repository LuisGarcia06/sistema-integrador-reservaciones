# Propuesta de continuidad y piloto sujeto a aprobación

## Respaldo propuesto, aún no programado

Propuesta para discusión: respaldo diario al cierre y antes de migraciones/activación/mantenimiento; copias diarias14 días, semanales8 semanas y mensuales12 meses. Ajustar por volumen, privacidad y presupuesto. RPO propuesto24h y RTO objetivo4h **sin compromiso hasta medir una restauración en el equipo aprobado**. Si la empresa requiere menor pérdida, decidir una estrategia PostgreSQL de recuperación puntual en una tarea específica, sin implementarla aquí.

Responsable operativo: persona designada por Community Tours comprueba ejecución/alertas diariamente. Responsable técnico autorizado verifica hashes/firma y restauración mensual en destino nuevo; un segundo custodio verifica recuperación y retención. Designaciones, horarios y objetivos aún sin aprobar.

Conservar copia local protegida y copia externa cifrada con acceso mínimo/versionado y una copia desconectada o inmutable; proveedor, ubicación, jurisdicción, claves y presupuesto pendientes. La clave de descifrado y secretos JWT/identidad/comandos/proveedores no comparten la ubicación del dump; custodia con acceso registrado y procedimiento de recuperación. No se configuró una tarea Windows ni se ejecutó copia empresarial externa.

Reutilizar pg_dump custom oficial bajo snapshot consistente y ventana de escritores controlada, metadatos firmados con autoridad fijada por separado, SHA256, filas/secuencias/restricciones y estado024. Verificación de archivo no reemplaza restauración. Rotar y comprobar copias antes de retirar anteriores; ningún borrado de copias se ejecutó en esta fase.

## Recuperación propuesta

1. Registrar incidente, limitar escrituras mediante procedimiento autorizado, preservar estado posterior al respaldo y pendientes. No sobrescribir ni limpiar la base existente.
2. Verificar archivo y firma contra autoridad independiente, herramientas/versión y custodia separada. Crear otro destino vacío e identificado; no usar --clean ni restaurar sobre una base comercial.
3. Restaurar transaccionalmente con rol de mantenimiento y comparar íntegramente filas, secuencias, restricciones, roles funcionales, singleton, ledger, auditoría, relaciones, usuarios/asignaciones y esquema024. Conservar los controles estrictos023/024.
4. Crear configuración privada/identidad de instalación/época y JWT nuevos; recuperar la clave de comandos mediante custodia aprobada. Publicar descriptor nuevo únicamente por canal autorizado. Rechazar sesiones previas.
5. Comparar corte original, último avance confirmado, pendientes, baseline, recibos, UUID y vínculos. Exigir reautorización administrativa; nunca volver a ejecutar «primera activación» ni cambiar el corte para ocultar huecos.
6. Reconciliar también decisiones manuales posteriores al respaldo, cancelaciones, cambios y usuarios revocados; no reactivar automáticamente una copia antigua. FareHarbor necesita recuperación real previamente demostrada; GetYourGuide continúa manual hasta resolver continuidad. Un cursor confirmado respaldado no demuestra que no existan cambios posteriores.
7. Validar login, alcances, Reservaciones/Operaciones/Daily/PDF, bitácora y contadores; documentar duración y pérdidas. Apertura empresarial requiere aprobación nominal, con reversión de código separada de recuperación de datos.

## Secuencia de piloto propuesta

| Puerta | Evidencia exigida | Decisión |
| --- | --- | --- |
| 1. Gobierno | Responsable, equipos, cuentas, alcance manual, datos autorizados, RPO/RTO y custodia | Aprobar piloto manual, sin APIs |
| 2. Distribución | Supervisor empresarial revisado; paquetes firmados separados; HTTPS y confianza; arranque/mantenimiento y reversión probados | Autorizar instalación en equipos explícitos |
| 3. Aceptación | Personal ejecuta alta/edición/cancelación, alcances, cupo, asignación, Daily/PDF, historial y recuperación | Aprobar uso manual limitado |
| 4. Proveedores | Ejecutar protocolo real de sólo lectura con autorización posterior; verificar exclusión de productores anteriores | Resolver permisos/retención/recuperación por proveedor |
| 5. Activación | Respaldo/restauración aceptados, equivalencias y conflictos aprobados, fecha/zona elegidas por Administrador | Autorizar cada plataforma por separado |
| 6. Seguimiento | Reconciliación diaria, alertas, duplicados, cursores, modificaciones y capacidad; criterio de pausa | Evaluar continuidad sin declarar producción automáticamente |

La fecha del2 de diciembre sólo pertenece al ensayo024. No existe fecha empresarial fijada. Todas las puertas empresariales siguen pendientes; no se instaló el sistema ni se activaron APIs reales.
