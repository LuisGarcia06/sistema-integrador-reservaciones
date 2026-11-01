# Paquetes experimentales y configuración

No son instaladores ni distribución empresarial aprobada. `packages/client` es un candidato de fuentes ejecutable sólo contra el entorno sintético local autorizado; `packages/server` reúne componentes y bloquea su arranque. Ninguno contiene configuración de instalación, datos, dumps, claves, manifiestos sintéticos o credenciales. Inventario individual y SHA256 en `package-inventory.json`.

## Cliente

Conserva páginas, recursos, preload y funciones originales de ventana, navegación y exportación Daily/PDF. `build-packages.cjs` extrae los bloques originales y separa únicamente el arranque; no modifica `electron/main.js` original. El candidato no incluye backend, node_modules, pg, aprovisionadores, fixtures o controladores de laboratorio. Las páginas activas se sirven por Express; la copia local de recursos permite inspección y no es una base de datos local.

Requiere Electron43.4.1 suministrado por separado desde un canal confiable. El descriptor público firmado se proporciona externamente con ACL y sólo admite 127.0.0.1. Sin descriptor válido o identidad firmada/fresca coincidente se rechaza el inicio. No existe flag para omitir esa comprobación. El instrumento `client-harness.cjs` es externo al paquete y sólo permite comprobar login en laboratorio; no se distribuye.

No se ha extendido el descriptor a HTTPS empresarial ni se ha firmado un ejecutable. La verificación de identidad es reutilizada, no reemplazada por una URL editable. Un cambio de instancia o pérdida de conexión invalida la sesión; después de restaurar se necesita descriptor de identidad nuevo y sesión nueva.

## Servidor

Incluye backend por capas, frontend servido, esquema/migraciones revisables, contratos y herramientas de respaldo/restauración, más dependencias runtime instaladas en el repositorio con sus versiones y licencias. Se copian sin ejecutar npm install, postinstall ni descargas. PostgreSQL18.3 y Node22.20 son prerrequisitos externos, no se instalaron servicios ni motores empresariales.

`start.cjs` termina con código78 y diagnóstico de bloqueo antes de abrir sockets o SQL. El arranque023 actual requiere supervisor privado, atestación de bootstrap/esquema/identidad y huella de fuentes que incluye supervisores de laboratorio. El paquete omite esos supervisores. Convertirlo en instalador ejecutable exigiría un contrato empresarial de instalación/mantenimiento aprobado; no se sustituyeron sus verificaciones por una opción permisiva. 023/024 están disponibles para revisión y nunca se aplican automáticamente a una base existente.

Este bloqueo es un resultado del hito B, no una instalación exitosa de servidor. El backend consolidado funcional se ensaya en C con los contratos sintéticos originales. Empaquetado NSIS habitual aún mezcla Electron/backend/pg; no se usó como supuesto cliente independiente.

## Configuración y secretos propuestos

Separar: binarios/fuentes inmutables; configuración privada de servidor con ACL restringida; descriptor público firmado de cliente; respaldo de datos; y custodia separada de secretos. Nunca poner contraseña SQL, JWT, claves privadas de identidad/comandos o credenciales de proveedor en cliente, frontend, argumentos o Git. No copiar los manifiestos de laboratorio a equipos de empresa.

El servidor debe verificar clúster/base/esquema, rol runtime limitado, instalación/generación, bootstrap legítimo y custodia antes de escuchar. Mantenimiento usa identidad separada y permiso temporal. Después de restaurar: identidad de instalación/época/JWT nuevas, generación de datos y clave durable de comandos bajo custodia separada, corte/avance/vínculos024 intactos y reautorización administrativa. El dump no contiene por sí solo toda la configuración necesaria para recuperar el servicio.

Antes de distribuir: lista cerrada de archivos/dependencias, análisis de vulnerabilidades autorizado con acceso al registro, licencias, hashes firmados por canal de publicación, verificación sin red, pruebas en instalación limpia, actualización/reversión selectiva y aceptación de personal. No se declara ausencia de vulnerabilidades por inventariar versiones.

## HTTPS/LAN pendiente

Definir equipos/cuentas, nombre DNS estable, origen/puerto HTTPS, certificados con SAN correcto, cadena/CA confiable y custodia de clave TLS, expiración/renovación y rotación de identidad. Cliente debe validar cadena, hostname y descriptor/identidad; no permitir certificados inválidos, ignore-certificate-errors ni disable-web-security. PostgreSQL sólo en servidor, sin exposición a clientes. Firewall mínimo y segmentación requieren autorización posterior por equipo y puerto.

El ensayo local de identidad usa HTTP exclusivamente en loopback y firma de desafío; **no acredita TLS ni seguridad LAN**. No se cambiaron firewall, router, almacenes de certificados, DNS o servicios. No se eligió automáticamente infraestructura pública para GetYourGuide.
