# Entrega experimental: candidate-04 y asistente 026-setup-02

Estado: construido y verificado mediante pruebas automatizadas aisladas.
Instalación real Windows 11/VirtualBox, T0, bootstrap, servidor y primer login:
**pendientes de aceptación manual**. Producción no autorizada.

## Artefactos a copiar a la VM

| Artefacto | Ubicación desde la raíz del repositorio | Bytes | SHA256 |
|---|---|---:|---|
| Servidor | `dist/windows-2e7/2e7-candidate-04/CommunityTours-server-2e7-candidate-04-win-x64-UNSIGNED.exe` | 34102095 | `3b920f52bfd84be8496c0f6140f2af1ac63dcc427919a7c0f53dd210e4d84327` |
| Cliente | `dist/windows-2e7/2e7-candidate-04/CommunityTours-client-2e7-candidate-04-win-x64-UNSIGNED.exe` | 150086330 | `15cb17d7d466e194b93d45ae6383e623c6281f140272eefafdc1b7ba2510d3dc` |
| Asistente portable | `dist/windows-setup/026-setup-02.zip` | 180674565 | `504c81ca8283740618337af64ff6caf24b94cb6ec1993fc54a6c728d773ad142` |

Huellas juntas: `dist/windows-setup/SHA256SUMS-candidate04-setup02.txt`.
La carpeta sin comprimir del asistente está en `dist/windows-setup/026-setup-02`.
No entregar `026-setup-01`: es una compilación preliminar conservada, anterior
a los últimos controles y mensajes. No se sobrescribieron artefactos previos.

## Causa y corrección

La envoltura `control()` entregaba un array sin comillas a PowerShell
`Start-Process -ArgumentList`, que lo concatenaba y dividía las rutas con espacios.
Además, pg_ctl construye internamente una línea CMD para arrancar PostgreSQL:
poner comillas únicamente en la primera capa no evita expansión de porcentajes
en nombres de directorios en esa segunda capa.

La corrección conserva las comprobaciones de directorio canónico, marcador,
identidad del clúster y PID/puerto de parada. Mantiene pg_ctl y su proceso
restringido. El lanzador común usa comillas CRT/CreateProcess sin shell, parámetros
JSON por stdin UTF-8 y `UseShellExecute=false`. Para pg_ctl, PGDATA se establece
exclusivamente en el entorno del hijo; el cwd es el directorio privado verificado
y el log es el nombre relativo fijo `postgres.log`. La ruta del perfil no se
introduce en la línea CMD que construye pg_ctl. El verificador ACL también lee
UTF-8 para no perder rutas con acentos.

No se modificaron los esquemas, reglas de negocio, roles, contratos de autoridad,
integraciones ni bases de datos. `synthetic-acceptance-only` y
`productionAuthorized=false` continúan obligatorios.

## Alcance del candidato

El nuevo origen deriva de candidate-08 de componentes, verificado antes de copiar.
Solo cambia en el servidor `scripts/enterprise026Provision.cjs`,
`backend/config/windowsConfigAcl.js` y el nuevo `shared/windowsProcess.js`;
en el cliente cambia `electron/windowsConfigAcl.js`. Se regeneran sus inventarios,
archivos de origen y envolturas NSIS bajo un identificador distinto.

Candidate-03 y sus payloads se verificaron de nuevo al terminar y conservan sus
hashes originales. Su defecto sigue documentado por las pruebas de caracterización;
no se editaron sus ejecutables, archivos extraídos ni configuración de la VM.

## Pruebas ejecutadas

- Regresión previa: 1138 pruebas, 41 suites, cero fallos. Evidencia:
  `../local-fase-2e7/jest-candidate04-paths.json` y su log. Usa las barreras
  originales de PostgreSQL/red, sin aprovisionamiento real.
- Asistente, rutas e integración simulada: 65 pruebas, cero fallos, cero omisiones.
  Evidencia: `delivery-tests.json` y `delivery-tests.tap`.
- Auditor externo: una prueba adicional aprobada, validando importación sin
  ejecución y rechazo de rutas de artefacto arbitrarias.
- Pruebas Windows nativas de argumentos: VMUser, VM User, VM Usuario Prueba,
  María Álvarez, A&B (Prueba), apóstrofo/caret/dólar/backtick/punto y coma,
  `%USERNAME% ! %PATH%`, argumentos vacíos, comillas y barras finales. También
  transmisión real de un JSON por `powershell.exe -File`, con rutas especiales.
