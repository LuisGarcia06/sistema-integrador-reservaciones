# Procedimiento de respaldo y restauración

Utilidades implementadas: `scripts/preproductionBackup.cjs`, `scripts/preproductionSetup.cjs` y el ensayo `scripts/PreproductionLocal.ps1`. Sólo admiten clústeres sintéticos propios; no deben apuntarse a la base empresarial.

1. Verificar identidad del clúster, base, directorio, versión, rol y esquema. Detener escritores de la aplicación para la ventana de mantenimiento.
2. Elegir un directorio nuevo protegido dentro de la instalación sintética. No reutilizar ni sobrescribir una carpeta de respaldo.
3. Crear una transacción de lectura repetible, exportar su snapshot y usar `pg_dump18.3 --format=custom --snapshot=…`. La contraseña se transmite al proceso por entorno privado, nunca por argumentos, nombre de archivo o logs.
4. Guardar `database.dump` y `backup.json`: firma, SHA256, esquema, procedencia y cantidades/huellas de filas y secuencias. Examinar el código de salida y registrar errores con códigos seguros. Conservar por separado los secretos de recuperación bajo custodia autorizada.
5. Crear otro clúster nuevo y una base destino nueva vacía, con roles SQL técnicos apropiados. La herramienta rechaza un destino con tablas; no utiliza `--clean`, DROP DATABASE/TABLE ni borrado de datos.
6. Verificar firma y SHA256 antes de restaurar. Usar `pg_restore18.3 --single-transaction --exit-on-error --no-owner --role=ctsk_standalone_owner`. Los roles funcionales y las cuentas comerciales pertenecen al dump; los principales SQL se aprovisionan de forma separada, sin restaurar contraseñas de superusuario mediante `pg_dumpall`.
7. Comparar todas las tablas públicas y secuencias, verificar restricciones y el catálogo023 con runtime limitado. Sólo después emitir la constancia de recuperación y configurar nuevas identidades de autenticación.
8. Iniciar el backend, rechazar JWT anteriores, autenticar con una cuenta autorizada de la copia, leer Reservaciones/Daily y generar un PDF real desde Electron. No declarar éxito por el código cero de `pg_restore` solamente.
9. Conservar el informe de resultado, errores, identidad del destino y comprobación de cierre. Un fallo no autoriza limpiar datos ni reparar constancias automáticamente.

La estrategia de retención, RPO, RTO, cifrado en disco, copia externa, responsable y calendario quedan pendientes de aprobación empresarial. No se crea ninguna tarea Windows ni automatización. Se propone realizar periódicamente una restauración completa de prueba; su frecuencia y plazo de recuperación deberán acordarse y medirse con el personal.

Fundamento de las opciones: [pg_dump18](https://www.postgresql.org/docs/18/app-pgdump.html) y [pg_restore18](https://www.postgresql.org/docs/18/app-pgrestore.html). El formato custom admite restauración mediante `pg_restore`; la transacción única evita una restauración parcial al fallar una sentencia. La validación de aplicación sigue siendo obligatoria.

La clave pública confiable del origen se proporciona separadamente al validador; no se acepta como autoridad cualquier clave incluida en un respaldo autofirmado. La constancia de recuperación liga clúster y base destino, instalación, época, generación, SHA256 del archivo y huella de la clave de comandos. El registro de herramientas conserva versión, código de salida y huella del diagnóstico; no publica su entorno ni contraseñas.

En PostgreSQL18.3 el recorrido dump/restore cambia la representación interna de nueve CHECK (casts de arrays y agrupación de AND), aunque sea lógicamente equivalente. Los contratos020/022/023 comparan formas exactas. La recuperación identifica exclusivamente esos nueve pares de huellas conocidos, verifica SHA de los SQL originales y reconstruye los CHECK en una transacción en el destino recién restaurado, validando todas sus filas. No modifica los archivos de migración ni los verificadores. Cualquier diferencia no reconocida se rechaza; luego exige igualdad exacta del conjunto de restricciones y verificación completa023. No es una reparación de una base existente. El intento10 y sus diagnósticos documentan esta diferencia.
