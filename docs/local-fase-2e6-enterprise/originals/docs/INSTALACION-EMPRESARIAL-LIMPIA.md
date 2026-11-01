# Requisito obligatorio de instalación empresarial limpia

Aplicable a Fase2E.6 y a toda instalación definitiva de Community Tours. **No se autoriza aprovisionar empresa, limpiar bases actuales ni instalar en equipos.** Los candidatos2E.4/2E.5 son evidencia experimental, no entregables empresariales aprobados.

## Regla de aceptación

Crear una base PostgreSQL empresarial **nueva y vacía**, sólo con estructura, migraciones/contratos definitivamente aprobados, restricciones/relaciones/permisos y catálogos técnicos indispensables. No restaurar un dump de pruebas para después borrar registros. No reutilizar usuarios, secretos, identidad, generación, bootstrap, cortes, cursores ni configuraciones de laboratorio.

No modificar ni limpiar sian_kaan_reservaciones o sian_kaan_reservaciones_dev. No eliminar laboratorios ni alterar respaldos existentes. Mientras haya datos o dependencias de laboratorio en el paquete, **la instalación no está lista**. Los contratos023–025 actuales siguen aprobados exclusivamente para ensayo: requieren una aprobación empresarial posterior y no se reetiquetan para eludir sus guards.

## Procedimiento empresarial propuesto, aún no ejecutable/autorizado

1. Revisar identidad del nuevo servidor/clúster/base, roles técnicos, versiones, autoridad de instalación, integridad del código y lista exacta de migraciones aprobadas. Definir HTTPS, custodia cifrada y cuentasWindows. No usar configuración ni constancias de un clúster de ensayo como autorización.
2. Aprovisionar sólo un destino nuevo identificado mediante el contrato definitivo aprobado. Aplicar estructura y semillas técnicas revisadas; nunca cuentas predeterminadas, contraseñas ficticias, tours de ejemplo o datos comerciales. Mantener todos los mecanismos operativos desarrollados y sus verificadores.
3. Ejecutar certificación **T0 antes del bootstrap**: inventario completo de tablas/esquemas, conteos y contenido técnico permitido. Reservaciones, Usuarios, Tours, Guías, Operadores, Vehículos, Operaciones, Transportes, observaciones, Bitácora, eventos, vínculos, equivalencias comerciales, referencias025, recibos y ledgers deben estar vacíos. No basta buscar palabras como SYN o ficticio: cualquier fila comercial impide certificar T0.
4. Permitir únicamente la lista explícita de catálogos técnicos aprobados. En el ensayo actual:2roles funcionales sin cuentas, país No especificado y4plataformas del seeds.sql existente. No convertir tablas adicionales en “técnicas” para admitir datos sin revisión.
5. Mantener FareHarbor/GetYourGuide apagados. Sin fecha de corte, avance confirmado, autor/grant, ejecución, errores/recovery, cursor externo, vínculos ni eventos previos. En los contratos de ensayo018/024 se crean4controles técnicos nuevos: publicación/automation024 por proveedor. Los literales0 y not-applicable-024 son sentinelas del contrato existente, **no cursores externos recuperados**. Se inventarían y revisan expresamente; no se importan estados de laboratorios. Publicación y automatización quedan false antes de T0. La representación definitiva empresarial exige aprobación propia; no se promete modificar esos contratos silenciosamente.
6. Verificar paquetes mediante manifiesto empresarial aprobado, cierre de dependencias, hashes/firma y revisión de archivos/contenidos. Excluir dumps, fixtures, pruebas, probes/drivers, reportes/capturas, perfiles/markers/configuraciones privadas, tokens/secretos y dependencias de laboratorio. Recursos operativos legítimos (por ejemplo logotipo) se permiten sólo en lista aprobada. Las evidencias viven fuera de los ZIP y del directorio de entrega.
7. Crear el primer Administrador por bootstrap seguro de esa instalación, con credencial nominativa capturada y hash de contraseña, sin defaults. Verificar primer acceso desde Electron y roles/backend. Este T1 esperado no invalida el hecho certificado de T0, pero no permite distribuir una cuenta de ensayo como cuenta inicial.
8. Comprobar que pueden darse de alta catálogos y reservaciones con las reglas aprobadas: turno explícito, PAX incluye niños, capacidad24 y12/grupo, roles, auditoría, precondiciones/idempotencia y referencias declaradas. En aceptación de laboratorio sólo se usan datos T1 aislados, que **no se exportan como plantilla**.
9. Conservar certificado, versiones/hashes, conteos T0/T1, responsable y hora fuera del paquete. Si hay contaminación, rechazar y revisar el origen; no ejecutar una limpieza automática ni reutilizar la base poblada de la prueba.
10. Autorizar por separado la carga de datos reales y la instalación en equipos. No activar integraciones hasta su autorización individual y elección posterior de fecha por la empresa. No hay corte preestablecido.

## Carga real independiente — requiere revisión y autorización nominal

Community Tours entregará archivos por canal protegido con inventario/procedencia y SHA256. En un espacio separado se revisarán formato, campos, catálogos, referencias, duplicados, relaciones y privacidad; preparar un dry-run con rechazos y diferencias sin escribir en empresa. No inventar nombres, tours, clientes, códigos externos, turnos por horario o importes para completar faltantes.

La empresa debe aprobar mapeos, responsables, registros aceptados, ventana y respaldo/recuperación. La ejecución deberá usar el backend y sus comandos autorizados, con actor, intención/idempotencia, cupos y auditoría atómicos; ningún INSERT masivo que omita validaciones sin contrato revisado. Referencias humanas siguen declaradas y no se convierten automáticamente en vínculos. Conservar errores para corrección humana, sin fusionar, cancelar o reasignar automáticamente.

Después, conciliar cantidades/identidades y auditar la carga; la base con datos reales deja de ser una plantilla T0 y tendrá evidencia propia de procedencia. Ni datos reales ni sus secretos se incorporan a Git, fixtures, semillas o paquetes. Este proceso sólo se propone: no se ejecutó carga real.

## Certificación y bloqueo vigentes

La certificación del requisito se ensaya en [local-fase-2e6-clean](local-fase-2e6-clean/). Debe separar: limpieza inicial de datos comprobada en laboratorio, primer acceso posterior comprobado, revisión de paquetes y **aprobación empresarial pendiente**. Un dato inicial limpio no certifica que el paquete esté libre de dependencias de laboratorio ni autoriza su instalación.
