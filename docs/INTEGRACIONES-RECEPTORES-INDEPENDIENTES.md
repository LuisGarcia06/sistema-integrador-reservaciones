# Receptores independientes: preparación de desarrollo

Estado: código preparado y pruebas con dobles. No desplegado, sin recepción real,
sin conexión a PostgreSQL principal y sin uso de secretos reales.

## Qué se reutiliza

- Gmail: OAuth, decodificador MIME, parser, clasificador, mapper, cursor de Gmail,
  baseline sin importación histórica y recuperación paginada existentes.
- FareHarbor: mapper, fingerprint, clasificación y transacción existentes.
- Ambos: `registrarEventoIntegracion`, identidad única `(provider, external_event_id)`,
  eventos `pending_review` / `not_applied` y resumen actual de notificaciones.
- La admisión reutiliza `verifyPostgres`: dirección efectiva, base, clúster,
  versión, rol limitado, esquema y migración 017. No crea conexiones ni roles.

Los adaptadores viven en `scripts/integrations/`, excluido del instalador por la
regla actual `!scripts/**/*`. No están importados por Electron, su backend ni
`npm run desktop`. Importar o ejecutar estos módulos como archivos no activa nada.
No se cambian sus políticas de red, configuración privada, ACL ni IPC.

## GetYourGuide

`createGetYourGuideReceiver({db, identity, getGmailClient, enabled})` construye un
receptor sin temporizadores. Solo `enabled: true` y una llamada explícita a
`runOnce()` permiten un ciclo. No existe un servicio instalado ni un worker nuevo.
El pool y su ciclo de vida se suministrarán desde el futuro proceso autorizado;
no se reutiliza ni inicializa el pool privado de Electron y no hay fallback a `.env`.

La identidad explícita exige `DB_HOST: '127.0.0.1'`, `DB_PORT: '5432'`, base
`sian_kaan_reservaciones`, clúster `7632825987452064788`, versión `18.3`, esquema
`017` y `DB_USER` limitado. Son datos de identidad, no credenciales. Cada ciclo
comprueba la identidad efectiva antes de obtener Gmail o escribir eventos.

`loadExistingGmailClient({credentialsPath, tokenPath})` exige rutas absolutas,
ACL existentes seguras, refresh token y alcance exactamente `gmail.readonly`.
Reutiliza OAuth de Google, incluida renovación y persistencia existentes; no abre
consentimiento interactivo si falta autorización. Solo debe llamarse dentro del
proveedor diferido `getGmailClient`, después de una futura autorización de red.
Actualmente no se ha llamado con archivos reales.

Solo se aceptan remitentes con la dirección exacta ya utilizada por el proyecto,
sin coincidencias parciales en dominios o nombres visibles. Esto filtra mensajes;
no sustituye la autenticación del correo por Gmail ni demuestra por sí solo DKIM.
No se inventa un nuevo formato de GetYourGuide: se conserva el parser existente.
Asuntos desconocidos se ignoran; referencias ausentes o PAX inválidos detienen el
ciclo sin avanzar cursor. Datos parciales interpretables quedan pendientes de
revisión humana, nunca se completan inventando valores.

Primer ciclo sin estado: baseline actual, sin importar mensajes anteriores.
Errores dejan el cursor pendiente; un nuevo ciclo deduplica eventos ya escritos.
Cuotas/errores HTTP temporales aplican una espera entre llamadas explícitas;
la recuperación usa además los checkpoints y backoff persistentes existentes.
No hay reintento automático. El bloqueo de concurrencia es por instancia: el
despliegue debe autorizar un único ejecutor de Gmail por cuenta/estado compartido.
Una recuperación puede importar mensajes antiguos: revisarla y acotarla antes de
una prueba real de máximo un evento; no ejecutar indiscriminadamente el ciclo.

