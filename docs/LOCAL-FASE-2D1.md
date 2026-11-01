# Fase 2D.1 — Reservaciones originales con concurrencia e idempotencia

Implementación local completada y validada el 27 de octubre de 2026. La entrada principal no carga esta integración. No se activó en producción ni se conectó la instalación actual al esquema 020.

1. **Archivos modificados y creados.**

Se registraron hashes de 787 archivos antes de editar. Solo cambiaron tres archivos existentes; los otros 784 conservaron exactamente su contenido y no se eliminó ninguno. Las copias iniciales están en `docs/local-fase-2d1/before/` y los hashes iniciales/finales en `docs/local-fase-2d1-before.json` y `docs/local-fase-2d1-verification.json`.

| Archivo existente | Cambio |
| --- | --- |
| `frontend/pages/reservaciones.js` | Ganchos condicionados al adaptador: foto antes de abrir, envío protegido, limpieza, paneles y bloqueo de acciones ajenas al alcance. |
| `frontend/js/commandLab.js` | Opción `comparisonRead` para comparar reservaciones mediante GET autorizado. Extrae la lectura compartida con la consulta actual; el comportamiento anterior sigue siendo el predeterminado. |
| `scripts/commandFrontendHost.cjs` | Ámbito explícito `reservaciones-integradas` con política cerrada y cinco cabeceras obligatorias. El ámbito anterior conserva su política original. |

| Archivo creado | Responsabilidad |
| --- | --- |
| `frontend/js/reservationCommands.js` | Coordina el modelo existente con el modal, confirmaciones, comparación, recibo y recuperación. |
| `frontend/lab/reservaciones.html` | Entrada restringida que carga los módulos originales inventariados; no define otro formulario de reservaciones. |
| `frontend/lab/reservaciones.js` | Monta login y Reservaciones originales, conserva el modal al intentar navegar a módulos ajenos y procesa cambios de permisos. |
| `frontend/lab/reservaciones.css` | Estilos locales de banner y paneles; conserva los CSS originales. |
| `scripts/reservationFrontendPolicy.cjs` | Lista cerrada de assets, lecturas, filtros y único escritor. |
| `scripts/ReservationFrontendLab.ps1` | Directorio nuevo privado, ACL y entorno limpio para Verify/Stop. |
| `scripts/reservationFrontendLab.cjs` | Aprovisionamiento, API normal protegida, proxy, fallos sintéticos, observador, reinicio y cierre. |
| `scripts/reservationFrontendDriver.cjs` | Pruebas de Electron real mediante la tabla, selectores y modal originales. |
| `backend/__tests__/reservationFrontend.test.js` | Compatibilidad de HTML/validadores/PATCH heredados, variantes y política de acceso; comparación sin precondiciones anticipadas. |

También se crearon este informe, inventario previo, reportes JSON, registros de ejecución, respaldos y seis capturas sintéticas dentro de `docs/local-fase-2d1/`.

2. **Formulario original integrado.**

La tabla, filtros, paginación, detalle y modal provienen de `frontend/pages/reservaciones.js`. Se conserva `renderReservacionDialog`, sus generadores, `buildPayload`, normalizadores y comparación de campos. El adaptador agrega paneles dentro del mismo `#reservaciones-form`; no existe una segunda definición de campos ni un formulario simplificado. `frontend/index.html`, router principal, login, auth, apiFetch, CSS originales, backend, migraciones e integraciones no se modificaron en esta fase.

3. **Campos y validaciones conservados.**

Se mantienen los 22 controles normales: código inmutable, fecha, turno, tour, país, plataforma, nombre, teléfono, habitación, idioma, notificado, PAX, niños, pickup, hora, método de pago, vendedor, precio, depósito, saldo, tipo de cambio y observaciones. Continúa el motivo de cancelación cuando corresponde, así como el turno histórico sin clasificar y el tour inactivo seleccionado. No se cambió ninguna regla comercial.

Se comprobaron selectores reales, límites y tipos, importes decimales, booleano notificado y nulabilidad. Los errores por nombre vacío, PAX inválido, niños mayores que PAX, pickup/hora ausentes, catálogos sin seleccionar e idioma demasiado largo detienen el guardado antes de confirmar o generar una clave. Las regresiones verifican además fecha, PAX fraccionario, niños negativos e importes no numéricos. El código conserva su condición inmutable después de terminar la carga del formulario protegido.

4. **Flujo de concurrencia e idempotencia.**

