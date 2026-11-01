# Configuración experimental 026 — solo VM

Este asistente portable sirve exclusivamente para `2e7-candidate-04`, Windows 11
x64 y VirtualBox. No autoriza producción ni dos equipos por LAN. No utiliza las
bases principal o de desarrollo. La aceptación real de instalación sigue pendiente.

## Preparación gráfica en VirtualBox

1. Conserva la VM actual y crea otra instantánea antes de instalar candidate-04.
2. Comprueba Windows 11 x64, fecha/hora correctas, cuenta local nominativa y
   almacenamiento NTFS con espacio disponible. Usa esa misma cuenta durante
   instalación y configuración. No renombres carpetas de perfiles existentes.
3. Mantén desconectado el adaptador de red de la VM durante el ensayo loopback.
   No utilices carpetas compartidas ni unidades del anfitrión como destinos de datos.
4. PostgreSQL 18.3 y sus herramientas deben estar en
   `C:\Program Files\PostgreSQL\18\bin`. No crees bases ni usuarios en pgAdmin.
5. Copia los instaladores nuevos y sus SHA256. Conserva candidate-03 sin cambios.
   Verifica los hashes por un canal confiable antes de ejecutarlos.
6. Instala servidor y cliente candidate-04: pulsa Win+R, usa Examinar para elegir
   cada instalador y agrega `/LABONLY` al final de su ruta entre comillas. Esto
   requiere escribir una opción en Ejecutar, no comandos de PowerShell. No ejecutes
   instaladores en Windows 10 ni sobrescribas carpetas de candidatos anteriores.
7. Extrae por completo el ZIP del asistente usando el Explorador a una carpeta
   local del usuario, fuera de las instalaciones `server` y `client`. No abras el
   ejecutable desde dentro del ZIP. Mantén juntos todos sus archivos.

El paquete es experimental y no tiene firma empresarial. Si Defender, SmartScreen,
AppLocker o una política de firma bloquean su ejecución o sus scripts, detente y
conserva el mensaje. No desactives protecciones, no cambies políticas y no uses
ExecutionPolicy Bypass. Se necesitará una distribución firmada por un canal autorizado.

## Uso sin escribir comandos de PowerShell

Abre `Configuracion-026.exe` con doble clic y marca la confirmación de VM aislada.
Pulsa los botones en orden. Las carpetas y solicitudes JSON se preparan solas.

1. **Verificar instalación y prerrequisitos.** Comprueba SO, VirtualBox, usuario,
   inventarios fijados de candidate-04 y herramientas PostgreSQL 18.3. No inicia PG.
2. **Preparar carpetas privadas.** Crea directorios nuevos directamente bajo
   LOCALAPPDATA, sin herencia ajena: usuario actual, SYSTEM y Administradores.
   Comprueba archivo, propietario y ancestros con el verificador original.
3. **Generar confianza sintética.** Autoridad Ed25519 nueva con vigencia de dos
   días, CA de tres días y certificado HTTPS de dos días para SAN IP 127.0.0.1.
   No instala confianza global. Las claves quedan en archivos privados locales,
   nunca en pantalla, argumentos, informes o repositorio. No hay descarga en la VM.
4. **Inicializar servidor y verificar T0.** Ejecuta la herramienta existente `init`.
   Solo marca éxito tras salida correcta, `NEW_SYNTHETIC_INSTALLATION_T0_VERIFIED`,
   recibo `clean:true`, 23 tablas e identidad de base y clúster coherentes con el plan.
   Se crea una base aleatoria `ctsk_install_...` en un clúster nuevo. Solo incluye
   los contenidos técnicos fijados por el contrato; no tours ni reservaciones.
5. **Crear primer Administrador.** Se abre una consola real automáticamente.
   Captura nombre, correo de ensayo, contraseña nueva y confirmación; escribe
   `INICIALIZAR`. No escribas comandos ni pegues claves técnicas. La contraseña
   no se muestra ni se pasa al asistente. No redirijas ni grabes esa consola.
   Regresa al asistente; se comprueban salida y constancia firmada/reinscripción.
6. **Configurar cliente.** La herramienta `client` existente genera y valida
   `client026.json` y `authority026.json` en
   `%LOCALAPPDATA%\ctsk-client026-2e7-candidate-04`.