Referencias oficiales de Google: [sincronización e historial expirado](https://developers.google.com/workspace/gmail/api/guides/sync)
y [alcance de lectura Gmail](https://developers.google.com/workspace/gmail/api/auth/scopes).
El receptor no inicia OAuth si el proveedor de cliente devuelve un valor ausente
o incompleto: falla antes del sincronizador, sin recurrir a archivos por defecto.

## FareHarbor

Contrato consultado en documentación oficial:

- [Webhooks](https://demo.fareharbor.com/api/external/v1/webhooks): POST con JSON de
  booking, HTTPS, URLs separadas para pruebas/producción y reintentos ante fallos.
- [Seguridad y duplicados](https://developer.fareharbor.com/api/external/v1/home):
  secreto en ruta o consulta; no admite cabeceras personalizadas. No se inventan
  firmas HMAC ni IP fijas. El proveedor permite contrastar el booking con su API
  como protección adicional, condicionada a obtener acceso autorizado.

`createFareHarborReceiver({db, identity, secret, enabled})` crea una aplicación
independiente con una sola entrada POST `/fareharbor/webhook?key=...`. Esta ruta
es una elección local del receptor, que FareHarbor deberá configurar posteriormente.
El secreto debe suministrarse en memoria desde almacenamiento privado autorizado,
con 32–256 caracteres base64url; nunca en Electron, Git, argumentos o logs.

Exige TLS directo (`socket.encrypted`), sin confiar en `X-Forwarded-Proto`; compara
el secreto con hashes y comparación constante antes de leer JSON o consultar PG.
Valida UUID y tipos interpretados, limita JSON a 256 KiB y devuelve errores fijos.
Un esquema optimizado distinto al booking soportado requerirá validar muestras
oficiales antes de ampliarlo. No se llama a la API externa para completar datos.

`createFareHarborTlsServer({tls: {key, cert}, receiver})` construye un servidor
HTTPS con TLS mínimo 1.2, sin llamar a `listen`. Certificado, dominio, puerto y
topología siguen pendientes. No se publica el puerto 3000 ni se abre PostgreSQL.
Un proxy futuro deberá preservar TLS hasta este proceso; HTTP interno reenviado
es rechazado actualmente. No habilitar `trust proxy` para eludir la comprobación.

Solo se devuelve 200 después de persistir y confirmar la transacción, también para
duplicados. Los fallos de persistencia devuelven 503 y `Retry-After: 60`; los
reintentos los realiza FareHarbor. Se conserva el fingerprint actual para cambios
del mismo booking. No se aplican ni aprueban ni archivan eventos automáticamente.
La autenticación por secreto compartido no acredita una firma del proveedor: si
se filtra la URL, debe rotarse con autorización y valorar verificación por API.
El despliegue debe ocultar por completo la consulta de la URL en logs y trazas,
tener límites de tráfico y evitar publicar rutas de administración o reservas.

## Notificaciones y permisos

Los eventos se guardan en la misma tabla del flujo actual. El backend protegido
los detectará mediante GET autenticado `/api/eventos-integracion/resumen` y
`notificacionesIntegracion.service`, sin conexiones del renderer a PG o proveedores.
Se conservan filtros de permisos, cutoff, archivo, última versión por booking de
FareHarbor y restricciones de visibilidad. El frontend consulta cada 60 segundos
cuando está activo; la primera carga establece baseline y no anuncia el histórico.
No se promete un aviso emergente para eventos que esos filtros excluyan.

Las pruebas de desarrollo verifican el resumen usando SQL simulado; no equivalen
a haber observado una llegada real ni una notificación real en Electron. Las
pruebas existentes del frontend se conservan para su comportamiento visual.

## Pendientes antes de activar o probar sobre principal

1. Autorizar un proceso independiente y su forma de supervisión/configuración.
   La composición operativa (pool desde configuración privada, carga de secretos,
   llamada al ciclo o `listen`, cierre y supervisión) no se instala en esta tarea.
   Su conexión debe mantenerse centralizada en la capa de configuración backend,
   sin modificar el canal privado de Electron ni introducir credenciales elevadas.
2. Verificar ACL de todos los archivos privados y disponer de una cuenta de servicio
   PostgreSQL limitada y revisada. Necesita lectura de identidad/esquema, consulta
   e inserción de eventos, consulta de vínculos y estado de sincronización Gmail.
   No se crean roles ni se otorgan permisos en esta tarea.
3. Confirmar de nuevo host, puerto, clúster, estado de las 1,150 reservas y 136 eventos,
   y huellas de los eventos 124/126; son referencias históricas, no conteos actuales
   comprobados aquí. Generar/verificar un respaldo nuevo compatible con 017 sin
   restaurar sobre principal. El script histórico fija IPv6 y pre-017 y no se usa.
4. Gmail: cuenta empresarial correcta, cliente OAuth Google aprobado, token
   `gmail.readonly` válido en almacenamiento privado y permiso para renovar tokens.
   Una nueva autorización Google, si hace falta, requiere aprobación separada.
   Seleccionar una reserva/correo de prueba empresarial sin cobro y el alcance
   exacto del cursor/recovery antes de habilitar red o escrituras.
5. FareHarbor: dominio HTTPS/certificado válidos, entrada independiente autorizada,
   almacenamiento del secreto y confirmación de configuración/esquema de webhook
   con FareHarbor. Solicitar su URL de pruebas y una reserva autorizada; una compañía
   en modo demo no dispara webhooks según su documentación. No crear reservas con
   cobro. Si se decide verificar por API, autorizar app/user keys por separado.
6. Autorizar explícitamente una prueba real acotada a un evento por plataforma;
   comprobar deduplicación y notificaciones con un usuario normal de Electron,
   sin aplicar reservas, cancelar, archivar o alterar los eventos 124/126.

No se ha cumplido ninguno de estos pendientes mediante activación implícita.
WhatsApp permanece deshabilitado. La copia protegida requiere su propio proceso
posterior de revisión de integridad y autorización; no se modifica aquí.

## Verificaciones locales

La suite `backend/__tests__/integrationReceivers.test.js` bloquea el pool de
Electron, OAuth/Gmail reales y conexiones de red externas/puerto 5432. Usa dobles
SQL y HTTP local; la condición de TLS se simula y la fábrica HTTPS se comprueba
sin escuchar un puerto. No prueba un certificado público ni entregas oficiales.
Ejecutarla junto con `helpers/noPostgres.js`, sin usar la suite general conectada
a bases ni herramientas históricas de respaldo/restauración.

Comando de la suite nueva, desde la raíz y sin caché de Jest:

```powershell
node node_modules/jest/bin/jest.js --config '{"testEnvironment":"node","setupFiles":["<rootDir>/backend/__tests__/helpers/noPostgres.js"],"cache":false}' --runInBand --runTestsByPath backend/__tests__/integrationReceivers.test.js
```

Resultado de desarrollo: 371 pruebas aprobadas en 15 suites, incluidas 36 pruebas
de los receptores nuevos, regresiones de Gmail/OAuth/parser, FareHarbor,
persistencia de eventos, notificaciones de servicio/rutas/frontend y políticas de
arranque 03A. No se ejecutaron pruebas de Electron real ni bases reales.