Abrir Editar obtiene una foto autorizada por `/api/precondiciones` antes de mostrar los campos. La propuesta usa la validación y el PATCH diferencial originales. Confirmar genera una UUID segura y el sobre inmutable del `CommandSession` existente, con protocolo `ctsk-command-api-v1`, generación original, `Idempotency-Key`, `If-Match` e `If-Operational-Match`. Cancelar la confirmación no genera clave ni escribe.

El resultado confirmado permanece en el modal con su recibo y bloquea otro guardado. El recibo no sustituye la foto original. Una consulta del estado actual se muestra separadamente. Se verificó un incremento exacto de revisión BIGINT, sin convertirla a Number.

5. **Conflictos y recuperación.**

412 y 409 conservan todos los controles y valores introducidos. El comparador compartido presenta original, propuesta y actual. La comparación integrada hace GET del registro y no obtiene precondiciones nuevas. Los textos se insertan de forma segura; una propuesta con `<script>` permanece como texto.

Revisar mis cambios exige confirmar la preparación de otra intención; solo entonces obtiene una nueva foto y conserva el PATCH propuesto sobre la base autorizada. Utilizar información actual exige confirmar el descarte. Ninguna decisión guarda automáticamente; otro guardado requiere su propia confirmación y clave. Cancelar esas confirmaciones mantiene la foto, clave y formulario anteriores.

Una respuesta truncada después de COMMIT conserva formulario y comando, bloquea Guardar y ofrece GET del comando original. Se verificó recuperación tras un error de lectura y después de reiniciar el backend normal con la misma generación. Un 404 desconocido sigue no concluyente: no habilita otra intención ni reenvía. La aplicación impide cerrar o sustituir ese modal; beforeunload advierte al salir. Logout, cambio de identidad o permisos destruyen el estado de sesión anterior y no restauran respuestas tardías. Las referencias y borradores solo viven en memoria: no se implementó recuperación después de destruir la ventana ni persistencia local.

6. **Pruebas ejecutadas y resultados.**

| Verificación final | Resultado |
| --- | --- |
| Jest aislado con guardias PostgreSQL/red | **27 suites y 741 pruebas aprobadas**, 0 fallidas. Incluye las 706 anteriores y 35 nuevas. |
| Modal original + Electron real + API normal + PostgreSQL 020 nuevo | **9 grupos de comprobaciones aprobados**, 0 fallos. |
| Regresión del frontend de comandos anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Regresión del frontend de revisiones anterior | **16 comprobaciones aprobadas**, clúster nuevo. |
| Perfil independiente anterior y Electron principal verificado contra su backend sintético propio | **6 comprobaciones aprobadas**, sin habilitar 020 en ese perfil. |

Los nueve grupos integrados cubren campos/validaciones/selectores, confirmación/guardado/revisión, dos administradores con 412, contexto 409, respuesta perdida y recuperación, desconocido sin reenvío, Consulta con alcance por plataforma, permisos revocados durante una respuesta y cierre de escritores ajenos. El observador comprobó en el guardado y en la pérdida posterior a COMMIT **una entrada de comando, una de bitácora y un envío upstream**. La recuperación no agregó escrituras. En el caso desconocido no existieron comando ni bitácora y la aplicación conservó la incertidumbre sin volver a enviar.

La compatibilidad adicional compara el HTML completo anterior y actual sin adaptador en alta, edición, detalle, turno histórico, tour inactivo y cancelación, y verifica el PATCH heredado. El registro íntegro de resultados está en `jest-results.json`, `integrated-verification.json`, los tres `*-regression.json` y `reservation-frontend-ui-checks.json` dentro de la carpeta de evidencia.

