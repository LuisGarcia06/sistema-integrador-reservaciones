# Fase 2B.1 — HTTPS seguro en laboratorio loopback

Fecha: 26 de octubre de 2026. Implementación y validación con datos sintéticos. No habilita LAN, producción ni instalación de certificados en Windows.

## Resultado

- Modalidad nueva explícita: `--ctsk-mode=https-lab`, con configuración pública de cliente separada de la configuración del servidor.
- Node/Express HTTPS independiente, escucha exclusiva en **127.0.0.1** y puertos de laboratorio. PostgreSQL desechable también en loopback.
- Certificados y claves nuevos por laboratorio; identidad Ed25519 con nonce, servidor estable, entorno, release, protocolo e instancia de ejecución.
- Electron comprueba identidad antes de mostrar la aplicación. Una caída, reinicio o fallo de confianza destruye la ventana operativa y muestra una pantalla local sin acceso a datos. Al recuperar confianza abre una sesión nueva.
- JWT, roles, alcance, sandbox, context isolation, validación de navegación, rutas relativas y revalidación de permisos del PDF conservados.
- Centro de Avisos y Daily PDF reales comprobados con HTTPS. El backend continúa después de cerrar Electron.
- Modalidades heredada y HTTP independiente de Fase 1 conservadas y verificadas.

## HTTPS y confianza limitada a la aplicación

El preparador utiliza el OpenSSL **ya instalado con Git** en `C:\Program Files\Git\usr\bin\openssl.exe`. No añade dependencias npm, descarga herramientas ni modifica almacenes de certificados. OpenSSL se utiliza exclusivamente para crear certificados X.509 de prueba; el runtime usa módulos estándar de Node y las dependencias existentes.

La CA del laboratorio dura tres días; el certificado de servidor, dos. El certificado tiene SAN **IP:127.0.0.1**, uso serverAuth y clave RSA de 2048 bits. Se exige TLS 1.2 o superior. También se crean certificados de prueba desconocido, vencido y con SAN incorrecto para verificar rechazos. La CA privada queda en `issuer/`; las claves privadas de TLS e identidad permanecen en `server/`.

Node valida normalmente cadena, vigencia y nombre mediante `ca`, `rejectUnauthorized: true` y `tls.checkServerIdentity`; añade un pin SHA-256 de la clave pública del servidor. No se usan opciones para ignorar certificados, sustituir la comprobación de nombre por éxito ni desactivar webSecurity.

Electron utiliza **solo en su sesión de laboratorio** un verificador de certificados con la CA pública autorizada. Antes de aceptar una hoja presentada por Chromium:

1. Comprueba que el hostname es exactamente 127.0.0.1.
2. Abre una conexión TLS Node al puerto público fijado en la configuración del cliente.
3. Node exige cadena confiable, vigencia, nombre y pin correctos.
4. Compara los bytes DER de la hoja validada con la hoja presentada a Chromium.
5. Solo entonces autoriza ese certificado; ante cualquier error lo rechaza.

Esta verificación proporciona una raíz de confianza **de aplicación**, sin instalar la CA en Windows. No es aceptación incondicional por nombre o por fingerprint. El manejo normal del handshake TLS permanece activo en ambos motores. La prueba real verifica rechazo de CA desconocida, certificado vencido y nombre incorrecto tanto en Node como en Electron.

Referencia de la API de verificación de Electron: https://www.electronjs.org/docs/latest/api/session#sessetcertificateverifyprocproc . Validación de nombre Node: https://nodejs.org/download/release/v22.20.0/docs/api/tls.html#tlscheckserveridentityhostname-cert . El uso futuro en dos computadoras necesita revisar aprovisionamiento, rotación y confianza de distribución; este perfil sigue siendo local.

## Identidad asimétrica y disponibilidad

`serverIdentity.js` utiliza Ed25519. La respuesta firmada tiene una representación canónica con etiqueta de dominio y vincula:

- protocolo 1;
- nonce aleatorio de 256 bits;
- ID estable del servidor;
- entorno fijo `https-loopback-lab`;
- huella de código aprobada;
- ID aleatorio de la ejecución actual;
- origen HTTPS esperado;
- disponibilidad.

