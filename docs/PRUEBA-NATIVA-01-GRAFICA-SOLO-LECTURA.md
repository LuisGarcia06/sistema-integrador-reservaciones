# N-01 — Primera comprobación gráfica de la VM, solo lectura

Estado: **procedimiento preparado; pendiente de ejecución manual por el usuario**.
Alcance: `synthetic-acceptance-only`, `productionAuthorized=false`.
Destino exclusivo: `Windows11-CommunityTours-Test` en Oracle VirtualBox.

## Qué se ejecutará, permisos y efectos

Esta primera prueba identifica el entorno antes de preparar o ejecutar un
componente nuevo. Usa únicamente aplicaciones ya incluidas en Windows:

| Aplicación | Qué se consulta | Permisos y efectos |
| --- | --- | --- |
| Configuración | Edición, versión, compilación y arquitectura | Sesión habitual, sin ejecutar como administrador. Solo lectura de esos datos |
| Información del sistema | Identidad Windows y fabricante/modelo de la VM | Consulta local. Sin exportar ni guardar informes |
| Explorador de archivos | Propiedades de los ejecutables PostgreSQL existentes | Lee metadatos. **No abrir ni ejecutar los archivos EXE** |
| Servicios, opcional | Nombres y estados de servicios PostgreSQL existentes | Consulta, si Windows la permite sin elevar. No iniciar, detener o reconfigurar |

No se instala nada, no se ejecutan `initdb.exe`, `pg_ctl.exe` o `postgres.exe`,
no se crean carpetas de datos, usuarios, servicios, certificados o bases. No se
abre PowerShell, CMD, Registro, un terminal ni el cuadro Ejecutar. No se introducen
comandos. No se cambian políticas, antivirus, permisos o configuración.

Las aplicaciones Windows pueden generar sus registros/cachés normales. No se
solicita una escritura de datos de Community Tours o PostgreSQL ni guardar informes.
Las capturas que el usuario decida compartir son los únicos resultados solicitados.

**Límite de la prueba:** confirma metadatos visibles del entorno. No comprueba aún
SID/token restringido, ACL efectivas, hashes, política Restricted efectiva, clúster
exclusivo, T0 ni instalación funcional. No equivale a aprobación del componente.

## Punto de conservación disponible

Antes de esta prueba se creó una instantánea nueva y se arrancó la VM autorizada:

- Nombre: `Antes-OpcionC-20261031-ValidacionNativa`.
- UUID de instantánea: `a9261183-18f2-42f3-bb7c-3b4601e2fc8d`.
- UUID de VM: `fe085380-cd46-409c-841a-d35c4894a9af`.

No se restauró ninguna instantánea ni se sustituyeron las anteriores. **No es
necesario restaurar esta instantánea para hacer N-01.** La última comprobación
indicaba VM arrancada; el usuario verificará su estado actual visualmente.

El acceso de interfaz de Codex falló antes de poder controlar Windows. A partir
de la autorización manual, todas las interacciones del invitado las realiza el
usuario. No se utilizará Guest Control, RDP, SSH u otro acceso remoto adicional.

## Procedimiento

### 1. Asegurar que estás dentro de la VM correcta

1. En Oracle VirtualBox, selecciona `Windows11-CommunityTours-Test`.
2. Si ya está encendida, abre su ventana con **Mostrar**. Si está apagada, puedes
   iniciarla normalmente; no selecciones Restaurar, Reiniciar o Descartar estado.
3. Confirma que el título de la ventana corresponde a esa VM.
4. Realiza el resto de pasos dentro de esa ventana, nunca en el escritorio del
   Windows 10 anfitrión. Usa tu sesión habitual; no compartas credenciales.

Resultado esperado: escritorio de la VM correcta. Si no puedes identificarla con
seguridad, detén la prueba.

### 2. Confirmar Windows 11 Home x64

1. Dentro de la VM, abre **Inicio → Configuración → Sistema → Acerca de**.
2. Lee, sin editar:
   - Edición de Windows.
   - Versión.
   - Compilación del sistema operativo.
   - Tipo de sistema: sistema operativo de 64 bits y procesador x64.
3. Anota esos cuatro datos o toma una captura recortada de ellos. Evita incluir
   identificadores de dispositivo/producto, nombre del equipo o datos de cuenta.

Resultado esperado: Windows 11 de la familia Home y arquitectura x64. Copia el
nombre literal de la edición, aunque tenga un sufijo. Si aparece otra edición,
ARM64 o Windows 10, no cambies nada: informa el resultado y detén la prueba.

### 3. Corroborar que el sistema es la VM de VirtualBox

