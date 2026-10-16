# Sistema Integrador de Reservaciones

Aplicacion de escritorio para Community Tours Sian Ka'an. Centraliza la captura, consulta, organizacion operativa, Daily y auditoria de reservaciones en una arquitectura local con Electron, frontend web, API REST Node.js/Express y PostgreSQL.

## Estado Actual

El sistema ya cuenta con modulos funcionales para autenticacion, Dashboard operativo, reservaciones, operaciones por grupos, transportes, Daily, historial, bitacora, usuarios y catalogos operativos. El codigo incluye recepcion y procesamiento de eventos FareHarbor y sincronizacion GetYourGuide mediante Gmail. WhatsApp Cloud API no se utilizara: su codigo se conserva deshabilitado, sin rutas montadas ni envios a Meta. Una variable de entorno no puede reactivarlo. Las credenciales y la configuracion real se mantienen fuera de Git.

El instalador existente en `dist/` puede estar desactualizado respecto al codigo fuente actual. Para validacion tecnica se debe ejecutar el proyecto desde el repositorio hasta generar un nuevo build.

## Stack

- Electron para la aplicacion de escritorio.
- HTML, CSS y JavaScript sin framework de frontend.
- Node.js y Express para la API.
- PostgreSQL con `pg`, sin ORM.
- `bcryptjs` para contrasenas y `jsonwebtoken` para autenticacion.

## Estructura

- `backend/`: API REST, controladores, servicios, validadores, middleware y conexion PostgreSQL.
- `frontend/`: interfaz web servida por el backend en `/app`.
- `electron/`: contenedor de escritorio, preload y exportacion PDF del Daily.
- `database/`: esquema, seeds y migraciones SQL.
- `docs/`: documentacion historica y documentacion tecnica generada.
- `scripts/`: utilidades documentales y operativas del repositorio.

## Modulos Implementados

- Login con roles Administrador y Consulta.
- Dashboard real desde `GET /api/dashboard/resumen`.
- Reservaciones con creacion, edicion, cancelacion, busqueda, filtros, turno explicito y asignacion a transporte.
- Operaciones por fecha, tour, turno y grupo.
- Transportes por grupo con vehiculo, operador y observaciones.
- Daily operativo con impresion y exportacion PDF desde Electron.
- Historial y bitacora consultables.
- Catalogos de tours, paises, plataformas, guias, operadores y vehiculos.
- Gestion de usuarios para Administrador.

## Roles

### Administrador

Puede consultar, crear, modificar y cancelar reservaciones; preparar operaciones y transportes; consultar Daily, historial y bitacora; administrar usuarios y catalogos.

### Consulta

Puede iniciar sesion y consultar informacion operativa permitida, sin modificar datos.

## Reglas Operativas Vigentes

- El turno de la reservacion es explicito: `Mañana` o `Tarde`; no se deriva por hora.
- Una operacion representa un grupo y se identifica por `fecha + tour + turno + numero_grupo`.
- Solo existen grupos 1 y 2.
- Cada grupo admite hasta 12 PAX activos.
- Un tour en una fecha y turno admite hasta 24 PAX activos.
- Cada grupo puede tener como maximo un transporte.
- Una reservacion puede quedar temporalmente sin turno solo por compatibilidad con datos heredados.
- Las reservaciones canceladas o completadas no cuentan para capacidad operativa.
- Las sugerencias de operacion ayudan a preparar grupos, pero no asignan clientes automaticamente.

## API Principal

Todas las rutas usan el prefijo `/api`:

- `/api/auth`
- `/api/dashboard`
- `/api/reservaciones`
- `/api/operaciones`
- `/api/transportes`
- `/api/daily`
- `/api/bitacora`
- `/api/usuarios`
- `/api/tours`
- `/api/paises`
- `/api/plataformas`
- `/api/guias`
- `/api/operadores`
- `/api/vehiculos`

## Ejecucion Local

1. Instalar dependencias:

```bash
npm install
```

2. Configurar variables de entorno en `.env` usando `.env.example` como referencia.

3. Crear la base PostgreSQL `sian_kaan_reservaciones` y aplicar `database/schema.sql`, `database/seeds.sql` y las migraciones necesarias.

Migraciones documentadas:

- `001_catalogos_operativos.sql`
- `002_operaciones_tour.sql`
- `003_transportes_operacion.sql`
- `004_ampliar_reservaciones.sql`
- `005_grupos_operativos.sql`
- `006_un_transporte_por_grupo.sql`
- `007_turno_reservaciones.sql`

4. Ejecutar backend y frontend servido por Express:

```bash
npm start
```

5. Ejecutar la aplicacion de escritorio:

```bash
npm run desktop
```

## Scripts Disponibles

