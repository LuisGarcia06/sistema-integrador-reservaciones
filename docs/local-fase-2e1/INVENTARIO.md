# Inventario previo 2E.1

Extraído de los routers reales; 60 rutas comerciales. Historial consulta Reservaciones. Transportes se administra desde Operaciones. Notificaciones y Centro de Avisos consultan Eventos de Integración. Configuración reúne seis catálogos. No existen endpoints nuevos por esos nombres visuales. Los permisos indicados provienen de guards backend; los filtros selected se aplican además dentro de los servicios.

| Módulo | Método | Ruta existente | Permiso efectivo |
| --- | --- | --- | --- |
| auth | POST | /api/auth/login | Público: credenciales |
| auth | GET | /api/auth/sesion | Sesión propia |
| reservaciones | GET | /api/reservaciones | Administrador / Consulta all / Consulta selected con alcance |
| reservaciones | POST | /api/reservaciones | Administrador |
| reservaciones | PATCH | /api/reservaciones/:id/cancelar | Administrador |
| reservaciones | PATCH | /api/reservaciones/:id/transporte | Administrador |
| reservaciones | PATCH | /api/reservaciones/:id | Administrador |
| reservaciones | GET | /api/reservaciones/:id | Administrador / Consulta all |
| dashboard | GET | /api/dashboard/resumen | Administrador / Consulta all / Consulta selected con alcance |
| operaciones | GET | /api/operaciones/sugeridas | Administrador / Consulta all |
| operaciones | GET | /api/operaciones | Administrador / Consulta all |
| operaciones | POST | /api/operaciones | Administrador |
| operaciones | PATCH | /api/operaciones/:id | Administrador |
| operaciones | GET | /api/operaciones/:id | Administrador / Consulta all |
| transportes | GET | /api/transportes | Administrador / Consulta all |
| transportes | POST | /api/transportes | Administrador |
| transportes | PATCH | /api/transportes/:id | Administrador |
| transportes | GET | /api/transportes/:id | Administrador / Consulta all |
| daily | GET | /api/daily/observaciones | Administrador / Consulta all |
| daily | PUT | /api/daily/observaciones | Administrador |
| daily | GET | /api/daily/operativo | Administrador / Consulta all |
| daily | GET | /api/daily | Administrador / Consulta all |
| bitacora | GET | /api/bitacora | Administrador |
| usuarios | GET | /api/usuarios/roles | Administrador |
| usuarios | GET | /api/usuarios | Administrador |
| usuarios | POST | /api/usuarios | Administrador |
| usuarios | PATCH | /api/usuarios/:id/password | Administrador |
| usuarios | PATCH | /api/usuarios/:id | Administrador |
| usuarios | GET | /api/usuarios/:id | Administrador |
| tours | GET | /api/tours | Administrador / Consulta all / Consulta selected con alcance |
| tours | POST | /api/tours | Administrador |
| tours | PATCH | /api/tours/:id | Administrador |
| tours | GET | /api/tours/:id | Administrador / Consulta all |
| guias | GET | /api/guias | Administrador / Consulta all |
| guias | POST | /api/guias | Administrador |
| guias | PATCH | /api/guias/:id | Administrador |
| guias | GET | /api/guias/:id | Administrador / Consulta all |
| operadores | GET | /api/operadores | Administrador / Consulta all |
| operadores | POST | /api/operadores | Administrador |
| operadores | PATCH | /api/operadores/:id | Administrador |
| operadores | GET | /api/operadores/:id | Administrador / Consulta all |
| vehiculos | GET | /api/vehiculos | Administrador / Consulta all |
| vehiculos | POST | /api/vehiculos | Administrador |
| vehiculos | PATCH | /api/vehiculos/:id | Administrador |
| vehiculos | GET | /api/vehiculos/:id | Administrador / Consulta all |
| paises | GET | /api/paises | Administrador / Consulta all / Consulta selected con alcance |
| paises | POST | /api/paises | Administrador |
| plataformas | GET | /api/plataformas | Administrador / Consulta all / Consulta selected con alcance |
| plataformas | POST | /api/plataformas | Administrador |
| eventosIntegracion | GET | /api/eventos-integracion/centro | Administrador / Consulta all |
| eventosIntegracion | GET | /api/eventos-integracion/centro/:id/historial | Administrador / Consulta all |
| eventosIntegracion | GET | /api/eventos-integracion/resumen | Administrador / Consulta all |
| eventosIntegracion | PATCH | /api/eventos-integracion/:id/archivo | Administrador |
| eventosIntegracion | GET | /api/eventos-integracion | Administrador / Consulta all |
| eventosIntegracion | GET | /api/eventos-integracion/:id/diff | Administrador / Consulta all |
| eventosIntegracion | GET | /api/eventos-integracion/:id | Administrador / Consulta all |
| eventosIntegracion | POST | /api/eventos-integracion/:id/aplicar | Administrador |
| eventosIntegracion | PATCH | /api/eventos-integracion/:id/revision | Administrador |
| integracionesControl | GET | /api/integraciones | Administrador / Consulta all |
| integracionesControl | PATCH | /api/integraciones/:provider | Administrador |

El contrato 020 contiene escritores de Reservaciones, Operaciones, Transportes, Daily, Usuarios, seis catálogos y Eventos de Integración. No todos pertenecen a Reservaciones. Los comandos/precondiciones/recuperación son infraestructura adicional del adaptador. Los controles de sincronización bajo /api/integraciones no forman parte de ese motor. No se habilitan webhooks ni proveedores reales.

| Módulo original | Contrato ya validado | Adaptación requerida | Evidencia previa |
| --- | --- | --- | --- |
| Reservaciones | 020; auditoría histórica | Autenticación023 y protocolo unificado; conservar escritor histórico | 2D.1–3: 38 grupos reales |
| Operaciones / Transportes | 021; auditoría2 | Montaje023, formato por recurso y adaptadores originales | 2D.4–5, 2D.8B.2–3 |
| Daily / PDF | 020/021; auditoría2 | Foto con existencia real, motivo y autorización IPC original | 2D.6, 2D.8B.2–3 |
| Dashboard / Historial / Avisos | Lecturas020 | Matriz GET023 y limitación selected; bloquear acciones externas | 2D.7 |
| Bitácora | Histórico / formato2 / formato3 | Lectura conjunta sin backfill | 2D.8B.3, 2D.9B.3-C |
| Usuarios / Configuración | 023 + auditoría3 | Protocolo unificado y recuperación original | 2D.9B.3-C: 13 escritores / 28 grupos |
| Bootstrap | Mantenimiento local023 | Atestación fresca distinta de creación/prueba fixture | 2D.9B.3-D: 18 grupos; primer HTTP pendiente entonces |

Discrepancia confirmada: auth.js permite Integraciones a selected y el middleware contiene GET /api/integraciones. El alcance aprobado para esta fase limita selected a Dashboard y Reservaciones, con sus catálogos auxiliares. La adaptación unificada deberá denegar ambas entradas sin conceder permisos nuevos.