1. Abre **Inicio** y busca **Información del sistema**.
2. Ábrela normalmente; no elijas Ejecutar como administrador.
3. En **Resumen del sistema**, localiza:
   - Nombre del sistema operativo y versión.
   - Fabricante del sistema.
   - Modelo del sistema.
   - Tipo de sistema.
4. Anota solo esas filas o toma una captura recortada. No exportes el informe
   completo ni compartas nombres de usuario, equipo, rutas personales o números
   de serie.

Resultado esperado: Windows 11, sistema basado en x64 y modelo VirtualBox,
habitualmente con fabricante Oracle o innotek. Si los datos no coinciden, conserva
la observación; no intentes cambiar la configuración de VirtualBox.

### 4. Leer las versiones de archivos PostgreSQL, sin ejecutarlos

1. Abre **Explorador de archivos** dentro de la VM.
2. Navega a **Este equipo → Disco local (C:) → Archivos de programa → PostgreSQL
   → 18 → bin**.
3. Si esa ruta no existe, anota **No encontrado** y termina este paso. No busques
   instaladores ni instales otra copia para continuar.
4. En `initdb.exe`, haz clic derecho → **Propiedades → Detalles**. No hagas doble
   clic ni selecciones Abrir/Ejecutar como administrador.
5. Lee **Versión del producto**, **Versión del archivo** y **Nombre del producto**.
   Copia los valores literales o captura únicamente esos campos.
6. Cierra Propiedades y repite la lectura para `postgres.exe` y `pg_ctl.exe`.

Resultado esperado: metadatos compatibles con PostgreSQL 18.3 en los tres archivos.
Una versión con sufijo de compilación se registra literalmente; no se interpreta
como aprobada sin revisarla. Si faltan los campos o son distintos, anota el caso.

Estos metadatos no prueban autenticidad ni integridad. No se ejecuta `--version`
ni se presupone que una firma ausente/presente resuelva la revisión. Los hashes y
la procedencia quedan para una prueba posterior revisada.

### 5. Inventario visual de servicios existentes — opcional

1. En **Inicio**, busca **Servicios** y abre la aplicación si permite consulta
   normal. Si solicita elevación o no permite acceso, cancela y anota **Pendiente
   por permisos**; no hace falta elevar para completar el resto de N-01.
2. Localiza servicios cuyo nombre contenga PostgreSQL o Community Tours.
3. Lee únicamente el nombre visible y el estado actual.
4. No pulses Iniciar, Detener, Reiniciar o Pausar. No cambies tipo de inicio,
   cuenta o contraseña, ni abras configuración de credenciales.

Resultado esperado: inventario de lo que ya existe. Un servicio PostgreSQL
existente puede estar arrancado desde el inicio de Windows; no se detiene ni se
reutiliza para la futura instalación exclusiva. La ausencia del futuro servicio
Community Tours tampoco es un error en esta etapa.

## Cuándo detenerse

- No estás seguro de estar dentro de la VM correcta.
- Aparece una alerta antivirus o un aviso de ejecución de software nuevo. No
  autorices, excluyas o restaures nada; informa el texto visible.
- Un paso necesita elevación, permisos nuevos o cambios de configuración: cancela
  ese paso y registra que quedó pendiente.
- Se abre por accidente un ejecutable PostgreSQL o se cambia un servicio. No
  compenses con otros comandos o cambios; informa qué ocurrió antes de continuar.
- No coinciden Windows/arquitectura/versiones. No descargues ni repares componentes
  dentro de esta prueba.

## Resultado que puedes compartir

Puedes responder con este formato o enviar las capturas recortadas indicadas:

```text
N-01 — resultado manual
VM: Windows11-CommunityTours-Test
Edición Windows:
Versión y compilación:
Tipo de sistema:
Fabricante / modelo:
initdb.exe — producto / versión de producto / versión de archivo:
postgres.exe — producto / versión de producto / versión de archivo:
pg_ctl.exe — producto / versión de producto / versión de archivo:
Servicios existentes y estado (opcional):
Pasos pendientes / alertas:
¿Se ejecutó algún EXE PostgreSQL o se cambió algo accidentalmente?:
```

No incluyas contraseñas, claves, archivos `.env`, contenido de bases o identificadores
personales. Si no hay un dato, indica **No visible** o **Pendiente**.

## Puerta posterior

Con esos resultados se revisará la primera herramienta nativa nueva: alcance,
permisos, efectos, procedencia y hashes antes de pedir su ejecución manual.
La autorización de opción C ya está registrada; no se exigirá volver al modelo
DEBUG_PROCESS para inspeccionar individualmente a todos los descendientes.

No se pasa a aprovisionamiento PostgreSQL por haber completado N-01. La verificación
independiente del primer token, ACL/identidad, contención y pruebas de fallos siguen
pendientes. **Todavía no está aprobada la instalación manual de candidate-05 o
setup-03, que no han sido generados.**
