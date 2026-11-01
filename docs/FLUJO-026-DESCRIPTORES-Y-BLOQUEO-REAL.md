# Flujo de instalación 026: descriptores ausentes y corrección

31 de octubre de 2026. `synthetic-acceptance-only`; `productionAuthorized=false`.

## Hecho confirmado y relación entre etapas

El usuario confirmó en la VM que el acceso directo de candidate-04 contiene
`--ctsk-descriptor` y `--ctsk-trust`, pero no existe
`C:\Users\siste\AppData\Local\ctsk-client026-2e7-candidate-04`.
Esto confirma un prerrequisito incumplido para ese acceso directo; el código exacto
del cierre observado todavía no está confirmado. No es un error de argumentos ausentes.

El código establece esta secuencia:

| Etapa | Qué prepara y verifica |
| --- | --- |
| 1 | Entorno, inventarios y requisitos de seguridad |
| 2 | Directorios privados del asistente, servidor y cliente |
| 3 | Autoridad, claves y certificados sintéticos |
| 4 | Clúster nuevo, identidad y T0 limpio |
| 5 | Primer Administrador, constancia de bootstrap y reinscripción |
| 6 | `authority026.json` y `client026.json` firmados y ligados al servidor y cliente |
| 7–8 | Servidor HTTPS con identidad válida y apertura de Electron |

El `POLICY_BLOCKED` original impidió superar la etapa 1 y alcanzar las etapas
que preparan esa carpeta y sus archivos. Además, en la corrección anterior se
dejaron todas las escrituras explícitamente bloqueadas mientras faltara una vía
nativa validada para identidad/ACL y las garantías de opción C. Por tanto, aquel
preflight parcial **no podía generar configuración**. La ausencia de la carpeta
es coherente con este recorrido, aunque no prueba por sí sola todo el historial
de intentos o la inexistencia de otro servidor.

No corresponde fabricar una pareja de JSON, copiarla de otro candidato ni hacer
que Electron ignore la inscripción. Crear la carpeta vacía tampoco resuelve el inicio.

## Correcciones implementadas

**Lectura nativa sin PowerShell.** Se creó `SetupIdentityAcl.cs`, componente nuevo
y separado que solo consulta WMI, identidad y ACL mediante bibliotecas .NET del
sistema. Rechaza Windows anterior a 11, proceso/SO no x64, VM no VirtualBox, datos
incompletos, reparse points, propietarios no confiables y permisos ajenos que
incumplan los mismos criterios SID/máscaras del contrato previo. Diferencia ausencia
de archivos de errores de acceso; no traduce un acceso denegado como «missing».

