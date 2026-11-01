# Certificación técnica del ensayo de instalación limpia — requisito2E.6

Fecha de emisión: 2026-10-30T01:33:10.857Z. **T0 limpio comprobado en laboratorio. Certificación/entrega empresarial NO aprobadas.** No se ha aprovisionado empresa ni se declaran listos los paquetes actuales.

El requisito queda incorporado en [FASE-2E6-REQUISITOS.md](../FASE-2E6-REQUISITOS.md) y en el [procedimiento de instalación empresarial limpia](../INSTALACION-EMPRESARIAL-LIMPIA.md). Este documento acredita un ensayo, no autoriza reetiquetar sus constancias como instalación empresarial.

## 1. Identidad y estructura comprobadas

Clúster nuevo 7702265402696259672, base nueva ctsk_standalone_c9a31fb7d687_test, únicamente127.0.0.1. Directorio privado: C:/Users/luisg/AppData/Local/ctsk-standalone-6eca513ca1a4. PostgreSQL18.3, esquema base/018 y contratos019–025 vigentes para laboratorio; bootstrap vacío, relaciones/restricciones/permisos y extensiones verificados antes de T0. Migraciones, seeds y contratos anteriores sin modificación. Para empresa sigue faltando aprobación del contrato definitivo; no se inventa esa autorización.

La nueva opción cleanInstallation sólo se admite junto con empty-bootstrap-lab y directorio nuevo vacío. Reutiliza seeds.sql existente fijado por SHA256 f68e7db005eebfda50fd25bd5fc356469b88af9422176a0a809d604a48fa246c; no ejecuta la inserción anterior de descripciones de roles sintéticos ni crea cuentas de prueba iniciales. Los otros modos mantienen su camino previo.

## 2. Inventario y conteos T0

Comprobación: 2026-10-30T01:23:50.153Z. Son conteos **anteriores al bootstrap y a los datos de aceptación**. Cero usuarios, reservas y filas comerciales. La comprobación cuenta registros y revisa contenido técnico; no se limita a buscar palabras como ficticio/SYN.

| Tabla | Filas T0 | Regla |
| --- | ---: | --- |
| ctsk_refs025.manual_refs | 0 | Debe estar vacía |
| ctsk_sync024.admin_receipts | 0 | Debe estar vacía |
| ctsk_sync024.booking_state | 0 | Debe estar vacía |
| public.bitacora | 0 | Debe estar vacía |
| public.comandos_idempotentes | 0 | Debe estar vacía |
| public.daily_observaciones | 0 | Debe estar vacía |
| public.equivalencias_tours_externos | 0 | Debe estar vacía |
| public.eventos_integracion | 0 | Debe estar vacía |
| public.guias | 0 | Debe estar vacía |
| public.inicializacion_sistema | 0 | Debe estar vacía |
| public.integracion_sync_estado | 4 | Contenido técnico revisado |
| public.operaciones_tour | 0 | Debe estar vacía |
| public.operadores | 0 | Debe estar vacía |
| public.paises | 1 | Contenido técnico revisado |
| public.plataformas | 4 | Contenido técnico revisado |
| public.reservaciones | 0 | Debe estar vacía |
| public.reservas_integracion_link | 0 | Debe estar vacía |
| public.roles | 2 | Contenido técnico revisado |
| public.tours | 0 | Debe estar vacía |
| public.transportes_operacion | 0 | Debe estar vacía |
| public.usuario_plataformas_visibles | 0 | Debe estar vacía |
| public.usuarios | 0 | Debe estar vacía |
| public.vehiculos | 0 | Debe estar vacía |

Excepciones técnicas cerradas: roles Administrador/Consulta sin cuentas; país No especificado; plataformas Externa/FareHarbor/GetYourGuide/WhatsApp Business; cuatro controles iniciales de publicación/automation024. Sus valores exactos están en verification.json, initial.state. Tabla/esquema extra, catálogo alterado o cualquier fila comercial producen rechazo.

## 3. Integraciones inicialmente apagadas

Los4controles se generan **de nuevo por las migraciones**, sin restaurar/copiar filas de otro laboratorio. Publicación y automatización false, sin first_activation_at, confirmed_through, responsables/autorización, ejecución, pending_window, errores/backoff/recovery, cursor externo, eventos o vínculos. Los contratos actuales requieren last_history_id NOT NULL:0(publicación) y not-applicable-024(automation024) son sentinelas técnicos existentes, no un HistoryID de proveedor ni un cursor recuperado. Se identifican como tales; no se afirma que la tabla esté vacía. Su representación empresarial definitiva requiere revisión/aprobación propia.

Sólo en esta base recién creada, antes de usuarios y datos, initializeTechnicalState establece los indicadores de publicación en false. Rechaza una base con datos/cursor/historia y no limpia registros. La repetición sin cambios no escribe. No se leyeron credenciales de proveedores ni se consultaron APIs reales.

## 4. Primer acceso y altas posteriores — T1 separado

Después de certificar T0 se creó un Administrador mediante bootstrap legítimo con contraseña aleatoria de aceptación capturada en memoria y almacenada como hash; ninguna cuenta/contraseña predeterminada ni test-user.json. Primer login desde Electron original 43.4.1, renderer aislado y sin pg, antes del loginHTTP del coordinador.

