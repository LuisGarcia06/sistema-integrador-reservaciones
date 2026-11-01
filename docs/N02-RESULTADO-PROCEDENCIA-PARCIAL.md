# N-02 — Resultado comunicado por el usuario

Registro: 31 de octubre de 2026. VM `Windows11-CommunityTours-Test`.
`synthetic-acceptance-only`; `productionAuthorized=false`.

**Estado: revisión gráfica terminada; evidencia de procedencia parcial.**
No se declara autenticidad, integridad completa, aprobación de N-01 o autorización
de instalación. Esta es una transcripción del resultado comunicado; Codex no accedió
a la VM ni verificó independientemente archivos, firmas o capturas.

| Archivo | Metadatos de versión informados | Tamaño informado (bytes) | Firma visible informada |
| --- | --- | ---: | --- |
| initdb.exe | 18.6 | No indicado en este resultado | No indicado en este resultado |
| postgres.exe | 18.6 | No indicado en este resultado | No indicado en este resultado |
| pg_ctl.exe | 18.6 | No indicado en este resultado | No indicado en este resultado |
| pg_dump.exe | 18.6 | 633344 | Sin firmas visibles |
| pg_restore.exe | 18.6 | 379904 | Sin firmas visibles |
| pg_controldata.exe | 18.6 | 108032 | Sin firmas visibles |

Se conserva por separado el antecedente N-01: para los tres primeros archivos se
informó producto 18.6 y archivo 18.0.6.0. No se extrapola esa versión de archivo
exacta a los otros tres campos no desglosados en la comunicación de N-02.

Instalador original localizado: `postgresql-18.6-5-windows-x64.exe`, **414966472 bytes**.
Firmante mostrado: **EnterpriseDB Corporation**. Estado literal de Windows:
«Esta firma digital es correcta». Aparece en el historial de Microsoft Edge, pero
su URL de origen no es visible. La ruta completa del original no fue comunicada.

Según el usuario, no se ejecutaron archivos PostgreSQL ni se modificaron instalaciones
o servicios. No se recibieron SHA256 ni una comparación contra archivos de referencia.
La ausencia de firma visible individual no se registra como archivo falso ni como
prueba de legitimidad. La firma del instalador no acredita por sí sola que los seis
archivos instalados correspondan a su contenido. La URL histórica sigue desconocida.

El siguiente procedimiento preparado es
[N-03: hashes, cabeceras PE y vínculo de procedencia](PRUEBA-NATIVA-03-HASHES-PE-PROCEDENCIA.md).
Está pendiente de revisión y ejecución manual. No autoriza descargar, extraer o
ejecutar instaladores, aprovisionar PostgreSQL, crear servicios o construir paquetes.
Siguen pendientes las garantías de opción C y la aceptación funcional real.