No deriva de `SecurityProbe.cs` ni contiene creación/restricción de procesos,
depuración, Job, aprovisionamiento, cambios de ACL o servicios. Se compiló con el
compilador del sistema, x64, manifiesto asInvoker/compatibilidad Windows y advertencias
como errores. **No se ejecutó en Windows 10 ni se declara validado nativamente.**
La lectura de ACL usa las interfaces documentadas por Microsoft:
[DirectoryInfo.GetAccessControl](https://learn.microsoft.com/en-us/dotnet/api/system.io.directoryinfo.getaccesscontrol?view=netframework-4.8.1).

`native-readiness.cjs` inicia exclusivamente ese lector con argumentos fijos y
JSON por stdin, sin shell, timeout y salida limitada. Exige código cero, ausencia
de error/señal/stderr, esquema completo, identidad y correspondencia de cada ruta.
El directorio real de usuario se contrasta con KnownFolder de Windows, no solo
con una variable de entorno. Lectura correcta **no implica** token de initdb o
contención verificados: ambos campos deben seguir false.

El asistente muestra ahora la presencia de carpeta/descriptor/autoridad y la etapa
responsable de generarlos. No duplica la lectura nativa después del preflight parcial.
Las acciones de escritura permanecen bloqueadas por IPC y coordinador. El nuevo
perfil de interfaz no reutiliza el de setup-02.

**Emisión y validación de configuración.** En `maintenance.cjs` se mantienen el
plan del servidor firmado y validado, inventarios, CA y clave autorizada. Se añade
comprobación de constancia de bootstrap firmada y ligada a la misma instalación,
usuario inicial, generación, código y clúster. Para restauración se exige su
constancia autorizada y vínculo de destino; no se cambian esquemas o datos.
Antes de emitir se revalida que el plan no cambió.

La publicación se separó en `client-enrollment.cjs` y ahora:

- Exige destino nuevo vacío y canónico, ámbito sintético y firma autorizada antes
  de escribir. La autoridad y la clave siguen siendo externas y privadas.
- Escribe con exclusión `wx`, fsync y comprobación ACL de **ambos archivos**.
- Ejecuta la validación real del cliente y compara su identidad con la emitida.
- Publica una constancia firmada `client-enrollment-completed.json` que liga los
  hashes de autoridad/descriptor y los digests de cliente/servidor.
- Revalida al terminar y comprueba que los bytes no cambiaron. Solo entonces el
  llamante anuncia éxito. Un error conserva evidencia, no sobrescribe ni reintenta.

La constancia de intención no es una aprobación. Tampoco basta ver los archivos
o una constancia completada: deben pasar sus firmas, identidad, ACL y hashes.
Esta corrección está en fuentes; no está desplegada en el mantenimiento instalado
de candidate-04 y no se invoca desde la revisión de solo lectura.

**Cierre de un camino de evasión involuntaria.** El aprovisionador heredado no
implementaba aún la inicialización acotada de opción C. Se bloqueó también su
llamada directa (`OPTION_C_PROVISIONING_UNVALIDATED`) antes de escribir, además de
la entrada de mantenimiento init/restore. No basta saltarse el asistente e invocar
Node para obtener un clúster sin primer token y contención comprobados.

## Entrega concreta para Windows 11

Se preparó **`CTSK-026-FlowReview-01.zip`**, con inventario nuevo, runtime existente
copiado y el lector independiente. Es una revisión gráfica de lectura, **no**
setup-03, candidate-05, un instalador o un aprovisionador habilitado. No se cambian
archivos de setup-02/candidate-04 ni se requiere ejecutar comandos manuales.

[F-01: pasos breves, permisos, efectos y resultados esperados](PRUEBA-FLUJO-026-IDENTIDAD-ACL.md).
Permite validar en la VM una pieza que antes no existía: la lectura de identidad
y ACL compatible con Restricted, y su relación con el estado de configuración.
Si una protección bloquea el componente, se detiene esa validación; no se restaura,
excluye o reconstruye para eludirla. El prototipo en cuarentena permanece intacto.

## Comprobaciones y límites

**337 pruebas seguras aprobadas; cero fallos u omitidas.** Procesos, conexiones y
listeners reales permanecieron bloqueados por el guard. Se comprobaron rechazo
de datos nativos incompletos/ambiguos, destinos e identidades ajenos, firma inválida,
fallos ACL, cambios de bytes, falta de prueba de bootstrap, escritura sin postcondiciones
y el bloqueo de una llamada directa que pretendiese eludir opción C.

La compilación C# pasó sin advertencias. La ejecución del lector y del asistente
nuevo **está pendiente de la prueba manual en Windows 11**. Ningún test simulado
certifica su comportamiento nativo o permisos reales de esa VM. No se repitieron
N-02, N-03 o N-04; no se investigaron nuevas alternativas PostgreSQL.

## Qué falta antes de generar los archivos reales

1. Resultado manual F-01 del lector de identidad/ACL; si falla, corregir la causa
   exacta sin saltarse controles. Esta prueba no crea la carpeta ni descriptores.
2. Implementar/validar la creación privada y la inicialización real de opción C:
   primer token independiente antes de reanudar initdb, contención, mínimos privilegios,
   servicio exclusivo, identidad, handles y parada. **El lector entregado no resuelve
   esos puntos ni se presenta como equivalente.**
3. Integrar los flujos de escritura sin dependencias bloqueadas de PowerShell y
   probar sus fallos. La ACL del backend/cliente instalado y el control PostgreSQL
   heredados todavía no se sustituyen automáticamente por este lector de diagnóstico.
4. Con las garantías superadas, revisar y ejecutar manualmente el aprovisionamiento
   sintético real, T0 y bootstrap. Entonces puede emitirse y validarse la pareja
   de archivos en la etapa 6 y comprobarse el cliente contra el servidor HTTPS.

No se declara corregida toda la instalación ni habilitado aprovisionamiento. No
se han creado bases, servicios, usuarios, directorios de configuración de la VM,
descriptores o secretos. No se modificaron políticas, antivirus, ACL o bases del
anfitrión. Los candidatos previos se conservan. N-04 sigue en pausa.
