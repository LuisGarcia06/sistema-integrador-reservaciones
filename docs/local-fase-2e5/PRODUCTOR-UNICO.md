# Inventario anterior y política propuesta

Fuentes: legacy-inventory.json, legacy-processes-final.json y lectura estática de lanzadores/módulos del repositorio. No se leen continuous.json, credenciales OAuth, tokens, clavesTLS/ngrok ni configuración SQL empresarial. No se ejecuta ningún lanzador ni se consultan bases/API reales.

## Observado

| Tarea | Estado observado | Inicio y fuente aparente |
| --- | --- | --- |
| CommunityTours-FareHarborContinuous | Ready | PowerShell, Start-FareHarborContinuous.ps1 del runtime privado; triggers de arranque/login/tiempo |
| CommunityTours-GetYourGuideContinuous | Running | PowerShell, Start-GetYourGuideContinuous.ps1 del runtime privado; triggers de arranque/login/tiempo |

Rutas exactas y SHA en el inventario. Ambos lanzadores instalados coinciden con sus fuentes del repositorio en la lectura realizada. No se asume que estén sincronizando por nombre/estado. El primer inventario de procesos incluía al inspector por contener las rutas en su comando; el final lo excluye y prevalece. La visibilidad de otras sesiones puede ser limitada.

La fuenteFareHarbor referencia LOCALAPPDATA/CommunityTours/integrations/fareharbor/continuous.json y una ruta postgresConfigPath privada. Su código contempla receptorTLS127.0.0.1:3443 y túnelHTTPS, verificaciones previas y captura de eventos; la aplicación automática depende de permisos/actor/configuración y el lanzador revisado la restringe. Esto describe el contrato del código, no un listener/configuración efectivos comprobados.

La fuenteGetYourGuide referencia su continuous.json, postgresConfigPath y archivos OAuth privados, consulta Gmail y persiste eventos/cursor con bloqueo propio. No es Supplier API homologada ni demuestra importación comercial activa. No expone un receptorHTTP en ese flujo. El código de validación SQL contempla relación con el entorno principal; la base/puerto/privilegios efectivos quedan sin comprobar.

Pendientes de autorización separada: inspección nominativa de metadatos efectivos de configuración y endpoints, ejecutableNode/dependencias, roles/base reales y funciones efectivamente habilitadas. No se accedió a esos secretos ni se verificó funcionamiento contra empresa. No se detuvo/deshabilitó/modificó tarea, servicio o credencial.

## Política propuesta, aún sin activar

Captura manual: personas autorizadas, código interno y declaración externa única; nunca es una confirmación de vínculo de sincronización. Integración experimental: exclusivamente datos/puertos/credenciales sintéticos en clúster nuevo. Integración empresarial: sólo una autoridad nominativa puede conceder una concesión de productor por instalación+plataforma, con generación y fencing; deben participar todos los escritores/importadores autorizados.

Antes de habilitar024 real: inventariar productores antiguos y rutas de publicación/aplicación, responsables y alcances; decidir explícitamente su transición, conservar sus eventos/pendientes y comparar referencias/vínculos/cortes. Probar exclusión mutua y recuperación de la concesión. Los candados distintos de procesos anteriores no garantizan exclusión entre productos. No se habilita024 real mientras siga sin aclararse un productor.

Reconciliación: consulta/detección puede reunir evidencia, pero no importar ni sobrescribir sin dueño autorizado. Declaración manual coincidente o ambigua se queda pendiente. Captura Gmail de apoyo no se eleva a SupplierAPI. GetYourGuide continúa manual hasta continuidad/homologación/recuperación verificadas y aprobadas.
