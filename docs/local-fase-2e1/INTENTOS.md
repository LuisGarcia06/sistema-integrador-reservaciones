# Ensayos integrales conservados

Cada intento crea un clúster sintético nuevo, repite bootstrap/primer login y B, y cierra sus hijos/PostgreSQL en `finally`. Ningún intento fallido equivale a aprobar C. Los logs `consolidation-attempt-N.log` y los informes privados por directorio conservan el resultado; `consolidation-verification.json` representa la ejecución más reciente.

| Intento | Hallazgo | Tratamiento |
| --- | --- | --- |
| 1 | El fixture de turnoNULL utilizaba `+` para concatenar texto SQL | Corregir a `||`; no cambiar la validación comercial |
| 2 | El corredor utilizaba el DOM anterior durante la navegación asíncrona | Esperar cambio real de raíz y carga de la página |
| 3 | El adaptador imponía motivo de auditoría2/3 a la edición histórica de Reservaciones | Excepción explícita sólo para Reservaciones en el perfil conjunto; nueva regresión023 y tres pruebas de comportamiento |
| 4 | Chromium repitió el POST tras cortar el socket; el mismo UUID recibió un replay confirmado | Mantener la protección idempotente. Para ejercitar incertidumbre se retiene la respuesta real posterior aCOMMIT hasta el timeout/AbortController y después se recupera porGET |
| 5 | La prueba Consulta all exigía ausencia/deshabilitación de un control que la página original oculta | Comprobar ocultación y que invocarlo tampoco abre un comando; conservar guard backend |
| 6 | Recorrido repetido con los ajustes anteriores | Ver el informe real y la identidad final, sin sumar resultados de intentos fallidos |

La retención temporal de respuesta y la inyección SQL son instrumentación privada del laboratorio. El POST original, COMMIT, fila comercial, auditoría, ledger, recuperación HTTP y formularios son reales. No se sustituye el backend, la aplicación ni el generadorPDF por mocks.
