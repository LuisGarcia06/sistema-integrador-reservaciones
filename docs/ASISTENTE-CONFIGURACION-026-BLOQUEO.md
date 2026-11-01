# Asistente experimental 026: bloqueo de compatibilidad

Estado: implementación detenida por un defecto confirmado de candidate-03.
No se construyó ni se aprobó un paquete portable del asistente.

## Motivo de la detención

El usuario autorizó implementar el asistente, exigió verificar correctamente
perfiles Windows con espacios y ordenó detenerse ante un bloqueo de seguridad
o compatibilidad. La propuesta anterior consideraba ese comportamiento pendiente;
esta investigación lo convierte en un defecto reproducido.

`server/app/scripts/enterprise026Provision.cjs`, función `control()`, incluido en
`2e7-candidate-03`, entrega rutas sin comillas a PowerShell `Start-Process
-ArgumentList`. Ese mecanismo pierde los límites de argumentos que contienen
espacios. Afecta las rutas `-D` de datos y `-l` del log, también al detener el
clúster. El aprovisionamiento y las herramientas de arranque reutilizan esa función.

SHA256 del archivo distribuido bajo prueba:
`01237e12e6de7c9fa38b9450cfbac268b24427376caaa8573424cbc8a0180b57`.

Ejemplo comprobado:

```text
Argumento esperado:
C:\Users\VM User\AppData\Local\ctsk-probe\data

Argumentos recibidos por el proceso hijo:
C:\Users\VM
User\AppData\Local\ctsk-probe\data
```

## Prueba ejecutada

`scripts/windows-setup/compatibility.test.cjs` contiene siete pruebas. Se ejecutaron
con `node --test scripts/windows-setup/compatibility.test.cjs`: siete aprobadas,
cero fallos, cero omisiones. Son pruebas de caracterización: pasar significa
reproducir la división incorrecta, no aprobar el soporte de rutas con espacios.

Se cargó el código distribuido en un contexto aislado con sistema de archivos y
procesos simulados. Se extrajo su comando PowerShell original y se ejecutó usando
un pequeño registrador Node en lugar de `pg_ctl`. El registrador solo escribió los
argumentos recibidos. No se ejecutaron Electron, instaladores, PostgreSQL ni el
asistente real; no hubo conexiones a bases de datos.

Resultados nativos de argumentos:

| Perfil sintético | Conserva argumentos |
|---|---|
| VMUser | Sí |
| VM User | No |
| VM Usuario Prueba | No |

También se comprobó la construcción de argumentos de inicio y parada, el SHA256
del aprovisionador, los inventarios completos del servidor y cliente y los SHA256
de ambos instaladores. Los archivos originales permanecen intactos.

Evidencia de la ejecución formal:
`dist/windows-setup-compatibility/4b5ce283-382c-44f2-80e1-5bf902515576/`.
Sus tres archivos `case-*-evidence.json` y `integrity.json` conservan los resultados.
Los casos también se copiaron a `docs/local-fase-2e7-setup-blocker/` para conservar
evidencia fuera del directorio de artefactos ignorado por Git.

## Por qué no se aplica una solución externa silenciosa

El contrato exige destinos canónicos nuevos directamente bajo LOCALAPPDATA.
Agregar comillas al JSON cambiaría la ruta y no satisface esos verificadores.
No se utilizarán alias 8.3, enlaces, modificaciones del inventario, cambios de
perfil ni interceptaciones del lanzador para ocultar el problema.

El asistente externo puede automatizar el candidato en un entorno restringido,
pero no puede afirmar soporte completo de perfiles con espacios reutilizando
la envoltura actual sin cambios. No se ha verificado el perfil concreto de la VM.

## Opciones que requieren una decisión de alcance

1. Mantener candidate-03 intacto y autorizar una primera versión del asistente
   que rechace perfiles con espacios antes de crear carpetas o claves. Si la VM
   utiliza ese perfil, preparar otra cuenta local con ruta sin espacios e instalar
   allí los mismos ejecutables; no renombrar el perfil existente. Esto limita el
   alcance y no corrige la compatibilidad original.
2. Autorizar un candidato nuevo separado que corrija `control()` mediante una
   construcción de argumentos Windows revisada, conservando las validaciones
   de identidad, rutas, marcadores y proceso. Candidate-03 debe preservarse. El
   cambio requiere inventarios nuevos, reinscripción y pruebas reales de inicio
   y parada con espacios, Unicode y errores en Windows 11.

La corrección de la segunda opción no se implementó. Una corrección de comillas
no debe considerarse suficiente hasta probar también `pg_ctl`, su log y el
proceso PostgreSQL hijo real dentro de la VM.

No hay paquete portable ni SHA256 de paquete que entregar. Siguen pendientes
las ocho etapas del asistente y la aceptación real T0, bootstrap, servidor y login.
