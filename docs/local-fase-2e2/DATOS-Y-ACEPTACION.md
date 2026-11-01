# Datos y aceptación posterior

No se ha ejecutado limpieza empresarial ni se considera descartable ningún registro actual. Una instalación limpia conserva estructura, migraciones verificadas, los roles funcionales Administrador/Consulta, privilegios técnicos y bootstrap. Usuarios, tours, países, plataformas, vehículos, operadores, guías y demás configuración comercial definitiva deben capturarse o importarse mediante una decisión revisada de la empresa. Las cuentas y catálogos sintéticos de los ensayos no son una plantilla empresarial.

Antes de una limpieza futura se necesitarán: inventario y clasificación por tabla, responsables de los datos, respaldo completo y custodia de secretos, restauración ensayada, revisión de referencias externas y auditoría, lista explícita de registros afectados, autorización humana y plan de reversión. No se incluye una orden SQL de limpieza ni una herramienta que la ejecute.

## Matriz de aceptación en los dos equipos

Estado de toda la matriz: **pendiente de ejecución posterior por Community Tours**. Las pruebas locales automatizadas se registran aparte y no equivalen a aceptación empresarial ni a conectividad LAN real.

| Caso | Comprobación automatizada local | Revisión posterior del personal |
| --- | --- | --- |
| Instalación y servidor autorizado | Identidad firmada, origen y configuración separados | Identificar físicamente equipo servidor/cliente y cuentas Windows autorizadas |
| Login y roles | JWT, permisos, Consulta all/selected/vacío | Acceso de cada cuenta definitiva y terminología de permisos |
| Reservaciones | Altas, edición, búsquedas y cancelación originales | Nombres, teléfonos, hoteles, monedas, campos y códigos de uso real |
| Cupo | 24 admite;25 rechaza; concurrencia, niños y canceladas | Revisar ejemplos de turnos/grupos y sobrecupos históricos sin repararlos |
| Operaciones | Grupos1/2 y guía | Recorrido de planificación por fecha y turno |
| Transportes | Vehículo/operador,12 y capacidad real, mínimos | Validar asignación y organización con personal operativo |
| Daily y PDF | Datos por fecha/tour/transporte y PDF real | Logotipo, legibilidad, observaciones e importes del documento |
| Impresión | Interceptada; cero trabajos físicos | Impresora, tamaño de papel y prueba física únicamente con autorización posterior |
| Historial y Bitácora | Lectura histórica y formatos de auditoría | Comprobar que cambios y responsables son comprensibles |
| Usuarios/Configuración | Formularios originales, roles y reset | Alta de catálogos y cuentas definitivas; procedimiento de baja |
| Avisos | Eventos sintéticos y lectura del centro/campana | Revisar prioridades y textos; integraciones reales siguen sin activar |
| Revocación | Reset invalida sesiones, sin secretos persistidos | Validar cierre de sesiones en ambas computadoras |
| Desconexión y reinicio | Identidad/reconexión, respuesta perdida y recuperación GET | Probar cable/Wi-Fi y reinicio físico autorizados, sin reenviar un resultado incierto |
| Respaldo | pg_dump real, integridad y ubicación privada | Responsable, retención, custodia, copias externas y alertas |
| Restauración | Otro clúster, aplicación/PDF y rechazo de JWT anteriores | Medir RTO/RPO acordados y validar datos recuperados |
| Seguridad de red | Sólo simulación127.0.0.1 | HTTPS, certificado/nombre, firewall e inaccesibilidad de PostgreSQL desde cliente |

Registrar para cada caso equipo, versión, cuenta/rol, fecha, resultado, evidencia, incidencia, responsable y aprobación. No rellenar los resultados manuales como aprobados por anticipado.

## Preparación de distribución

El empaquetado actual `electron-builder` incluye backend y dependencias; no representa todavía un paquete cliente empresarial independiente. La siguiente etapa deberá definir dos entregables revisados, sus listas de archivos, actualización/rollback y ubicación de secretos, comprobando que el cliente no incorpore configuración de servidor, claves privadas, dumps, fixtures ni herramientas de inyección. En esta fase no se ejecutan `pack:win` ni `dist:win`, ni se instalan servicios.

Para conectar físicamente los equipos faltan dirección/nombre estable, puerto HTTPS, certificados y confianza, reglas de acceso específicas, cuentas Windows separadas, arranque/detención del servidor, protección del almacenamiento, respaldo externo y aceptación del personal. WhatsApp continúa manual; FareHarbor/GetYourGuide permanecen inactivos hasta documentación y acceso autorizados. Ningún manifiesto o clave sintéticos se reutilizará para esa instalación.
