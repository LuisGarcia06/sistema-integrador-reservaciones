# Sistema Integrador de Reservaciones

Aplicacion de escritorio para Community Tours Sian Ka'an. Centraliza la captura, consulta, organizacion operativa, Daily y auditoria de reservaciones en una arquitectura local con Electron, frontend web, API REST Node.js/Express y PostgreSQL.

## Estado Actual

El sistema ya cuenta con modulos funcionales para autenticacion, Dashboard operativo, reservaciones, operaciones por grupos, transportes, Daily, historial, bitacora, usuarios y catalogos operativos. Las integraciones con FareHarbor, GetYourGuide y WhatsApp Business siguen pendientes de documentacion, credenciales y autorizacion tecnica.

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

No hay script de pruebas automatizadas configurado actualmente.

## Pendientes de Pruebas Reales

- Cargar catalogos reales.
- Validar reservaciones reales o anonimizadas.
- Clasificar turnos historicos donde existan datos sin turno.
- Probar Daily con casos reales.
- Ejecutar aceptacion con usuarios.
- Reconstruir installer final despues del cierre y pruebas reales.

## Documentacion

La documentacion historica se conserva en `docs/`. Para generar la arquitectura tecnica implementada actualizada:

```bash
python scripts/generar_documento_arquitectura_implementada.py
```

El script genera un archivo versionado nuevo y no sobrescribe documentos historicos.
