# F-01 — Revisión del flujo de configuración en Windows 11

`synthetic-acceptance-only`; `productionAuthorized=false`.
Procedimiento para revisar **antes** de su ejecución manual en VirtualBox,
VM `Windows11-CommunityTours-Test`. No repite N-02, N-03 o N-04.

## Qué abre, permisos y efectos

El ZIP `CTSK-026-FlowReview-01.zip` contiene un asistente gráfico de revisión,
con copia del runtime Electron/Node existente y un lector .NET nuevo de identidad
y ACL. **No es setup-03 ni un instalador de Community Tours** y no modifica setup-02
o candidate-04. El lector se compiló por separado y no se ejecutó en Windows 10.
No usa ni recompila el prototipo en cuarentena: no contiene lanzamiento de
procesos, manipulación de tokens, Job o PostgreSQL; solo consultas WMI, identidad
del usuario y ACL mediante bibliotecas Windows/.NET.

Permisos normales, sin administrador ni contraseñas. El asistente verifica su
inventario y los payloads instalados candidate-04. Al pulsar Verificar ejecuta
directamente el lector mediante un hijo propio, con JSON por stdin, sin shell
o PowerShell. Consulta fabricante/modelo/UUID de la VM, SID del usuario, ACL de
los runtimes instalados y presencia/ACL de la carpeta y archivos esperados del
cliente. Ante lectura incompleta o error rechaza el resultado.

Extraer el ZIP crea únicamente archivos en un destino nuevo. Electron crea cachés
en un perfil nuevo de interfaz (`ctsk-setup026-flow-review01-ui`). No se crean
`ctsk-client026-*`, directorios del servidor, descriptores, certificados, bases,
servicios o usuarios; no cambia ACL, políticas, antivirus o datos. Windows y el
antivirus pueden registrar la apertura de programas. No se promete ausencia de
esas trazas del sistema.

Si hay UAC, SmartScreen, McAfee/Defender u otra protección bloqueando el programa,
cancelar y comunicar el mensaje. No pulsar opciones para eludir el bloqueo, restaurar
archivos o crear exclusiones. El lector es un componente nuevo y su validación
nativa está pendiente; ninguna coincidencia de versión lo sustituye.

## Pasos breves

1. Confirmar el título de la VM. Cerrar el asistente setup-02; no desinstalarlo ni
   modificar sus archivos. Conservar la instantánea actual.
2. Extraer el ZIP completo en una carpeta nueva de la VM, por ejemplo
   `Descargas\CTSK-026-FlowReview-01`. Si el destino ya existe, no sobrescribirlo.
   Revisar el SHA256 entregado como parte del traslado, sin repetir lecturas PostgreSQL.
3. Abrir **`Revision-Configuracion-026.exe`**, sin elevación. No abrir directamente
   `native\SetupIdentityAcl.exe`: es un lector interno con entrada estructurada.
4. Se espera el título «Revisión de configuración 026 · solo lectura». Marcar la
   declaración de VM sintética y pulsar **Continuar** en la primera etapa.
5. Esperar el resultado y devolver el texto/código visible o una captura recortada.
   No pulsar etapas de escritura ni intentar crearlas con comandos; permanecerán
   deshabilitadas. Cerrar la ventana al terminar.

## Resultado esperado para lo ya observado

Si inventarios, identidad de VirtualBox y ACL de los programas pasan, se mostrará
«Identidad de VM y ACL leídas sin PowerShell», junto a:

- Carpeta del cliente: `missing`.
- Descriptor: `missing`.
- Autoridad: `missing`.
- Explicación: carpeta en etapa 2; archivos firmados en etapa 6, después de T0
  y bootstrap; no se generó configuración; pendientes primer token, contención
  y servicio exclusivo.

Es un resultado de diagnóstico correcto, **no configuración terminada**. Si los
archivos aparecen por otro trabajo manual, el lector solo mostrará presencia/ACL;
no los considerará inscritos sin validar firmas y vínculo al servidor.

`NATIVE_READ_FAILED`, un código ACL, inventario inválido o archivo requerido ausente
son resultados a revisar. No modificar permisos ni saltar controles para forzar
«pasado». La información del resultado permite decidir la corrección siguiente.
No se pide repetir N-02/N-03/N-04 ni introducir credenciales.

## Criterios futuros de configuración realmente generada

F-01 no genera estos archivos. Solo se podrá marcar la etapa 6 completada cuando:

1. Etapas previas verificadas: directorios privados, confianza sintética, inicialización
   con primer token/contención de opción C, T0 limpio y bootstrap del primer Administrador.
2. `authority026.json` y `client026.json` existan en la ruta de ese release, con
   ACL privadas y rutas canónicas verificadas, sin reutilizar ni sobrescribir otro intento.
3. Autoridad vigente y descriptor firmado válidos, ligados a inventario del cliente,
   instalación, generación, época de autenticación, código/HTTPS del servidor y CA correcta.
4. La postvalidación real del cliente pase. La constancia firmada
   `client-enrollment-completed.json` debe corresponder a los SHA256 actuales de
   ambos archivos; su mera presencia no basta. Un fallo deja evidencia y exige revisión.
5. El cliente verifique la identidad HTTPS del servidor antes de abrir módulos.

Las escrituras siguen bloqueadas hasta validar las primitivas nativas necesarias
y revisar el procedimiento de aprovisionamiento real. Este diagnóstico no declara
instalación integral aprobada ni autoriza construir candidate-05/setup-03.
