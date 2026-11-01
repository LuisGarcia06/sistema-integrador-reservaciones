# Certificación técnica de instalación limpia026

**Alcance: aceptación sintética nueva; no autorización empresarial.**

T0 fue observado a 2026-10-30T02:53:12.846Z, antes de crear el primer Administrador. Base: `ctsk_install_4873eb3064dfa29322b33110`; clúster: `7702288456480004632`. Autoridad de prueba nueva: `be6b9346-68f1-408f-9ed9-83709fffceff`. No se heredaron autorizaciones ni datos del ensayo anterior. La certificación de2E.6-clean permanece intacta.

| Tabla | Filas T0 |
|---|---:|
| `ctsk_refs025.manual_refs` | 0 |
| `ctsk_sync024.admin_receipts` | 0 |
| `ctsk_sync024.booking_state` | 0 |
| `public.bitacora` | 0 |
| `public.comandos_idempotentes` | 0 |
| `public.daily_observaciones` | 0 |
| `public.equivalencias_tours_externos` | 0 |
| `public.eventos_integracion` | 0 |
| `public.guias` | 0 |
| `public.inicializacion_sistema` | 0 |
| `public.integracion_sync_estado` | 4 |
| `public.operaciones_tour` | 0 |
| `public.operadores` | 0 |
| `public.paises` | 1 |
| `public.plataformas` | 4 |
| `public.reservaciones` | 0 |
| `public.reservas_integracion_link` | 0 |
| `public.roles` | 2 |
| `public.tours` | 0 |
| `public.transportes_operacion` | 0 |
| `public.usuario_plataformas_visibles` | 0 |
| `public.usuarios` | 0 |
| `public.vehiculos` | 0 |

Contenido técnico exacto: roles Administrador/Consulta sin cuentas; país No especificado; FareHarbor/GetYourGuide/WhatsApp Business/Externa; cuatro controles nuevos de publicación/automation024 desactivados. Los sentinelas0/not-applicable-024 no son cursores externos. No hay cortes, eventos, vínculos, referencias ni estados importados. Todas las demás tablas contienen0filas. El esquema, funciones, triggers y permisos023/024/025 fueron comprobados con los verificadores exactos.

Después de T0 se creó un Administrador con contraseña aleatoria capturada únicamente para aceptación, se probó el primer login con Electron original, catálogos, reservaciones, referencias humanas y Daily/PDF. Se verificaron límites24/12, roles, revocación, idempotencia y rollback integral ante fallo de auditoría. T1 devuelve clean=false con: NOT_EMPTY:ctsk_refs025.manual_refs, NOT_EMPTY:public.bitacora, NOT_EMPTY:public.comandos_idempotentes, NOT_EMPTY:public.guias, NOT_EMPTY:public.inicializacion_sistema, NOT_EMPTY:public.operaciones_tour, NOT_EMPTY:public.operadores, NOT_EMPTY:public.reservaciones, NOT_EMPTY:public.tours, NOT_EMPTY:public.transportes_operacion, NOT_EMPTY:public.usuarios, NOT_EMPTY:public.vehiculos. **T1 no es una base de distribución ni una plantilla.** No se borró ningún registro para producir esta certificación.

Respaldo/restauración oficial en otro clúster nuevo: filas, secuencias y restricciones exactas; nueva instalación/época/JWT; token anterior rechazado y recibos idempotentes conservados. FareHarbor/GetYourGuide siguen apagados, sin corte/cursor/vínculos.

Paquetes separados verificados, sin datos de aceptación, dumps, fixtures, drivers, informes, capturas, configuración privada ni secretos. Cliente: 53archivos, SHA256 ZIP `456bf37b5cc106ec0c6672ada58ec6bd08d9557d173381bc7f3b5b8e5ebf6c0c`. Servidor: 1024archivos, SHA256 ZIP `98bfa757b7ebbfb2368e69b60cafa8869bee0577c5582aeb0838f5a92d96c091`. Inventario por archivo y procedencia en [candidate-08/build-report.json](candidate-08/build-report.json); hashes de archivos operativos dentro de cada release-inventory.json. Las evidencias están fuera de los ZIP.

Verificaciones: 1121pruebas Jest en40suites aisladas con bloqueo de conexiones a bases existentes; 15grupos PostgreSQL/HTTPS/Electron; 4sesiones Electron. Cierre independiente: 13clústeres propios detenidos, 32puertos observados sin listeners y cero procesos propios.

**No certifica una instalación empresarial lista.** Pendientes: aprobación nominal de Community Tours, contrato/autoridad de producción, firma del ejecutable/verificador inicial, custodia/rotación/revocación de claves, certificados y diseño LAN, distribución y aceptación en dos equipos. No se instalaron equipos, abrieron puertos LAN, modificaron certificados/firewall/servicios ni tocaron bases empresariales.
