# Evidencia N-02 y preparación N-03

Registro del 31 de octubre de 2026. `synthetic-acceptance-only`;
`productionAuthorized=false`.

- `n02-observation.json`: solo hechos comunicados por el usuario. Metadatos de
  seis archivos; tres tamaños y ausencia de firmas visibles; nombre, tamaño y
  firma mostrada del instalador. Los campos desconocidos permanecen null o
  not-reported; no se presume URL, hash o autenticidad. Revisión gráfica finalizada,
  procedencia parcial, sin aprobación de instalación.
- `published-references.json`: hashes publicados en la respuesta de un Contributor
  en el repositorio EnterpriseDB/edb-installers, issue 746, con límites de atribución.
  No son hashes obtenidos de la VM ni un manifiesto firmado. No se descargó EXE/ZIP.
- `procedure-syntax.json`: análisis AST de tres grupos de comandos del procedimiento
  N-03 por el parser PowerShell del anfitrión. **Solo análisis de texto**, sin invocar
  esos comandos ni leer archivos PostgreSQL. No demuestra funcionamiento en Windows 11.
- `preservation.json`: las 39 entradas del inventario anterior coinciden y se
  verificaron de nuevo los paquetes, asistentes y evidencia histórica de cuarentena.
  No se reescribió el inventario anterior ni se modificó código de aplicación.
- `SHA256SUMS.txt`: inventario nuevo de estos registros y los dos documentos nuevos.

Documentos: `docs/N02-RESULTADO-PROCEDENCIA-PARCIAL.md` y
`docs/PRUEBA-NATIVA-03-HASHES-PE-PROCEDENCIA.md`.

No se ejecutó N-03, PostgreSQL o el prototipo en cuarentena. No se accedió a la VM,
modificaron instalaciones, servicios, políticas, antivirus o bases, ni se construyeron
instaladores. Las 285 pruebas anteriores siguen siendo evidencia histórica de
contratos; no se repitieron ni se presentan como aceptación de este diagnóstico.

N-03 prepara lectura interactiva manual sin elevación ni archivos .ps1. Detiene
ante una política distinta de Restricted, modo que impida lectura .NET o cualquier
error de permisos/integridad; no propone relajar controles. Sus hashes locales y
cabeceras no completan la procedencia por archivo sin una referencia autenticada.
La obtención/lectura de ese manifiesto o ZIP queda sujeta a procedimiento adicional.
Permanecen bloqueados aprovisionamiento y candidate-05/setup-03.