La API original aceptó4catálogos y1reservación con validaciones/comandos/auditoría normales. Todos esos valores son datos de aceptación T1, exclusivamente de la base de ensayo: no son semillas ni datos reales de Community Tours. No se usaron datos reales. Se preservaron las filas y no se exportó un dump.

El verificador volvió a ejecutarse y devolvió clean:false (NOT_EMPTY:public.bitacora, NOT_EMPTY:public.comandos_idempotentes, NOT_EMPTY:public.guias, NOT_EMPTY:public.inicializacion_sistema, NOT_EMPTY:public.operadores, NOT_EMPTY:public.reservaciones, NOT_EMPTY:public.tours, NOT_EMPTY:public.usuarios, NOT_EMPTY:public.vehiculos). Por tanto, **la base de ensayo actualmente poblada no es una plantilla distribuible**, aunque su estado inicial T0 haya sido limpio. No se borra T1 para simular limpieza. El bootstrap de empresa deberá crear su propio primer Administrador, y los catálogos/clientes reales se cargarán sólo con autorización independiente.

## 5. Verificación de paquetes

Inspección sólo en lectura, sin extracción/ejecución:

- client-experimental.zip: 52 archivos, 1 hallazgos; NO apto para entrega empresarial. SHA256 54edc881f6510d5a2579c6bfe55b8ab278260cb574b661c030342177373584fc.
- server-candidate-lab.zip: 2918 archivos, 40 hallazgos; NO apto para entrega empresarial. SHA256 2e13833cb4c25525be107bb0f87174bc8d9a731136ff18ff628d259e99f839a2.

Cliente: contrato synthetic-client023-only. Servidor: perfil/contratos de ensayo y fuentes de laboratorio/instrumentación requeridas por su huella023. No se promueven estos ZIP a producción. El auditor devolvió código2 y bloqueó entrega; el resultado existe en package-gate-execution.json. No se generaron ZIP empresariales nuevos ni se alteraron los anteriores.

El entregable futuro deberá tener manifiesto/cierre de dependencias y firma empresariales aprobados, sin dumps, fixtures, datos de ensayo, pruebas/drivers/probes, reportes/capturas, secretos, tokens o configuración privada. Las evidencias quedan en docs/local-fase-2e6-clean y fuera del paquete. La auditoría actual no inventa un formato de aprobación empresarial inexistente.

## 6. Resultados automáticos y aislamiento

1102/1102 pruebas Jest, 39 suites aprobadas, incluyendo negativos por cada tabla comercial, cursores/actividad y catálogos no autorizados. Corredor real PostgreSQL/HTTP/Electron: 6 grupos aprobados. Bootstrap/esquema/privilegios antes de T0, verificador inicial, rechazos de contaminación, primer acceso, altas T1 y rechazo de plantilla poblada.

No conexiones a sian_kaan_reservaciones ni sian_kaan_reservaciones_dev, ni limpieza/modificación de bases existentes, integración real, LAN/firewall/certificados, servicios/tareas empresariales o impresión física. Sólo clúster/cliente nuevos con ACL y puertos propios. Los secretos del ensayo no aparecen en los reportes/logs públicos. La certificación no acredita conectividad empresarial ni datos reales.

## 7. Preservación y cierre

closure.json: cero procesos propios, listeners propios y postmaster.pid. Clúster y datos T1 se conservan detenidos; ningún laboratorio anterior fue eliminado ni respaldo modificado. Hashes de ZIP anteriores coinciden con sus inventarios2E.5. Evidencias previas intactas.

5436 archivos previos inventariados. Modificado con respaldo selectivoSHA idéntico al original: scripts/standaloneDev.cjs. Nuevos:

- backend/config/cleanInstallationContract.js
- backend/services/cleanInstallationCertification.service.js
- backend/__tests__/cleanInstallationCertification.test.js
- docs/FASE-2E6-REQUISITOS.md
- docs/INSTALACION-EMPRESARIAL-LIMPIA.md
- scripts/cleanInstallationLab.cjs
- scripts/CleanInstallationLab.ps1

Originales en originals/; inventario en source-verification.json y sello final en evidence-hashes.json. Reversión selectiva del único aprovisionador: verificar SHAposterior y reponer sólo su original si no hay cambios posteriores. Conservar los datos/evidencias y no usar reset/clean ni borrados masivos.

## 8. Condiciones para emitir certificación empresarial

Aprobar e implementar contrato/migraciones empresariales definitivos y perfil de arranque sin dependencias de laboratorio; preparar paquetes operativos independientes y auditarlos con autoridad/manifiesto aprobados. Aprovisionar entonces un destino empresarial nuevo autorizado, ejecutar T0, bootstrap propio/primer acceso y aceptación. Carga real independiente con procedencia, dry-run, mapeos revisados, autorización nominal, cupos/referencias y auditoría por backend; nunca completar faltantes con valores inventados.

**La ausencia inicial de datos ficticios en este ensayo no declara lista la instalación empresarial.** Los bloqueos de paquetes y del hitoB siguen vigentes. No se ha ejecutado aprovisionamiento empresarial real.
