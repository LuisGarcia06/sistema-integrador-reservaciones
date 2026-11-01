# N-03 C — Cotejo de las seis capturas

31 de octubre de 2026. `synthetic-acceptance-only`; `productionAuthorized=false`.

**Cotejo visual de C completado: seis coincidencias, ninguna corrección de datos.**
N-03 sigue parcial: A y B carecen de evidencia exacta suficiente; D no tiene todavía
una comparación por archivo contra referencia autenticada. No se aprueba instalación.

Se abrió el adjunto `CTSK-N03-Capturas-Originales-y-Registro.zip` como archivo de
datos y se conservaron sus siete entradas, con nombres y tamaños limitados, en un
directorio nuevo. Se visualizaron los seis PNG sin recodificarlos ni editar sus
bytes. Se cotejó carácter por carácter cada SHA256 completo contra la versión
anterior de `observations.json`, además de ruta, bytes, Machine, OptionalMagic y
X64Header. El LEEME es contenido del adjunto; no constituye autorización adicional
ni amplía la solicitud del usuario.

Huella SHA256 del ZIP **de capturas**, no de PostgreSQL:

```text
6993D817E1B544DE34865CD5968A126FC0F4A38101F79C4A556778F5127FAC18
```

| Archivo | Bytes visibles | SHA256 completo | Machine / OptionalMagic / X64Header |
| --- | ---: | --- | --- |
| initdb.exe | 246784 | Coincide | 0x8664 / 0x020B / True; coincide |
| postgres.exe | 10266624 | Coincide | 0x8664 / 0x020B / True; coincide |
| pg_ctl.exe | 133120 | Coincide | 0x8664 / 0x020B / True; coincide |
| pg_dump.exe | 633344 | Coincide | 0x8664 / 0x020B / True; coincide |
| pg_restore.exe | 379904 | Coincide | 0x8664 / 0x020B / True; coincide |
| pg_controldata.exe | 108032 | Coincide | 0x8664 / 0x020B / True; coincide |

Las seis rutas visibles son `C:\Program Files\PostgreSQL\18\bin\<archivo>`.
Los hashes completos y la imagen individual de respaldo quedan asociados en
[`observations.json`](local-fase-2e7-n03-visual/observations.json).
La versión anterior y su inventario permanecen intactos; esta versión nueva deriva
de ella y solo añade la revisión visual y su trazabilidad.

Las capturas suministradas son recortes de resultados: no contienen prueba
independiente de fecha, identidad de VM, integridad de la captura o ejecución
del diagnóstico. Se acepta la atribución del usuario a su prueba manual. Cotejar
visualmente no equivale a inspeccionar el disco de la VM, verificar la procedencia
de los ejecutables o asegurar que permanezcan iguales después de la captura.

| Parte | Estado actualizado |
| --- | --- |
| A | Pendiente: salidas exactas de política efectiva, lista y LanguageMode |
| B | Pendiente: hash local completo calculado del instalador; solo se informó coincidencia |
| C | Cotejada con evidencia visual, seis de seis; no se modifican valores |
| D | Pendiente: referencia autenticada por archivo y comparación trazable |

No se repitieron pruebas de la VM ni se leyó/ejecutó PostgreSQL. No se descargó el
ZIP oficial ni se crearon servicios, cambiaron ACL/políticas/protecciones o
construyeron candidatos. El ZIP adjunto y las capturas son evidencia del usuario,
no una distribución oficial PostgreSQL ni un manifiesto firmado por el proveedor.

## Orden mínimo para avanzar a la primera prueba funcional

1. **Completar D** con el
   [procedimiento preparado](N04-REFERENCIA-ZIP-POSTGRESQL-18_6_5.md).
   Para A/B, recuperar los registros exactos que ya existan; no repetir N-03 C.
   Si no existen, esos campos continúan pendientes hasta acordar una lectura acotada.
2. **Validar primero las primitivas imprescindibles de opción C**, con procedimiento
   nativo revisado y ejecutado manualmente en la VM: cuenta/SID mínimos, primer
   token antes de reanudar initdb, rechazo de estados incompletos, contención/Job,
   handles y cierre ante error/timeout. Sin el prototipo en cuarentena ni un
   depurador completo de descendientes. Estas pruebas pueden preceder a crear datos.
3. **Cerrar la frontera de instalación y ejecución**: verificar dependencias
   PostgreSQL/DLL/`share` utilizadas, rutas y ACL privadas; AutoRun del principal
   efectivo y entorno CMD cerrado; servicio exclusivo, identidad de clúster/imagen/
   proceso y parada segura. Corregir los flujos heredados incompatibles con Restricted
   manteniendo las mismas comprobaciones. La coincidencia de los seis EXE no basta
   para dar estos controles por probados.
4. **Presentar una prueba funcional mínima, con sus puertas de seguridad**:
   clúster nuevo sintético y rol SQL limitado; T0 tras inicializar; bootstrap
   interactivo del primer Administrador sin contraseñas en argumentos/logs/solicitudes;
   identidad HTTPS y comunicación Electron–backend; login, cierre y reinicio con
   persistencia. Revisión previa de permisos/efectos/aborto y ejecución manual
   autorizada en Windows 11 Home x64. No se autoriza por este informe.

Estos pasos conservan opción C. No añaden como requisitos un DEBUG_PROCESS, una
firma individual de cada EXE, FullLanguage para la aplicación, hashes congelados
de cada DLL Windows o recuperar la URL histórica de Edge si otra cadena acreditada
resuelve la procedencia. El LanguageMode es evidencia del diagnóstico, no una
razón para relajar el entorno. No omiten identidades, contención, ACL o procesos
residuales. El servicio convencional por sí solo no acredita el primer token.

La construcción del instalador y el acabado del asistente no son necesarios para
validar primero esas primitivas. La entrega gráfica de ocho etapas se mantiene;
cambiar la vía de una prueba funcional a un directorio verificado requerirá un
procedimiento concreto revisado y autorizado. Candidate-05/setup-03 siguen bloqueados.