El cliente posee solo la clave pública autorizada. Rechaza firma, nonce, identidad, entorno, release o protocolo incorrectos. Los retos consumidos se rechazan; el servidor mantiene una ventana acotada de retos usados durante dos minutos y el cliente genera nonces nuevos en cada consulta. No se transfieren ni se utilizan claves HMAC en la modalidad HTTPS. El preparador de base compartido puede generar el archivo `service.key` de Fase 1, pero esta modalidad no lo lee y no forma parte de su configuración de cliente.

El servidor reutiliza las verificaciones completas de Fase 1: configuración y ACL, huellas, directorio/PID del clúster nuevo, identidad efectiva de PostgreSQL, rol limitado, esquema y columnas 018. El pool continúa en `backend/config/database.js`.

El reto solo se responde con éxito cuando PostgreSQL está disponible. Si falla una consulta de salud, no se entrega una respuesta de disponibilidad válida; antes de volver a aceptarla se repiten las verificaciones PostgreSQL. La firma acredita la identidad y la declaración del proceso; no constituye atestación remota frente a un servidor comprometido.

## Separación de archivos privados y públicos

Cada ejecución crea un directorio privado nuevo `%LOCALAPPDATA%\ctsk-standalone-<12 hex>` con ACL restringidas. No se modifican ACL de directorios existentes.

```text
laboratorio/
  data/                         clúster PostgreSQL nuevo
  manifest.json                 contrato privado de aislamiento
  runtime.env                   credenciales sintéticas PostgreSQL/JWT
  test-user.json                credenciales de aplicación sintéticas
  issuer/                       CA privada y archivos del emisor de pruebas
  server/
    server.json                 configuración exclusiva del servidor
    tls-key.pem                 clave TLS privada
    tls-cert.pem                certificado de servidor
    identity-private.pem        clave privada Ed25519
    ...                         fixtures TLS negativos
  client/
    client.json                 origen, servidor, entorno, versión y hashes públicos
    ca.pem                      certificado público de CA
    identity-public.pem         clave pública Ed25519
    electron-profile/           perfil aislado
    daily-synthetic.pdf         solo en el ensayo automatizado
```

El cargador del cliente no lee `runtime.env`, el manifiesto privado, HMAC, claves TLS, clave del emisor o clave privada de identidad. El perfil requiere todavía las fuentes completas para comprobar su huella local; no es el paquete final de un cliente remoto.

## Iniciar desde PowerShell

Requisitos: dependencias existentes instaladas, PostgreSQL **18.3** en `C:\Program Files\PostgreSQL\18\bin`, OpenSSL de Git en la ruta anterior. Utilizar una PowerShell nueva sin variables DB/PG/APP/Node/proveedor heredadas. No ejecutar migraciones, npm install ni scripts productivos.

Preparar un laboratorio nuevo:

```powershell
Set-Location 'A:\sistema-integrador-reservaciones'
.\scripts\HttpsLab.ps1 -Mode Prepare
```

Imprime las rutas `SERVER ...\server\server.json` y `CLIENT ...\client\client.json`. El clúster sintético queda iniciado. El preparador verifica ACL antes de iniciar PostgreSQL, obtiene su identidad offline y comprueba que no es el clúster principal antes de conectar. Solo aplica schema.sql sobre su base nueva y vacía; no usa respaldos de producción.

En una consola separada:

```powershell
$server = 'C:\RUTA-IMPRESA\server\server.json'
node .\backend\httpsLab.js --server $server
```

Esperar `HTTPS_LAB_READY`. En otra consola:

```powershell
$client = 'C:\RUTA-IMPRESA\client\client.json'
npm run desktop -- --ctsk-mode=https-lab "--ctsk-client=$client"
```

Las credenciales son nuevas y sintéticas, en `test-user.json` del laboratorio. No utilizar usuarios o contraseñas productivas. El cliente no inicia PostgreSQL ni el backend. Al cerrar Electron el backend permanece en su consola. Al caer o reiniciar Node, el cliente bloquea operaciones y vuelve a solicitar login después de verificar la conexión recuperada. No repite escrituras automáticamente.

Para detener:

1. Cerrar Electron.
2. Pulsar **Ctrl+C** en la consola Node del laboratorio.
3. Detener únicamente el PostgreSQL de ese laboratorio:

