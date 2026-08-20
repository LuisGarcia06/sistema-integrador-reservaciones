# AGENTS.md

## Proyecto

Sistema Integrador de Reservaciones para Community Tours Sian Ka'an.

Aplicación de escritorio para centralizar y administrar reservaciones provenientes de FareHarbor, GetYourGuide, WhatsApp Business y reservaciones externas.

---

## Stack tecnológico obligatorio

### Desktop

* Electron

### Frontend

* HTML5
* CSS3
* JavaScript

### Backend

* Node.js
* Express

### Base de datos

* PostgreSQL

### Diseño UI

* Google Stitch es la referencia visual principal.

### Control de versiones

* Git

No sustituir estas tecnologías sin autorización.

---

## Arquitectura

El sistema utiliza arquitectura por capas.

```text
Electron
   │
   ▼
Frontend
HTML + CSS + JavaScript
   │
   │ HTTP / REST
   ▼
Node.js + Express
   │
   ├── Routes
   ├── Controllers
   ├── Services
   ├── Middleware
   └── Data Access
   │
   ▼
PostgreSQL
```

El frontend nunca debe conectarse directamente a PostgreSQL.

Toda operación de datos debe pasar por el backend.

---

## Estructura del proyecto

```text
sistema-integrador-reservaciones/
│
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   └── server.js
│
├── database/
│   ├── schema.sql
│   └── seeds.sql
│
├── electron/
│
├── frontend/
│
├── .env
├── .env.example
├── .gitignore
├── AGENTS.md
├── package.json
└── README.md
```

No reorganizar innecesariamente la estructura.

---

## Base de datos

Base de datos:

```text
sian_kaan_reservaciones
```

Tablas:

* roles
* usuarios
* tours
* paises
* plataformas
* reservaciones
* bitacora

### Relaciones

```text
roles 1:N usuarios

usuarios 1:N bitacora

tours 1:N reservaciones

paises 1:N reservaciones

plataformas 1:N reservaciones

reservaciones 1:N bitacora
```

No modificar las relaciones ni agregar nuevas tablas o campos sin autorización.

---

## Tabla reservaciones

La tabla contiene:

* id_reservacion
* codigo
* fecha
* id_tour
* id_pais
* id_plataforma
* nombre_cliente
* habitacion
* pax
* ninos
* pickup_place
* pickup_time
* precio_total
* deposito
* saldo
* tipo_cambio
* metodo_pago
* estado
* fecha_registro
* ultima_actualizacion

No agregar columnas nuevas sin aprobación.

---

## Usuarios y roles

Existen inicialmente dos roles funcionales.

### Administrador / Reservaciones

Puede:

* Iniciar sesión.
* Consultar reservaciones.
* Crear reservaciones.
* Modificar reservaciones.
* Cancelar reservaciones.
* Consultar historial.
* Consultar bitácora.
* Generar Daily.
* Exportar Daily a PDF.
* Imprimir Daily.
* Consultar notificaciones.

### Consulta

Puede:

* Iniciar sesión.
* Consultar reservaciones.
* Buscar reservaciones.
* Consultar historial.

No puede modificar información.

Los permisos deben validarse siempre en el backend.

---

## Bitácora

Las modificaciones relevantes de reservaciones deben registrar:

* Usuario.
* Reservación.
* Acción.
* Descripción.
* Fecha y hora.

Las operaciones de modificación y registro de auditoría deberán mantenerse consistentes.

---

## Seguridad

Nunca:

* Guardar contraseñas reales en texto plano.
* Guardar credenciales dentro del código fuente.
* Subir `.env` a Git.
* Exponer credenciales de PostgreSQL al frontend.
* Concatenar directamente entradas del usuario dentro de SQL.
* Confiar solamente en validaciones del frontend.

Utilizar variables de entorno para credenciales.

Las consultas SQL deberán ser parametrizadas.

---

## PostgreSQL

La conexión existente utiliza el paquete:

```text
pg
```

No introducir un ORM sin autorización.

La conexión debe centralizarse en:

```text
backend/config/database.js
```

---

## Backend

Mantener separación de responsabilidades.

### routes

Definen las rutas HTTP.

### controllers

Reciben solicitudes y respuestas HTTP.

### services

Contienen lógica de negocio.

### middleware

Autenticación, autorización, validación y manejo de errores.

### config

Configuraciones generales como conexión PostgreSQL.

No colocar toda la lógica dentro de `server.js`.

---

## API

Las rutas REST utilizarán el prefijo:

```text
/api
```

Ejemplos:

```text
/api/reservaciones
/api/usuarios
/api/tours
/api/paises
/api/plataformas
/api/bitacora
/api/auth
/api/daily
```

Mantener nombres consistentes.

---

## Frontend

Utilizar:

* HTML
* CSS
* JavaScript

No introducir React, Angular, Vue u otro framework sin autorización.

Las interfaces de Google Stitch son la referencia visual.

No rediseñar pantallas sin necesidad.

---

## Electron

Electron será el contenedor de escritorio.

No implementar acceso directo a PostgreSQL desde Electron o desde el frontend.

La comunicación de datos debe pasar por el backend.

---

## Integraciones externas

Plataformas contempladas:

* FareHarbor
* GetYourGuide
* WhatsApp Business
* Reservaciones externas

No inventar:

* endpoints
* tokens
* webhooks
* credenciales
* parámetros
* respuestas

Las integraciones solo deben implementarse cuando exista documentación y acceso autorizado.

---

## Decisiones todavía pendientes

No tomar automáticamente decisiones sobre:

* JWT o sesiones.
* Librería para PDF.
* Estrategia de sincronización de FareHarbor.
* Estrategia de sincronización de GetYourGuide.
* Integración técnica de WhatsApp Business.
* Estrategia final de empaquetado de Electron.

Si una tarea depende de estas decisiones, indicarlo antes de introducir cambios importantes.

---

## Forma de trabajo para Codex

Para cada tarea:

1. Leer primero los archivos relacionados.
2. Entender la implementación existente.
3. Identificar los archivos que necesitan cambios.
4. Hacer solo los cambios necesarios.
5. Respetar la arquitectura definida.
6. No modificar archivos no relacionados.
7. Ejecutar pruebas o verificaciones cuando existan.
8. Informar los archivos modificados.
9. Explicar brevemente lo implementado.
10. Informar errores o decisiones pendientes.

---

## Desarrollo incremental

Trabajar módulo por módulo.

Orden previsto:

```text
Base de datos
     ↓
Backend base
     ↓
API Reservaciones
     ↓
Autenticación y roles
     ↓
Frontend
     ↓
Electron
     ↓
Bitácora
     ↓
Historial
     ↓
Daily
     ↓
Notificaciones
     ↓
Integraciones
     ↓
Pruebas
     ↓
Distribución
```

No implementar todo el sistema en una sola tarea.

---

## Regla principal

Codex debe actuar como asistente de implementación.

No debe cambiar silenciosamente:

* arquitectura;
* modelo de datos;
* tecnologías;
* roles;
* requerimientos;
* seguridad;
* integraciones.

Si encuentra una ambigüedad estructural, deberá señalarla antes de realizar un cambio importante.
