# N-01 — Diferencia PostgreSQL 18.6 frente al contrato 18.3

31 de octubre de 2026. Alcance `synthetic-acceptance-only`,
`productionAuthorized=false`. Revisión estática y de inventarios, sin acceso
remoto a la VM ni ejecución de PostgreSQL.

## Resultado

**Sí afecta a los contratos de compatibilidad y al prerrequisito esperado. No
demuestra una alteración de los inventarios del candidato.** No se cambia
automáticamente la versión autorizada ni se aprueba N-01.

El usuario informó lectura manual de propiedades del archivo de la VM:

| Dato | Observación |
| --- | --- |
| Archivo | `C:\Program Files\PostgreSQL\18\bin\initdb.exe` |
| Producto | PostgreSQL |
| Versión de producto | 18.6 |
| Versión de archivo | 18.0.6.0 |
| Acciones realizadas según el usuario | Solo consulta; ningún EXE ejecutado y PostgreSQL no modificado |

El recurso de versión Windows oficial usa major, 0, minor, 0. Por eso 18.0.6.0
es coherente con 18.6: no es una segunda versión contradictoria.
[Recurso Windows REL_18_6](https://github.com/postgres/postgres/blob/REL_18_6/src/port/win32ver.rc).
Los metadatos no acreditan procedencia, hash, firma, versión de otros ejecutables
o versión de un servidor que pudiera estar en ejecución. Todo eso sigue pendiente.

## Contratos afectados, confirmados en fuentes y paquetes conservados

| Lugar | Restricción actual | Consecuencia con 18.6 |
| --- | --- | --- |
| `scripts/enterprise026Provision.cjs`, `tool()` | Salida de herramienta debe coincidir con 18.3 | Rechazo `PROVISION_TOOL_VERSION` en esa comprobación |
| Mismo aprovisionador | Genera configuración `DB_SERVER_VERSION: '18.3'` | Cambiar solo una comprobación no actualiza el contrato completo |
| `scripts/windows-installers/server-control.cjs` | Comprueba seis utilidades contra 18.3 | Rechazo `POSTGRES_PREREQUISITE_VERSION` al llegar a esa puerta |
| `scripts/windows-setup/coordinator.cjs` | Verifica seis utilidades contra 18.3 | No aprueba el prerrequisito; error público START_FAILED |
| `backend/config/enterprise026Policy.js`, `validateConfig()` | Exige DB_SERVER_VERSION 18.3 | Rechaza configuración 18.6 |
| Mantenimiento e identidad de ejecución en esa política | Exigen server_version_num 180003 | Un servidor 18.6 reportaría 180006 y no satisfaría esas puertas |
| UI, documentación, evidencia y fuentes oficiales revisadas | Referencia a 18.3/REL_18_3 | No se trasladan sus conclusiones automáticamente a 18.6 |

También se comprobaron estas exigencias dentro del servidor candidate-04 y de
setup-02 conservados. No se ejecutaron para comprobar el rechazo. Otros bloqueos
anteriores, como PowerShell Restricted, pueden producirse antes: esta revisión no
afirma un orden real de errores en la VM.

Los controles de la configuración principal, como `desktopPostgres.js`, también
tienen versiones fijadas. **No se propone un reemplazo global** que altere el
entorno principal o las dos bases protegidas del anfitrión.

## Qué ocurre con los inventarios

El informe de construcción de candidate-04 declara `postgresIncluded:false` en
servidor y cliente. PostgreSQL en `C:\Program Files\PostgreSQL\18\bin` es un
prerrequisito externo: sus archivos no se incorporaron al inventario cerrado de
los paquetes Community Tours. Setup-02 tiene asimismo un inventario de sus
propios archivos, no de toda la instalación PostgreSQL externa del invitado.

Por tanto pueden coexistir estas dos situaciones:

- Los paquetes Community Tours siguen coincidiendo con sus inventarios y hashes.
- El PostgreSQL externo observado no satisface su prerrequisito exacto de versión.

Se verifican otra vez los inventarios y hashes de los artefactos anteriores desde
el repositorio del anfitrión. Esta comprobación no certifica copias instaladas en
la VM ni calcula el hash del initdb externo. No hubo interacción con el invitado.

No se deben corregir archivos instalados, inventarios o configuraciones firmadas
para hacerlos pasar como 18.3. Tampoco cambiar el texto visible de la versión,
ampliar el filtro a cualquier 18.x o reutilizar el servicio existente.
Candidate-05 y setup-03 todavía no están generados.

## Recomendación de versión, pendiente de autorización

PostgreSQL 18.6 pertenece a la misma versión mayor 18. La política del proyecto
recomienda la versión menor actual y las notas de 18.6 incluyen correcciones de
seguridad. La compatibilidad general de actualizaciones menores no sustituye
nuestros contratos exactos ni pruebas.
[Política de versiones](https://www.postgresql.org/support/versioning/),
[notas 18.6](https://www.postgresql.org/docs/release/18.6/).

Recomiendo **evaluar 18.6 para el futuro candidato experimental**, en lugar de
degradar o reinstalar PostgreSQL para satisfacer la expectativa histórica.
No se solicita migrar ni modificar ningún clúster existente.

Antes de ejecutar pruebas o aprovisionar con esa versión se necesita autorización
expresa para cambiar el objetivo experimental 18.3 → 18.6 y extender a 18.6 la
excepción limitada de CMD interno, que fue autorizada específicamente para 18.3.
No se presume esa extensión por tratarse de una versión menor.

Si se autoriza, el mínimo trabajo comprende:

1. Identificar el conjunto completo de utilidades y dependencias instaladas en
   la VM; comprobar versiones coherentes, procedencia y hashes, no solo initdb.
2. Fijar y revisar las fuentes oficiales 18.6 de reducción de token, initdb,
   pg_ctl y wrappers CMD antes de reutilizar conclusiones anteriores. Una lectura
   inicial de `restricted_token.c` 18.6 sigue mostrando la rama de error con
   continuación; no se considera resuelto el requisito del primer token.
   [Fuente 18.6](https://github.com/postgres/postgres/blob/REL_18_6/src/common/restricted_token.c).
3. Derivar fuentes nuevas para candidate-05 con un contrato de versión coherente
   en herramientas, configuración, identidad SQL y pruebas. No editar candidate-03,
   candidate-04, asistentes ni inventarios anteriores.
4. Registrar la identidad de la dependencia externa PostgreSQL de manera explícita,
   aparte de la integridad del código propio, y conservar la autorización de opción C.
5. Mantener las puertas nativas pendientes: primer token, Job, ACL, identidad,
   parada, recuperación y aceptación real. Cambiar de versión no las acredita.

## Cómo continuar N-01 ahora

Registrar esta parte como **observada con discrepancia de versión, no aprobada**.
Puede completarse únicamente la lectura de Propiedades → Detalles de
`postgres.exe` y `pg_ctl.exe` y, si se desea, las otras tres utilidades ya citadas:
`pg_dump.exe`, `pg_restore.exe`, `pg_controldata.exe`. Copiar los valores literales,
sin abrir/ejecutar archivos y sin instalar o reparar nada. Esta es continuación
de inventario visual, no aceptación de 18.6 como objetivo.

Si aparecen versiones mezcladas, registrar cada una y detener el paso posterior;
no sustituir archivos manualmente. No ejecutar los asistentes antiguos ni pasar
a pruebas nativas/provisionamiento hasta resolver el contrato autorizado.

## Cambios de esta revisión

Solo este informe y evidencia complementaria en
`docs/local-fase-2e7-optionc-manual/n01-version-observation.json`,
`n01-version-preservation.json` y `n01-version-SHA256SUMS.txt`.
El estado/evidencia anterior de N-01 se conserva como antecedente; este informe
registra una observación parcial posterior, no una ejecución completa aprobada.
No se modificó código, prueba, configuración, inventario histórico, versión
instalada, base, servicio, política o antivirus. No se ejecutaron pruebas nuevas
de producto: la comprobación fue estática y de integridad de artefactos.