```powershell
.\scripts\HttpsLab.ps1 -Mode Stop -Server $server
```

Detener el laboratorio antes de editar código. Un cambio de huella invalida las configuraciones antiguas; no editar hashes para forzar el arranque. Los comandos Stop verifican rutas, ACL y PID; no eliminan carpetas y no detienen servicios Windows.

## Ensayos y resultados

Prueba completa, siempre con otro clúster nuevo y datos sintéticos:

```powershell
.\scripts\HttpsLab.ps1 -Mode Verify
```

Crea certificados, base, datos operativos y avisos sintéticos. Comprueba HTTPS y negativos de TLS; firma y replay; login, JWT y permisos; Centro de Avisos; abre el main real de Electron y comprueba contexto seguro y Web Locks; genera el PDF mediante botón, preload, IPC, revalidación HTTPS y motor PDF reales; reinicia exclusivamente el backend del ensayo, comprueba bloqueo/reconexión y login nuevo; cierra Electron y vuelve a consultar la API para demostrar independencia. Al terminar detiene sus procesos Node/Electron y el clúster de prueba.

Solo se simula la elección del archivo en el diálogo nativo de guardado; el PDF se genera y escribe realmente. El harness usa renderizado por software y ventana oculta, como las pruebas de impresión anteriores; no valida una impresora física ni el comportamiento de todos los controladores gráficos.

Regresión aislada (pg real bloqueado y sin suites TRUNCATE):

```powershell
node node_modules/jest/bin/jest.js --config backend/__tests__/standalone.jest.config.cjs --runInBand --runTestsByPath backend/__tests__/httpsLab.test.js backend/__tests__/standalone.test.js backend/__tests__/release03aStartup.test.js backend/__tests__/release03aPolicy.test.js backend/__tests__/release03aProcesses.test.js backend/__tests__/printBranding.test.js backend/__tests__/notificaciones.electron.test.js backend/__tests__/centroAvisos.test.js backend/__tests__/centroAvisosTiming.test.js backend/__tests__/accessScope.routes.test.js
```

Resultados finales:

- **291 pruebas aprobadas en 10 suites; cero fallidas.** Incluye notificaciones con simulador corregido, permisos, Centro, impresión y modalidades existentes.
- **HTTPS real: 11 grupos de comprobaciones aprobados**, incluyendo certificados inválidos en Node/Electron, PDF, reconexión y backend independiente. Evidencia: `C:\Users\luisg\AppData\Local\ctsk-standalone-8655b2651248\https-verification.json`, con `completed=true`, `failures=[]` y `postgresStopped=true`.
- **HTTP independiente de Fase 1 revalidado con PostgreSQL/Electron reales:** evidencia `C:\Users\luisg\AppData\Local\ctsk-standalone-9ac17c0fe2fb\verification.json`. Seis comprobaciones aprobadas y clúster detenido.
- Sintaxis JavaScript/PowerShell y diff comprobados separadamente.
- **No ejecutado:** conexión LAN/dos computadoras, reglas firewall, arranque como servicio Windows, instaladores, producción, proveedores reales e impresión física. No forman parte de esta fase.

No ejecutar `npm test` global ni `api.test.js` para sustituir estas verificaciones.

## Simulador de notificaciones y problemas encontrados

El simulador no reconocía `/api/eventos-integracion/centro` y su historial. Ahora responde con las mismas filas mutables de la prueba y conserva estados, filtros, paginación e historial. La detección de rutas inesperadas y la denegación de eventos a Consulta restringida permanecen activas. Se añadieron pruebas del contrato de ese fixture. No se cambió ningún archivo frontend para satisfacerlo; la suite específica pasó y forma parte de las 291 pruebas finales.

Durante el desarrollo hubo intentos fallidos, que no se presentan como aprobados:

