# N-02 — Lectura gráfica de procedencia de PostgreSQL 18.6

31 de octubre de 2026. Procedimiento preparado para revisión y ejecución **manual**
por el usuario en Oracle VirtualBox, VM `Windows11-CommunityTours-Test`.
`synthetic-acceptance-only`; `productionAuthorized=false`.

Esta prueba continúa la lectura parcial de N-01. No aprueba N-01, la procedencia
completa ni la instalación. No autoriza aprovisionamiento.

## Qué se abrirá, permisos y efectos

Solo Explorador de archivos y sus diálogos de Propiedades, detalles de firmas y
certificados, si están disponibles. Opcionalmente se consultará la entrada del
historial de descargas del navegador correspondiente al instalador original.
Se requiere una sesión normal de Windows 11, **sin elevación**. Si aparece una
solicitud UAC o acceso denegado, cancelar y registrar el punto pendiente.

No abrir mediante doble clic ningún ejecutable PostgreSQL ni su instalador.
No ejecutar `--version`, comandos, PowerShell, scripts o auxiliares propios.
No abrir pgAdmin, iniciar/parar servicios ni cambiar permisos, políticas,
certificados o protecciones. No usar «Desbloquear», «Importar certificado»,
«Instalar certificado» ni opciones de reparación. No instalar ni descargar nada.

La lectura no debe modificar PostgreSQL ni las bases existentes. Los visores o
el navegador pueden actualizar su estado de interfaz/caché; Windows puede intentar
consultar la cadena o revocación de un certificado al mostrar su estado. Si falta
conectividad, registrarlo; no cambiar confianza ni seguridad para obtener «válida».
No se permite acceso remoto ni control automatizado de la VM.

## Pasos y resultados esperados

1. **Confirmar la VM.** Revisar el título de la ventana de VirtualBox. Si no es
   `Windows11-CommunityTours-Test`, detenerse. No realizar los pasos en Windows 10.
2. **Localizar los archivos.** Dentro de la VM abrir el Explorador e introducir
   únicamente la ruta de carpeta `C:\Program Files\PostgreSQL\18\bin` en su barra.
   Activar visualización de extensiones si hace falta para distinguir archivos.
   No introducir una ruta de ejecutable en «Ejecutar» o en una consola.
3. **Completar las seis lecturas.** Para cada archivo de la tabla, seleccionarlo
   y pulsar **Alt+Entrar**. En **General** comprobar ubicación y tamaño; en
   **Detalles**, producto, versión del producto, versión del archivo y nombre
   original, si existe. Cerrar Propiedades antes del siguiente. Se espera producto
   PostgreSQL, producto **18.6**, archivo **18.0.6.0**. La fecha no prueba versión
   ni autenticidad. Registrar valores literales, incluso discrepancias o campos
   ausentes; no corregir archivos.
4. **Leer firmas, si existen.** En Propiedades, pestaña **Firmas digitales**,
   seleccionar la firma y abrir **Detalles**. Registrar el nombre exacto del
   firmante, estado literal y fecha/sello de tiempo cuando se muestre. Se puede
   consultar el certificado y su cadena; no importarlo. Capturar errores de
   confianza, revocación o caducidad tal como aparecen. Si no existe esa pestaña,
   registrar «sin pestaña visible», no «falso» ni «verificado».
5. **Identificar la distribución original, sin ejecutarla.** Si todavía está
   disponible su instalador/archivo original, localizarlo en el Explorador y leer
   sus Propiedades de igual manera: nombre completo, tamaño, versión, firmante y
   estado. No cambiar atributos ni restaurar archivos eliminados o en cuarentena.
   Si no existe, registrar «original no disponible» y continuar solo el registro.
6. **Relacionar origen y distribución.** Si está disponible, consultar únicamente
   la entrada del historial de descargas de ese archivo: nombre y dominio/URL de
   origen. No compartir historial completo, tokens de URL, credenciales o datos
   personales. PostgreSQL enlaza el instalador Windows y archivo de binarios de
   EDB en su [página oficial](https://www.postgresql.org/download/windows/).
   Ese enlace identifica una vía de distribución; no demuestra que los archivos
   instalados procedan de ella. No deducir ni inventar el editor esperado.
7. **Cerrar y comunicar lecturas.** Entregar la tabla y los resultados de origen,
   con capturas recortadas cuando aporten evidencia. Si hay una discrepancia,
   firma inválida o indicio de manipulación, detener cualquier continuación de
   pruebas ejecutables y comunicarlo antes de proponer otra prueba.

| Archivo | Producto/versión | Versión archivo | Tamaño bytes | Firmante/estado literal |
| --- | --- | --- | --- | --- |
| initdb.exe | 18.6 informado en N-01; releer o confirmar | 18.0.6.0 informado | Pendiente | Pendiente |
| postgres.exe | 18.6 informado en N-01; releer o confirmar | 18.0.6.0 informado | Pendiente | Pendiente |
| pg_ctl.exe | 18.6 informado en N-01; releer o confirmar | 18.0.6.0 informado | Pendiente | Pendiente |
| pg_dump.exe | Pendiente | Pendiente | Pendiente | Pendiente |
| pg_restore.exe | Pendiente | Pendiente | Pendiente | Pendiente |
| pg_controldata.exe | Pendiente | Pendiente | Pendiente | Pendiente |

Información adicional a devolver: VM correcta (sí/no); carpeta observada;
instalador original (nombre o no disponible); origen conocido (dominio/URL sin
secretos o desconocido); firma del original (estado literal o no visible);
solicitudes UAC/acceso denegado; cualquier diferencia. No enviar contraseñas.

## Cómo se evaluará la evidencia

- **Lectura consistente:** las seis herramientas coinciden y no aparecen errores
  de firma donde haya firma disponible. Es avance documental, no aprobación.
- **Procedencia parcial:** falta el original, no hay firma visible o no se puede
  verificar su cadena/origen. Queda pendiente; no se presume autenticidad ni se
  descarta automáticamente un archivo legítimo sin firma individual.
- **Discrepancia/bloqueo:** versiones mezcladas, ubicación diferente sin explicar,
  firma explícitamente inválida o procedencia incompatible. No ejecutar ni reparar;
  revisar la evidencia antes de continuar.

Propiedades de Windows no proporciona por sí sola SHA256, arquitectura PE y cierre
de DLL/archivos `share`, ni demuestra que un binario instalado coincida con una
distribución autenticada. Tampoco una firma válida demuestra esa relación completa.
**Esta prueba no calcula hashes ni declara esa verificación superada.** Una futura
lectura de hashes/PE/dependencias requerirá otro procedimiento acotado y revisado,
sin ejecutar los archivos examinados. Si no existe una vía autorizada, ese punto
seguirá bloqueado; no se usará una descarga o hash supuesto como sustituto.

Siguen pendientes primer token independiente previo a initdb, contención, ACL,
AutoRun del principal efectivo, entorno CMD, identidad real del clúster, servicio,
parada y recuperación. N-02 no consulta esos estados ni prueba PowerShell Restricted.
No se construirá candidate-05/setup-03 ni se ejecutará PostgreSQL con este resultado.