- `npm start`: inicia `backend/server.js`.
- `npm run desktop`: abre Electron.
- `npm run pack:win`: empaqueta una carpeta Windows sin instalador final.
- `npm run dist:win`: genera instalador Windows con `electron-builder`.

`npm test` ejecuta Jest e incluye pruebas que requieren una base PostgreSQL de pruebas y pueden modificar sus datos. Para verificaciones sin PostgreSQL, seleccionar explicitamente suites aisladas y cargar `backend/__tests__/helpers/noPostgres.js`; no ejecutar la suite `backend/__tests__/api.test.js` contra una base existente.

## Pendientes de Pruebas Reales

- Cargar catalogos reales.
- Validar reservaciones reales o anonimizadas.
- Clasificar turnos historicos donde existan datos sin turno.
- Probar Daily con casos reales.
- Ejecutar aceptacion con usuarios.
- Reconstruir installer final despues del cierre y pruebas reales.

## Documentacion

Alcance de reservaciones por plataforma: [ACCESS-SCOPE-02](docs/ACCESS-SCOPE-02.md)
y [ACCESS-SCOPE-03A](docs/ACCESS-SCOPE-03A.md). La administracion y la interfaz
se documentan en [ACCESS-SCOPE-03B](docs/ACCESS-SCOPE-03B.md). El estado mas reciente
registrado en [PROD-ACCESS-02B](docs/PROD-ACCESS-02B.md) documenta la aplicacion
autorizada de 016 y pruebas locales en principal. Ese informe es evidencia de una
fase anterior; GITHUB-01 no abre conexiones ni verifica o modifica bases de datos.
Una base nueva creada con schema.sql ya incluye ACCESS-SCOPE y no requiere volver
a ejecutar 016. La aceptacion y la distribucion productiva siguen pendientes.

La migracion y las API fueron verificadas en PostgreSQL independiente con
datos sinteticos: [ACCESS-SCOPE-04A](docs/ACCESS-SCOPE-04A.md). La base de la
empresa no fue modificada. La validacion integral con Electron, Express y PostgreSQL
reales paso 57 verificaciones en [ACCESS-SCOPE-04B](docs/ACCESS-SCOPE-04B.md),
con correcciones de autorizacion de impresion/PDF. Ese informe conserva los
pendientes de su fase; el avance posterior en principal esta en PROD-ACCESS-02B.
Instalacion real y aceptacion funcional siguen pendientes.

El payload Windows x64 extraido del instalador paso 64 verificaciones reales y
617 regresiones en [ACCESS-SCOPE-05A](docs/ACCESS-SCOPE-05A.md). Se corrigio el
manejo de errores de conexiones PostgreSQL inactivas y se excluyeron pruebas
del paquete. Instalacion, actualizacion, desinstalacion y aceptacion humana
siguen pendientes: [matriz de aceptacion](docs/ACCESS-SCOPE-05A-aceptacion.md).
El instalador de prueba no esta firmado ni declarado apto para produccion.

Los arranques protegidos de desarrollo se documentan en [DEV-DB-02](docs/DEV-DB-02.md),
[DEV-DB-03](docs/DEV-DB-03.md) y [su correccion](docs/DEV-DB-03-FIX.md).
La preparacion y los ensayos previos a principal se conservan en
[PROD-ACCESS-01](docs/PROD-ACCESS-01.md) y [PROD-ACCESS-02A](docs/PROD-ACCESS-02A.md).
Los informes anteriores describen el estado de cada fase, no el estado actual
de una base que se conecte posteriormente.

## Publicacion segura en GitHub

La revision inicial esta en [GITHUB-01](docs/GITHUB-01.md) y la continuacion en
[GITHUB-02](docs/GITHUB-02.md). En GITHUB-02 se deshabilito WhatsApp en codigo y
se vacio exclusivamente WHATSAPP_VERIFY_TOKEN del .env local. Para GITHUB-03,
el usuario confirmo que elimino la aplicacion de Meta for Developers; esa
eliminacion se conoce por su declaracion, sin verificacion directa de Codex.
El codigo permanece deshabilitado y se conserva el historial existente.
La auditoria final, las pruebas y el resultado de publicacion estan en
[GITHUB-03](docs/GITHUB-03.md). Los informes anteriores conservan los resultados
y bloqueos de cada fase. El valor del token no se reproduce en la documentacion.

`.gitignore` excluye variables de entorno reales, `secrets/`, `.access-scope-lab/`,
respaldos PostgreSQL, credenciales DPAPI, dependencias y binarios generados.
Solo `.env.example`, con valores vacios o de ejemplo, debe versionarse.
Estas exclusiones no retiran archivos ni secretos de commits anteriores.

La documentacion historica se conserva en `docs/`. Para generar la arquitectura tecnica implementada actualizada:

```bash
python scripts/generar_documento_arquitectura_implementada.py
```

El script genera un archivo versionado nuevo y no sobrescribe documentos historicos.