- Las ocho etapas se recorrieron con procesos, identidad, consola y red simulados.
  Se comprobaron fallos de T0, mantenimiento, bootstrap, constancia, servidor,
  cliente, permisos, destinos ocupados, concurrencia y recuperación bloqueada.
- Criptografía: emisión aislada de certificados mediante OpenSSL, comprobación
  de claves/SAN/firma/vigencia y rechazo de sobreescritura o ACL inválida.
  Las claves de la suite se eliminaron de su árbol temporal propio; nunca se
  usaron como autoridad de la instalación ni se incluyeron en artefactos.
- Auditoría NSIS por extracción: ambos payloads coinciden exactamente, PE AMD64,
  nueve contratos SQL preservados y rechazo sin configuración. No se ejecutaron
  los instaladores. Evidencia: `../local-fase-2e7/2e7-candidate-04-audit.json`.
- Auditoría del ZIP del asistente: 104 archivos, inventario cerrado, fuentes
  distribuidas exactas, sin material privado/fixtures, runtimes AMD64 y OpenSSL
  funcional desde el directorio extraído sin depender del PATH de Git. El worker
  empaquetado rechazó Windows 10 antes de aprovisionar. Evidencia:
  `026-setup-02-audit.json`.

El primer recorrido completo de tests detectó una validación de fecha demasiado
temprana durante la emisión de certificados; se corrigió para comparar con el
reloj al terminar de emitir. Se conservan los resultados previos; los resultados
de entrega son `delivery-tests.*`, no `automated-tests.*`.

Estas pruebas no ejecutaron PostgreSQL real, bootstrap real, instaladores ni la
interfaz completa del asistente en Windows 10. El smoke de Electron de la auditoría
NSIS solo comprueba el rechazo sin descriptor y no equivale a primer login.

## Fuentes nuevas y modificadas

Lista legible por máquina con los tres archivos existentes modificados y los
24 archivos nuevos de implementación, pruebas y guía: `delivery.json`.
Los archivos de evidencia e informes de compilación/auditoría también son nuevos.

Principales archivos modificados:

- `backend/config/windowsConfigAcl.js`: entrada UTF-8.
- `scripts/enterprise026Provision.cjs`: lanzamiento seguro de pg_ctl.
- `scripts/windows-installers/build.cjs`: origen explícito y trazabilidad sin
  sobrescribir candidatos históricos.

Principales archivos nuevos:

- `shared/windowsProcess.js`: construcción de argumentos y lanzamiento sin shell.
- `scripts/windows-installers/prepare-path-candidate.cjs`: derivación limitada.
- `scripts/windows-setup/`: interfaz Electron/HTML/CSS/JS, worker, políticas,
  inventarios, estados, criptografía, scripts de consola/permisos, empaquetador,
  auditor y pruebas.
- `docs/ASISTENTE-CONFIGURACION-026.md`: procedimiento completo para la VM.

## Procedimiento gráfico de aceptación

Seguir `../ASISTENTE-CONFIGURACION-026.md`, también incluido como `LEEME.md` en
el ZIP. Crear instantánea, verificar hashes, instalar ambos candidate-04 con
`/LABONLY`, extraer el ZIP fuera de server/client y abrir `Configuracion-026.exe`.
Usar los ocho botones en orden. Solo se escribe información de usuario en la
consola del bootstrap; no comandos de PowerShell. Conservar la consola del servidor.

Comprobar por separado: T0 limpio de 23 tablas antes de usuarios; creación y
reinscripción del Administrador; descriptor aceptado; desafío HTTPS del servidor;
ventana y login real; cierre Ctrl+C; reinicio y persistencia. No introducir datos
empresariales ni activar integraciones durante esta aceptación.

## Límites y bloqueos posibles

- Falta ejecutar el recorrido real de PostgreSQL, consola TTY, permisos efectivos,
  GUI, cierre/reinicio y login dentro de Windows 11/VirtualBox.
- No hay firma empresarial autorizada. Si una política bloquea scripts o
  ejecutables, detenerse; no cambiar políticas ni usar Bypass.
- La autoridad vence a los dos días. No hay renovación automática.
- Las etapas ambiguas quedan en revisión. La recuperación conserva datos y
  constancias; no desbloquea editando JSON ni repite COMMIT o bootstrap.
- La detección de VirtualBox no certifica aislamiento de redes. Se requiere la
  preparación de VM descrita en la guía.
- La señal CLIENT026_READY no prueba por sí sola ventana cargada o login exitoso.
- La revisión de dependencias/inventarios no equivale a una auditoría completa
  de vulnerabilidades ni autoriza distribución en equipos físicos.
