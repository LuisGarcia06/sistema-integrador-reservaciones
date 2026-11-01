# P-01 — Frontend original y API sintética en memoria

`synthetic-acceptance-only`; `productionAuthorized=false`. Procedimiento preparado
para revisión y ejecución manual en `Windows11-CommunityTours-Test`.
**No es la instalación integral ni una prueba del Express/PostgreSQL reales.**

Reutiliza `scripts/preview/main.cjs`, su API y fixtures sintéticos existentes y el
frontend original. No importa `backend/server.js`, `pg`, dotenv o proveedores;
el aislamiento rechaza esos módulos y conexiones salientes Node. Electron admite
solo recursos del servidor loopback de la demo; conserva sandbox, contextIsolation,
webSecurity y nodeIntegration=false. Los roles de demostración se validan en la
API sintética; no se cambian roles o reglas del producto.

## Qué se ejecutaría y qué efectos tendrá

Un runtime Electron 43.4.1 x64, copiado íntegro del runtime existente, ejecutará
las fuentes de la demo. No se compila código nativo ni se incluye el componente
en cuarentena. No se ejecuta esta prueba en Windows 10. No utiliza PowerShell,
CMD, servicios, clúster, claves empresariales ni credenciales reales.

Permisos de usuario normal; no elevación ni contraseñas. Extraer el kit a una
carpeta nueva en LOCALAPPDATA crea únicamente archivos de ensayo; Electron crea
un perfil nuevo temporal `ctsk-preview-05-*`, cachés y posibles crash dumps. La
API escucha un puerto efímero en **127.0.0.1**, nunca en 0.0.0.0/LAN. Las sesiones
y cambios ficticios viven en memoria y desaparecen al cerrar. El perfil temporal
no se elimina automáticamente para conservar diagnóstico; no se toca el perfil
del cliente instalado. Si aparece UAC o alerta antivirus, cancelar y comunicarla.
No restaurar archivos, crear exclusiones ni desactivar protecciones.

El runtime conserva su `resources/default_app.asar`: no utilizar como sustituto
el ejecutable de candidate-04 o del asistente, cuyos resources/app contienen otra
entrada. No modificar esos directorios protegidos por inventarios.

## Pasos manuales

1. Confirmar el título de VirtualBox y Windows 11. Revisar este procedimiento antes
   de ejecutar. N-04 permanece en pausa; esta prueba no depende de ella.
2. Usar el kit `CommunityTours-P01-partial-ui-api.zip` y su SHA256 entregado en el
   informe. Dentro del Explorador de la VM, abrir `%LOCALAPPDATA%` y extraer a un
   destino **nuevo**, llamado `CTSK-Prueba-Parcial-01`. Si ya existe, detenerse;
   no sobrescribir. Deben quedar directamente `runtime`, `fuente` y el inventario.
3. En **Ejecutar** (Win+R), introducir esta única invocación directa, sin consola
   intermedia y sin «Ejecutar como administrador»:

```text
"%LOCALAPPDATA%\CTSK-Prueba-Parcial-01\runtime\electron.exe" "%LOCALAPPDATA%\CTSK-Prueba-Parcial-01\fuente" --ctsk-synthetic-preview
```

4. Se espera una ventana «DEMO…DATOS FICTICIOS», con una barra que declara prueba
   parcial, synthetic-acceptance-only y productionAuthorized=false. Seleccionar
   un perfil ficticio y pulsar **Entrar / cambiar perfil**. No introducir credenciales
   reales; ese botón utiliza únicamente datos sintéticos del simulador.
5. Confirmar que se mantiene abierta, carga el frontend y permite una lectura de
   reservaciones/operaciones ficticias. Las funciones fuera del simulador pueden
   responder «fuera del recorrido»; no equivalen a un defecto del backend real.
6. Cerrar mediante «Cerrar demo» o la X. Se espera que desaparezca la ventana y
   se cierre el servidor propio en memoria. Reabrir con la misma invocación debe
   empezar una sesión nueva, sin persistencia de cambios ficticios.
7. Devolver: si abrió, si se mantuvo abierta, si entró con perfil ficticio, si
   pudo leer una pantalla, si cerró/reabrió y cualquier código visible. Una captura
   recortada de la barra y pantalla basta; no contraseñas ni datos reales.

Si se cierra antes de mostrar la ventana, registrar el mensaje visible de Electron
o del runtime. Si aparece `PREVIEW_RENDERER_GONE`, diferencia una caída de renderer
del rechazo por configuración del cliente enterprise. No desactivar sandbox o
seguridad para continuar. La demo ya desactiva aceleración gráfica como decisión
de ensayo heredada; su éxito no certifica el comportamiento GPU del cliente real.

## Alcance del resultado

Una apertura correcta acredita esta combinación de runtime, frontend y API
**simulada** en esa VM. No verifica Express real, PostgreSQL, T0, primer Administrador
persistente, HTTPS empresarial, cuentas/ACL, token restringido o servicio. Tampoco
repara los archivos instalados de setup-02/candidate-04. No autoriza aprovisionamiento,
construcción de nuevos instaladores o instalación corporativa.