7. **Verificar e iniciar servidor.** Ejecuta preflight, abre la consola del servidor
   y comprueba un desafío HTTPS fresco firmado. Mantén esa consola abierta.
8. **Abrir Community Tours.** Inicia el cliente instalado y comprueba su señal de
   arranque. Esto no certifica login ni que la ventana haya terminado de cargar.

## Comprobación manual obligatoria en Windows 11

- T0: antes del bootstrap, conserva el resultado de la etapa 4. El recibo está en
  `%LOCALAPPDATA%\ctsk-server026-<identificador>\t0-installation026.json`.
  No compartas la carpeta completa: contiene secretos.
- Bootstrap: comprueba la etapa 5, la constancia firmada y la reinscripción. El
  primer login se hace con la cuenta capturada por ti; no hay credenciales por defecto.
- Servidor: comprueba la etapa 7, su consola y que el cliente se conecte a la misma
  instalación. Preflight por sí solo no demuestra funcionamiento del backend.
- Primer login: abre el cliente, inicia sesión y consulta las pantallas. Registra
  el resultado y posibles errores. No cargues datos empresariales ni actives proveedores.
- Cierre: cierra el cliente y pulsa Ctrl+C en la consola del servidor. Espera el
  cierre propio. No detengas ni modifiques el servicio PostgreSQL ajeno.
- Reinicio: vuelve a abrir el asistente, pulsa Revisar estado guardado, verifica
  de nuevo y utiliza los pasos 7 y 8. No repitas init, confianza ni bootstrap.
- Ensaya perfiles VMUser, VM User, VM Usuario Prueba y un perfil con acentos en
  instantáneas/cuentas independientes. No cambies el nombre físico del perfil.

## Errores, interrupción y recuperación

La sesión privada es `%LOCALAPPDATA%\ctsk-setup026-2e7-candidate-04`.
Un archivo de estado registra cada etapa antes de modificar datos. Si una etapa
falla o se interrumpe, queda En curso/Revisión necesaria y se bloquean repeticiones.
El botón Revisar estado guardado vuelve a comprobar la sesión y muestra ese estado;
no borra archivos, revierte COMMIT, vacía bases ni repite bootstrap automáticamente.
Un técnico debe revisar constancia, inscripción, procesos y recibos antes de decidir
la recuperación. No edites `state.json` para desbloquearlo. Para un ensayo nuevo se
puede volver a una instantánea coherente de la VM, conservando primero la evidencia
necesaria de forma segura. No borres carpetas privadas para reintentar a ciegas.

Los fallos de mantenimiento pueden tener códigos genéricos heredados. Se muestra
la etapa y un mensaje seguro; no se publican errores crudos que puedan contener secretos.
Si el asistente se cierra mientras el servidor está abierto, su consola sigue siendo
responsable del cierre. No termina procesos de otras instalaciones.

## Corrección de rutas y límites de validación

La envoltura anterior perdía los límites de `Start-Process -ArgumentList`. La nueva
usa CreateProcess con comillas CRT, stdin UTF-8 y datos JSON, sin evaluar rutas como
código. `control()` valida las identidades originales y transmite PGDATA solo al
proceso hijo; usa cwd verificado y log relativo fijo, de modo que los nombres del
perfil no se interpolan en el CMD que pg_ctl emplea internamente. Conserva pg_ctl
y su mecanismo de proceso restringido. El verificador ACL lee rutas UTF-8.

Las pruebas automatizadas nativas usan un registrador inocuo de argumentos y
procesos simulados. No equivalen a ejecutar PostgreSQL real en Windows 11. Quedan
pendientes el roundtrip completo PG/HTTPS, la consola TTY, cierre con Ctrl+C,
reinicio, fallo de disco y aceptación visual en la VM. La detección de VirtualBox
no certifica aislamiento; la autoridad vence y no se renueva automáticamente.

Fuentes técnicas: https://learn.microsoft.com/en-us/cpp/c-language/parsing-c-command-line-arguments
y https://github.com/postgres/postgres/blob/REL_18_STABLE/src/bin/pg_ctl/pg_ctl.c
