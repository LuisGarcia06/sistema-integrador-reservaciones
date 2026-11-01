# Contrato de preparación 2E.2

El software empresarial permanece desactivado. `preproduction023-local` sólo admite directorios nuevos marcados, PostgreSQL18.3 sintético, esquema023 exacto, una base central y HTTP en127.0.0.1. No acepta nombres, clústeres ni puertos productivos. La activación habitual de Electron conserva su camino anterior.

## Separación de responsabilidades

| Servidor | Cliente |
| --- | --- |
| PostgreSQL, backend Express y un pool centralizado | Electron original y sus páginas |
| JSON privado de runtime, JWT y claves de comandos/identidad | Descriptor público firmado: instalación, época de autenticación, generación, origen y clave pública |
| Mantenimiento privilegiado local para bootstrap/verificación/restauración | Sin contraseña SQL, nombre de base, usuario SQL, puerto PostgreSQL ni claves privadas |
| Respaldo y verificación de recuperación | Sin base local comercial ni sincronización bidireccional |

El proceso cliente comprueba un desafío HTTP firmado por el backend configurado. Comprueba instalación, época, generación, origen, huella y frescura. Rechaza otra firma o identidad; cambios del proceso o indisponibilidad invalidan la sesión. El renderer conserva sandbox, aislamiento de contexto, seguridad web y ausencia de Node. La configuración del cliente no permite saltarse la verificación por un argumento.

## Sustitución de dependencias de laboratorio

Las pruebas de seguridad A/B y las cuentas de fixtures no acreditan este primer arranque. La instalación prepara sólo estructura y roles técnicos, captura una credencial explícita, utiliza el servicio de bootstrap existente y verifica su singleton vivo. No se copia una constancia de otro clúster. La verificación privilegiada de mantenimiento sigue separada del runtime limitado: el lanzador local firma un desafío de propósito específico después de verificar identidad, permisos y esquema. No es una herramienta de despliegue empresarial ni instala un servicio Windows.

El supervisor privado de pruebas conserva únicamente la coordinación de fallos, captura del diálogo PDF e impresión interceptada. No es una API de negocio. La instrumentación no tiene rutas HTTP públicas ni se importa desde la entrada normal del backend de preproducción. Los puertos aleatorios y los clústeres desechables se utilizan sólo en el ensayo; una futura instalación necesitará configuración fija revisada.

## Contrato empresarial propuesto, sin implementar su activación

La instalación futura deberá tener identidad UUID, generación de datos, época de autenticación, propietario de claves y un inventario firmado de esquema/versión. Configuración y secretos permanecerán fuera del repositorio y del paquete cliente, protegidos por cuentas Windows separadas, ACL mínimas y una política de custodia aprobada. El usuario SQL de runtime no será superusuario, propietario ni administrador de roles o bases; mantenimiento y restauración tendrán un canal local separado. No habrá usuarios comerciales predeterminados.

JWT empresarial deberá utilizar un emisor y audiencia por instalación y época, expiración limitada, generación y versión de credenciales verificadas en cada petición. La clave de firma no se entregará al cliente. La identidad del servidor y la confianza de transporte se provisionarán mediante un procedimiento administrativo independiente, con renovación y revocación definidas.

Para LAN se exige HTTPS con certificado y nombre verificados, confianza explícita del cliente, bloqueo de certificados inválidos y ausencia de excepciones globales. El backend escuchará sólo en la interfaz y puerto autorizados; PostgreSQL quedará accesible únicamente al servidor. La red privada no acredita identidad ni confidencialidad. Faltan decisiones de DNS/IP, certificados, cuentas Windows, inicio al arrancar, reglas de firewall y recuperación. Esta fase no modifica ninguno de esos elementos ni afirma conectividad entre dos equipos.

## Restauración e identidades

La constancia singleton original no se modifica. La generación de datos se conserva para mantener la historia y los comandos durables. Una constancia externa de recuperación, firmada y ligada al respaldo, vincula la procedencia original al clúster destino nuevo. El destino recibe instalación, época, clave JWT, clave de identidad del servidor y clave de precondiciones nuevas; debe autorizarse de nuevo el descriptor del cliente. Los JWT anteriores se rechazan incluso cuando una copia antigua recupera una versión de credenciales anterior a su revocación.

La clave de huella de comandos se conserva mediante custodia separada para mantener su identidad durable. El respaldo de datos no contiene las claves JWT, la clave privada de identidad, la clave de precondiciones ni la clave de comandos. Un respaldo incluye hashes de contraseñas de Usuarios y datos sensibles: también exige ACL, protección física y cifrado de almacenamiento apropiado antes de uso empresarial. No se puede afirmar que un archivo de datos por sí solo permita recuperar toda la instalación.

El desafío firmado caduca a los 30 segundos y es de un solo arranque/nonce. El perfil nuevo admite hasta 1 segundo de adelanto del reloj entre procesos locales, probado en los límites; el ensayo detectó 6 ms de diferencia en Windows. Esta tolerancia no cambia firmas, identidad, nonce ni los contratos anteriores. Un timestamp mayor a ese margen o más antiguo que 30 segundos se rechaza.
