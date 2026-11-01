# Alternativas al prototipo nativo puesto en cuarentena

Estado: investigación de código y documentación; sin ejecución ni construcción.
No se ha restaurado, recompilado ni ejecutado el archivo detectado.
Candidate-03, candidate-04 y 026-setup-02 no se modifican.

## Hallazgo: PostgreSQL puede gestionar su propio proceso restringido

Se revisó el código oficial fijado a REL_18_3 de `pg_ctl.c`.
`start_postmaster()` construye una invocación a COMSPEC /C para el arranque normal.
En cambio, `pgwin32_ServiceMain()` llama a
`CreateRestrictedProcess(pgwin32_CommandLine(false), ..., true)`.
`pgwin32_CommandLine(false)` selecciona el ejecutable postgres y sus argumentos,
sin añadir ese envoltorio CMD. El proceso restringido lo crea PostgreSQL mediante
su implementación de token, DACL y job object; no nuestro prototipo .NET.

Esto confirma una alternativa para el arranque del servidor. No demuestra que
todas las operaciones PostgreSQL, sus binarios instalados o las ocho etapas
estén libres de intérpretes. Tampoco garantiza aceptación por un antivirus.

Fuente:
https://github.com/postgres/postgres/blob/REL_18_3/src/bin/pg_ctl/pg_ctl.c

## Diseño alternativo que merece evaluar

1. Clúster nuevo, privado y exclusivo de la VM, con puerto y marcadores propios.
   No reutilizar la instancia PostgreSQL existente para eludir el contrato T0.
2. Servicio Windows exclusivo del laboratorio, usando los binarios verificados
   de PostgreSQL y una identidad de servicio de privilegios mínimos. Nunca
   seleccionar LocalSystem por defecto ni reutilizar un servicio empresarial.
3. Gestión mediante API nativa de servicios, con nombre, ejecutable, argumentos,
   cuenta, directorio y estado verificados antes de iniciar o detener. Rechazar
   colisiones de nombre y configuraciones ajenas; no sobrescribir servicios.
4. Auxiliar separado de ACL/identidad/rutas, de alcance limitado. La creación del
   proceso restringido de postgres quedaría en PostgreSQL. Este auxiliar sigue
   necesitando desarrollo, revisión y pruebas; no desaparece el trabajo de ACL.
5. Mantener autoridad sintética nueva, firmas, certificados locales, descriptores,
   expiración máxima de siete días, T0 y bootstrap interactivo sin contraseñas
   en argumentos. synthetic-acceptance-only y productionAuthorized=false.

Crear un servicio cambia el modelo previo por usuario: requiere permisos de
administración durante el registro y decidir cómo dar acceso mínimo al clúster,
gestionar logs y detenerlo con seguridad. Es una propuesta de cambio estructural,
no una operación ya aplicada ni una sustitución equivalente demostrada.

## Bloqueos que deben resolverse antes de elegir esta vía

- Inicialización: `initdb.c` REL_18_3 usa `popen_check()` / `popen()` para alimentar
  procesos postgres. La revisión adicional confirmó en `src/include/port.h` que
  Windows mapea popen a pgwin32_popen; `src/port/system.c` termina llamando a
  `_popen`. Microsoft documenta que `_popen` ejecuta un procesador de comandos.
  Existe por tanto una dependencia de intérprete en el código oficial, además
  del arranque normal de pg_ctl. Falta observar el árbol de procesos del binario
  concreto instalado en la VM. El modo servicio no resuelve esta parte. Con el
  requisito de ausencia total de shells, es un bloqueo pendiente, no una
  excepción implícita.
- Elegir una identidad de servicio compatible con Windows 11 Home sin secretos
  en argumentos, logs o archivos inseguros, y definir sus ACL y derechos exactos.
- Revisar compatibilidad con el propietario y marcadores exigidos por el contrato
  anterior de instalación privada, y con la comprobación de identidad de clúster.
- Auditar parada, reinicio, interrupciones, servicio residual, reutilización de
  PID y recuperación de init/bootstrap sin reintentos ambiguos.
- Verificar rutas Unicode y caracteres especiales tanto en los binarios oficiales
  como en el auxiliar y la configuración del servicio.

Fuente de inicialización:
https://github.com/postgres/postgres/blob/REL_18_3/src/bin/initdb/initdb.c

Referencias adicionales de la revisión:
https://github.com/postgres/postgres/blob/REL_18_3/src/include/port.h
https://github.com/postgres/postgres/blob/REL_18_3/src/port/system.c
https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/popen-wpopen

## Otras opciones y sus límites

- Revisar el prototipo con McAfee sigue siendo posible en paralelo, manteniendo
  la cuarentena. No condiciona la investigación estática de otra arquitectura.
- Recompilar el mismo comportamiento en C/C++ no demuestra seguridad ni resuelve
  por sí solo la detección. No se usará un cambio de nombre, compilador o ubicación
  como mecanismo para sortear el antivirus.
- Utilizar el PostgreSQL que ya está instalado en la VM requeriría revisar el
  contrato de clúster nuevo y aislamiento. No se propone como atajo automático.
- Firmar un ejecutable puede aportar identidad del editor, pero no demuestra
  equivalencia de controles ni garantiza que el antivirus lo acepte.

## Verificación necesaria

Primero cerrar los bloqueos anteriores mediante revisión y pruebas aisladas sin
clústeres en el anfitrión. Solo después implementar el diseño elegido, comprobar
los contratos de ACL y procesos, preservar inventarios y ejecutar regresiones.
Registro de servicios, initdb y arranque real se probarían exclusivamente en la VM,
con instantánea previa. La aceptación requiere Restricted efectivo, árbol de
procesos, ocho etapas, T0 limpio, bootstrap único, primer login, cierre y reinicio.

No se ha creado un servicio, iniciado PostgreSQL, consultado bases ni generado
candidate-05 o 026-setup-03 durante esta investigación. No se ejecutaron pruebas
automatizadas nuevas: esta entrega solo documenta la alternativa y sus límites.
