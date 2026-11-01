# Contrato de arranque y límites empresariales

Se implementa un supervisor ejecutable **de ensayo025**, separado de Electron y del backend runtime. El ZIP anterior2E.4 y su bloqueo quedan intactos. El candidato nuevo sólo puede usar una inscripción nominativa nueva con scope new-synthetic-cluster-only. No se puede activar con un flag de Electron ni se aceptan constancias de otro clúster.

## Cadena de confianza ensayada

1. La custodia externa suministra autoridad pública confiable y una inscripción Ed25519 firmada; no se incluye su clave privada en el paquete.
2. La inscripción liga responsable/expiración/id, instalación, paquete/inventarioSHA, código, configuración privadaSHA, base/clúster, bootstrap, generación y época. El supervisor exige ACL y compara cada archivo del paquete; rechaza rutas inválidas, enlaces, archivos adicionales, cambios y firma ajena.
3. Antes de conectar verifica el directorio/marker/PID/puerto/clúster sintético. La configuración de mantenimiento es privada y externa, con identidad exacta; no hay contraseña predeterminada ni aprovisionamiento automático.
4. La conexión de mantenimiento verifica identidad y bootstrap vivo mediante contratos existentes; rol runtime, esquema023/024/025, singleton y Administrador legítimo. Exige automatización desactivada para el arranque manual.
5. Un candado de sesión PostgreSQL propio impide segundo supervisor. Se conserva mientras funciona el backend; al perder la conexión de mantenimiento se cierra el backend propio. No se apropia de procesos/puertos ajenos.
6. El supervisor inicia el backend consolidado original desde el paquete con su única conexión/pool runtime limitado. Responde al desafío de arranque con una atestación fresca del mismo clúster verificado. No entrega credenciales de mantenimiento al backend ni SQL al cliente.
7. Electron verifica descriptor público/identidad/nonce/época/versión; renderer aislado, sin pg ni secretos. La detención explícita por canal privado cierra primero el backend y después la conexión/candado; los logs públicos usan códigos seguros.

Los instrumentos de fallos y UI de las pruebas son externos al cliente. El servidor conserva fuentes de compatibilidad requeridas por la huella023 (incluidos conductores anteriores), pero el supervisor ejecuta exclusivamente backend/preproductionApi.js, sin probe. No se confunde el ensayo instrumental posterior con el arranque normal del candidato.

## Brecha empresarial conservada

**La puerta de instalación empresarial queda incompleta.** Los contratos vigentes exigen directorio/clúster/base de laboratorio, principal de mantenimiento sintético y migraciones expresamente experimentales. El supervisor025 no elimina esas condiciones ni convierte una firma sintética en autorización empresarial; scope enterprise se rechaza. El mecanismo de confianza y arranque se ensaya de verdad, pero todavía no puede iniciar una base empresarial legítima.

Para cerrarlo hace falta aprobar un contrato definitivo de instalación/bootstrap/mantenimiento y migraciones definitivas, nombres/identidades de bases y roles, autoridad de instalación empresarial y custodia, firma/distribución, HTTPS y procedimiento de recuperación. Después debe implementarse/verificarse ese perfil por separado, manteniendo todos los invariantes de seguridad. No basta cambiar purpose, renombrar la base o copiar un manifiesto sintético. No se declara el hitoB empresarial completo.

## HTTPS/LAN, mantenimiento y respaldo

Loopback HTTP con identidad firmada sólo acredita la prueba local. Para dos equipos: nombres/origen estables, TLS con SAN/hostname/cadena confiables, custodia y renovación, descriptor aprobado, cuentas Windows separadas, PostgreSQL accesible únicamente al servidor y firewall mínimo autorizado. Sin ignore-certificate-errors, disable-web-security ni opciones de omitir identidad/esquema/JWT/permisos. No se tocó red/certificados/firewall/servicios reales.

Se reutiliza el plan2E.4: respaldo diario y previo a cambios, retención propuesta14diarios/8semanales/12mensuales, copia externa cifrada y custodios separados, todo pendiente de aprobación nominal. La autoridad de respaldo se fija por un canal independiente del dump. Restauración sólo en destino nuevo vacío: filas/secuencias/restricciones/refs025/estado024 exactos, época/JWT/identidad nuevos, descriptor nuevo y reautorización administrativa. La clave durable de comandos exige custodia separada. No se programaron tareas empresariales ni respaldos de la base real.

Antes de mantenimiento, limitar escrituras mediante procedimiento autorizado, detener el supervisor propio, verificar cierre y conservar pendientes. El candado del supervisor no coordina productores antiguos: la política de productor único y la transición de aquellos procesos deben aprobarse antes de cualquier integración real.
