# Entrega 2E.7 — candidatos de instalación Windows

30 de octubre de 2026. **Candidato recomendado: 2e7-candidate-03. Sin firma empresarial. No instalar en Community Tours.**

## Resultado

| Componente | Archivo en `dist/windows-2e7/2e7-candidate-03` | Bytes | Archivos de payload |
|---|---|---:|---:|
| Servidor + Node.js | `CommunityTours-server-2e7-candidate-03-win-x64-UNSIGNED.exe` | 34,100,073 | 1,035 |
| Cliente + Electron completo | `CommunityTours-client-2e7-candidate-03-win-x64-UNSIGNED.exe` | 150,086,283 | 130 |

SHA256 servidor: `f5b647e2cc59c6f605de7308741f8c0c624e6d83c05395e40cb995376b66eccd`.

SHA256 cliente: `ed57abeb630476358fa42ca8974fbdcee058ff34a09f3b2ebcd46d5a3cbb4072`.

Ambos `.exe` fueron extraídos como archivos NSIS, sin ejecutarlos. Todos los archivos de aplicación, runtimes, herramientas y avisos cotejan por SHA256; auxiliares NSIS/desinstalador inventariados por separado. Inventarios 026 originales intactos. Compilación UTF-8, sin advertencias. Bootstrap del instalador NSIS x86 Unicode; payload AMD64 y guarda de Windows 11 x64.

## Los 18 entregables

| # | Entregable | Resultado/evidencia |
|---|---|---|
| 1 | Preparación servidor | Backend de candidate-08 intacto, Node 22.20.0 y envolturas locales; ejecución de mantenimiento pendiente VM |
| 2 | Preparación cliente | Electron 43.4.1 completo y app intacta; sin backend/pg/SQL/datos privados |
| 3 | Instaladores | Dos candidatos UNSIGNED producidos y auditados por extracción |
| 4 | Dependencias externas | PostgreSQL 18.3 separado, ruta fija; autoridad/certificados externos; política PowerShell compatible; VM para aceptación |
| 5 | Inventario/SHA256 | `2e7-candidate-03-build-report.json`, los inventarios exteriores dentro de cada payload y `SHA256SUMS.txt` |
| 6 | Auditoría componentes | `2e7-candidate-03-audit.json`: contenido exacto, contratos SQL, dependencias/licencias y auxiliares NSIS |
| 7 | Instalación | Procedimiento de VM y guardas `/LABONLY`, SO/arquitectura y destino versionado en el documento principal |
| 8 | Configuración inicial | Solicitudes privadas externas, herramientas `init/bootstrap/client`, sin confianza ni credenciales incluidas |
| 9 | T0 nuevo | Verificación/generación preparada. **No ejecutada ni certificada en 2E.7** |
| 10 | Primer acceso/operación | Runtime Electron ejecuta la app extraída y rechaza falta de descriptor. Login, módulos, PDF/impresión y T1 pendientes VM |
| 11 | Actualización/desinstalación | Procedimiento preparado; no hay upgrade automático. Desinstalación parcial: retira accesos/registro y conserva archivos. Ensayos pendientes |
| 12 | Certificados/firma | Sin certificado empresarial autorizado. Node original firma válida OpenJS; Electron e instaladores sin firma. Proceso de firma y hashes posteriores documentado |
| 13 | Pruebas Windows | Extracción, PE AMD64, carga/rechazo, inventarios PS, sintaxis y firmas ejecutados en Windows 10; instalación Windows 11 pendiente |
| 14 | Jest/PostgreSQL | **1,138/1,138 pruebas, 41 suites, 0 fallos**. Barreras de PG/red. Nueve contratos SQL preservados y herramientas 18.3 comprobadas; PostgreSQL vivo no repetido |
| 15 | Procesos/puertos | Cero runtimes propios persistentes. PID observado en 5432 conservado. No se abrieron listeners ni se tocaron procesos ajenos |
| 16 | Bloqueos empresa | VM/18 casos, firma, autoridad productiva versionada, HTTPS/LAN, aceptación y datos aprobados |
| 17 | Autorización empresarial | Checklist de equipos/personas/roles/catálogos/red/respaldo/Daily/fecha y sobre de carga inicial vacío separado |
| 18 | Reversión selectiva | Conservar código y datos; revisar compatibilidad y reinscripción explícita. Sin herramienta genérica de cambio de versión; recuperación solo en clúster nuevo |

Procedimiento completo, decisiones, licencias, solicitudes de mantenimiento, checklist y matriz de 18 pruebas: [FASE-2E7-INSTALADORES-WINDOWS.md](../FASE-2E7-INSTALADORES-WINDOWS.md).

## Alcance de los cambios

Solo archivos nuevos:

- `scripts/windows-installers/`: compilación NSIS, auditoría por extracción, inventarios, controles de arranque, mantenimiento, XML de tarea sin registro y runner de regresiones.
- `backend/__tests__/windowsInstallers.test.js`: integridad exterior, manipulación del runtime y rechazo de solicitudes inseguras de mantenimiento.
- `docs/FASE-2E7-INSTALADORES-WINDOWS.md` y `docs/local-fase-2e7/`: procedimientos, sobre vacío de recepción, licencia oficial Node y evidencias.
- `dist/windows-2e7/`: artefactos locales ignorados por Git, incluidas extracciones y herramientas de auditoría; no publicados.

No se modificaron archivos existentes de aplicación, migraciones históricas, perfiles, roles ni relaciones SQL. Los cambios previos que ya tenía el repositorio se conservaron. No se usaron reset/clean ni se eliminaron datos de laboratorios anteriores.

Se conservan candidate-01 (descartado por advertencias de comillas NSIS) y candidate-02 (auditado, previo a las herramientas de mantenimiento). No distribuir esos intentos como versión final de esta fase.

## Límites pendientes

No se dispone de una VM Windows 11 aislada identificada para esta tarea: host Windows 10 Home 19045. No se ejecutaron instaladores, desinstaladores, aprovisionamiento, bootstrap, respaldo/restauración ni registro de tareas/servicios. Las envolturas nuevas de mantenimiento tienen validación de solicitudes y sintaxis, **no aceptación integral sobre PostgreSQL vivo**. No hay certificado T0 ni primer login nuevos. La aceptación de 2E.6 es antecedente histórico y no certifica estos instaladores.

El perfil actual continúa rechazando autoridad empresarial, LAN y destinos existentes. No incluye datos comerciales, fixtures, secretos, CA de laboratorio o bases pobladas. Se mantiene la restricción de no instalar en computadoras de la empresa. La desinstalación conservadora y la ausencia de un mecanismo aprobado de upgrade/reinscripción entre versiones impiden considerar esta entrega definitiva.