1. OpenSSL no aceptó días negativos para crear un certificado vencido. Se sustituyó por emisión con fechas explícitas de 2020, exclusivamente en el emisor desechable.
2. La barrera del preparador sintético no contemplaba la forma numérica de Socket.connect. Se corrigió conservando únicamente el puerto autorizado y se acotaron tiempos de espera/rollback. El clúster pendiente de ese intento se detuvo mediante el wrapper con entorno limpio.
3. El harness hacía mostrar/ocultar la ventana del main real; la decodificación del logo quedaba pendiente y la protección de impresión rechazaba exportar. Se comprobó que HTTPS transfería el recurso íntegro byte a byte. Se mantuvo show:false desde el inicio, como el harness de impresión existente. Se retiró la instrumentación de diagnóstico; el flujo completo por botón e IPC pasó sin modificar el frontend ni omitir la espera del logotipo.

Las evidencias fallidas quedan en sus carpetas privadas. Los clústeres creados durante intentos y verificaciones quedan detenidos; no se borra evidencia ni se restauran respaldos.

## Archivos de esta fase

Modificados, conservando cambios anteriores:

- `backend/__tests__/helpers/notificacionesUiHarness.cjs`: atender Centro e historial sin aceptar rutas desconocidas.
- `backend/config/standalonePolicy.js`: separar lectura PostgreSQL de lectura HMAC y ampliar la huella al nuevo conector/status local.
- `backend/standalone.js`: reutilizar el ciclo de vida validado con responder de identidad inyectable; ruta heredada HMAC conservada.
- `electron/main.js`: modo HTTPS explícito, perfil y sesión separados, estados de conexión y revalidación PDF sobre HTTPS. Modalidades anteriores conservadas.
- `readme.md`: referencia a este procedimiento.

Nuevos:

- `backend/config/httpsLabPolicy.js`: contratos separados y privados/públicos.
- `backend/security/serverIdentity.js`: firma Ed25519 y verificación de identidad/replay.
- `backend/httpsLab.js`: entrada HTTPS loopback con controles de base existentes.
- `electron/httpsBackend.js`: TLS validado, confianza de sesión y vigilancia/reconexión.
- `electron/connection.html`: pantalla local aislada, sin preload operativo ni acceso de red.
- `scripts/HttpsLab.ps1`, `scripts/httpsLab.cjs`: preparación, prueba y parada del laboratorio.
- `scripts/httpsCertificates.cjs`: certificados desechables con herramienta existente.
- `scripts/httpsLabVerify.cjs`, `scripts/httpsElectronDriver.cjs`: pruebas reales Node/PostgreSQL/Electron/PDF y reinicio.
- `backend/__tests__/httpsLab.test.js`, `backend/__tests__/helpers/notificacionesCentroFixture.cjs`: seguridad y contrato del simulador.
- Este informe.

## Aislamiento, reversión y siguiente fase

No se modificaron esquema/datos/configuración de `sian_kaan_reservaciones`, archivos de integraciones, ngrok, certificados o tokens existentes, firewall, servicios Windows, tareas programadas ni instalador. No se instaló ninguna CA en Windows. Todas las escuchas nuevas son 127.0.0.1. El servidor bloquea las entradas y controles de integraciones en este laboratorio, y su barrera de salida admite solo el PostgreSQL aislado. No se utilizó TRUNCATE ni datos productivos.

Comparación SHA-256 contra el inicio: **642 archivos existentes idénticos, cinco modificados por esta fase, ninguno perdido y trece nuevos**. Se verificó la parada de los doce clústeres creados durante los intentos/ensayos de esta tarea; ninguno conserva su archivo PID activo.

Reversión operativa: cerrar el Electron HTTPS, detener su Node con Ctrl+C, detener su clúster con el wrapper y abrir la modalidad anterior sin `--ctsk-mode=https-lab` ni `--ctsk-client`. No hay migración productiva que revertir ni CA global que retirar. Si se decide retirar código, hacerlo solo sobre los cambios enumerados tras revisión; no usar reset/clean ni descartar trabajo ajeno. Las carpetas de laboratorio pueden conservarse como evidencia; no se eliminan automáticamente.

Para Fase 2B.2 siguen pendientes: nombre y direcciones estables, separación definitiva de artefactos cliente/servidor, custodia/renovación/revocación de confianza, posible autenticación del dispositivo, política efectiva del firewall y laboratorio aislado de dos equipos. La CA y las claves de este ensayo no deben convertirse en credenciales de operación. La apertura LAN, supervisión Windows y publicación productiva requieren revisión posterior; este código no las activa.