Ejecución integrada reproducible (siempre crea otro clúster):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\ReservationFrontendLab.ps1 -Mode Verify
```

Las pruebas en una sola computadora no sustituyen la validación futura con dos equipos físicos.

7. **Aislamiento confirmado.**

El [inventario previo](local-fase-2d1/INVENTARIO.md) identifica cada solicitud y efecto lateral antes de cargar la pantalla. El laboratorio usa un manifiesto nuevo `command-api-lab`, generación propia, ACL privada, PostgreSQL desechable y esquema 020 verificado. La API arranca por su entrada normal y conserva las comprobaciones de identidad, huellas, esquema, autorización y protocolo. El observador solo conecta al clúster recién provisionado.

Frontend/API/PostgreSQL escuchan exclusivamente en 127.0.0.1. El host verifica Host/Origin, CSP y una lista de assets/rutas/métodos/query cerrada. Solo acepta como escritor PATCH de una reservación con las cinco cabeceras del contrato. Electron conserva sandbox, contextIsolation, webSecurity y nodeIntegration desactivado, sin preload privilegiado; bloquea permisos, ventanas, navegación y tráfico fuera del origen propio. No se entregan secretos PostgreSQL al renderer. Los cambios de contexto y permisos del ensayo se realizan desde el corredor sintético mediante comandos completos contra esa misma API; no abren rutas adicionales en el host integrado.

No se accedió a `sian_kaan_reservaciones`, ni se utilizaron credenciales productivas. No se ejecutaron migraciones sobre bases existentes ni cambios a ngrok, tareas, firewall, router, servicios o instaladores. No se modificaron sincronizadores o receptores. Esta confirmación se basa en los destinos y acciones del ensayo, sin consultar producción.

Se crearon seis clústeres durante esta fase: tres iteraciones integradas y tres regresiones. Todos quedaron detenidos, sus **17 puertos sin listeners y sin procesos asociados**, según `closure.json`. Las configuraciones privadas permanecen en sus directorios propios; solo se copiaron informes y capturas sin contraseñas a la evidencia.

8. **Funcionalidades que siguen bloqueadas.**

El laboratorio integrado solo admite edición de reservaciones. Altas, cancelación, cambio de transporte e impresión están bloqueados. Operaciones, Daily, Usuarios, catálogos completos, pantallas de integraciones y notificaciones no se montan. Las once rutas pendientes del frontend anterior siguen pendientes; no se amplió su cobertura. El host integrado tampoco expone los otros trece formularios del laboratorio de comandos.

Se evaluaron cancelación y transporte: comparten backend protegido, pero la cancelación tiene otro modal/confirmación y el cambio de transporte requiere seleccionar relaciones operativas. Integrarlos necesita pruebas propias de reglas y permisos. Se dejan para fases específicas después de revisar esta primera integración.

9. **Problemas encontrados y resueltos.**

La primera iteración pasó los nueve grupos de UI, pero la auditoría final clasificó también la sonda deliberada de Consulta como petición sin cabeceras. El backend la había rechazado con 403, sin efecto. Se endureció el proxy integrado para rechazar cabeceras faltantes antes del upstream y se repitió la sonda con contrato completo y JWT de Consulta: el backend volvió a denegarla. Se verificó además un PATCH sin cabeceras con 428 del host. Las iteraciones posteriores terminaron completas.

Una expectativa de prueba unitaria usaba 99:99 como hora inválida en un DOM simulado; el validador heredado comprueba el formato HH:MM, mientras el input real de hora no admite ese valor. Se corrigió la expectativa a formato inválido, conservando las reglas originales y la validación del backend. La última variante evita incluso obtener precondiciones para alimentar el comparador: usa GET y espera decisión para renovarlas.

No quedan fallos de las verificaciones ejecutadas. Persisten los límites explícitos: una computadora, sin persistencia de borradores y sin activación productiva.

10. **Procedimiento de reversión.**

Los ensayos terminaron detenidos. Si una ejecución futura se interrumpe, cerrar únicamente sus procesos identificados y detener su directorio validado:

```powershell
.\scripts\ReservationFrontendLab.ps1 -Mode Stop -Directory 'C:\Users\luisg\AppData\Local\ctsk-standalone-<identificador-del-ensayo>'
```

No reutilizar un manifiesto tras modificar sus fuentes ni alterar huellas para eludir verificaciones. Para revertir código, retirar los ganchos optativos del modal, la opción de comparación por lectura y el ámbito integrado del host, junto con los nueve archivos de implementación/pruebas nuevos enumerados. Las tres copias iniciales preservan el contenido previo. Restaurarlas completas solo si los hashes actuales coinciden con los hashes finales registrados; si existe trabajo posterior, retirar selectivamente este parche. Conservar evidencias y evitar reset/clean/restauraciones masivas. No hace falta operación inversa sobre una base existente.

11. **Recomendaciones para los demás formularios.**

Integrar uno por fase con su HTML y validaciones reales, inventario previo de solicitudes, ámbito cerrado, foto autorizada y confirmación explícita. Reutilizar CommandSession, comparador y recibo; mantener separados contexto, revisión, clave reutilizada, bloqueo y resultado desconocido. Para cancelación y transporte, verificar selección autorizada, capacidad, relaciones y alcance antes de ampliar su host.

Antes de distribución real hacen falta validación física con dos equipos, decisiones sobre referencias/borradores tras cerrar la aplicación y pruebas de aceptación del transporte autorizado. No activar 020 en perfiles antiguos ni abrir escritores por el mero hecho de que el backend ya tenga el protocolo.
