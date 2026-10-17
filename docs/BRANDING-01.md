# BRANDING-01 — Diagnóstico visual e identidad corporativa

> Cierre posterior: el usuario aprobó visualmente Electron y los dos documentos
> en la solicitud BRANDING-05 + GITHUB. Este informe conserva la evidencia de
> su fase; el estado final se documenta en [BRANDING-05](BRANDING-05.md).

Proyecto: Sistema Integrador de Reservaciones — Community Tours Sian Ka’an.
Fecha: 16 de octubre de 2026, America/Cancun.
Base revisada: rama GYG+FRHB-implementado, posterior a GITHUB-03.

## 1. Resultado y límites del diagnóstico

El proyecto está preparado técnicamente para iniciar BRANDING-02 con autorización.
La recomendación es ampliar el sistema existente de variables y componentes,
conservar las estructuras de las pantallas y utilizar los cinco colores oficiales
como primitivas institucionales. No conviene añadir otro tema que compita con
variables.css. La integración gráfica necesita todavía el archivo maestro del
logotipo oficial: no se encontró entre los recursos fuente accesibles.

Esta fase solo produce este informe. No se modificaron estilos, HTML/JavaScript
de producto, funcionalidades, permisos, integraciones, credenciales, instaladores
ni bases de datos. No se aplicaron migraciones, no se modificaron reservaciones
y no se realizaron commits ni push. WhatsApp continúa deshabilitado.

La revisión combina:

- Lectura de AGENTS.md, los cinco CSS, el HTML principal, los renderizadores de
  las nueve pantallas, layout, UI, router y los puntos reales de impresión/PDF.
- Inventario de recursos gráficos y fuentes, más revisión del ZIP de Stitch.
- Cálculos de contraste sRGB y comparación con criterios WCAG 2.2.
- Capturas y estilos calculados en Electron oculto, usando una copia privada
  del harness existente con HTTP simulado, datos sintéticos y perfil temporal.
- Inspección visual y tipográfica de un Daily PDF sintético ya existente de
  ACCESS-SCOPE-04B. No se creó un nuevo PDF ni se conectó el backend a PostgreSQL.

Las capturas no representan datos de la empresa. El texto «Datos reales» del
Dashboard es un literal del renderizador y no cambia el carácter sintético del
fixture. Solo login, Dashboard y Reservaciones tuvieron capturas específicas;
las demás pantallas se inspeccionaron en código. La muestra PDF tiene una sola
página: no demuestra el comportamiento de documentos extensos. Este diagnóstico
no certifica conformidad WCAG completa, PDF/UA ni impresión física.

## 2. Inventario de archivos y arquitectura actual

Orden de carga en frontend/index.html: variables.css, base.css, layout.css,
components.css y pages.css. No hay theme.css, recursos gráficos de marca locales,
@font-face ni estilos inline en los nueve renderizadores de páginas revisados.
La interfaz usa clases compartidas y JavaScript sin framework.

| Archivo | Líneas actuales | Responsabilidad y observación |
| --- | ---: | --- |
| frontend/css/variables.css | 54 | 46 variables de color, tipografía, espaciado, radios y dimensiones. Primera fuente del tema. |
| frontend/css/base.css | 131 | Reset, tipografía, controles, foco, tablas, selección y scrollbar. Influye también en impresión. |
| frontend/css/layout.css | 244 | Shell, sidebar, header, marca textual, usuario y breakpoint de 1100px. |
| frontend/css/components.css | 265 | Botones, tarjetas, badges, formularios, mensajes, filtros y tablas compartidos. |
| frontend/css/pages.css | 2686 | Variantes por módulo, diálogos, paginación, responsive y dos salidas de impresión. |
| frontend/index.html | — | Shell único, orden de estilos y carga de scripts; no contiene un logo. |
| frontend/js/layout.js | 157 | Navegación filtrada por permisos, marca SK y header. |
| frontend/js/ui.js | — | Escape de HTML, fechas/importes y estados vacíos reutilizables. |
| frontend/js/auth.js, router.js, api.js | — | Contratos que deben conservarse; no son el lugar para definir branding. |
| electron/main.js | 493 | Ventana, permisos IPC, generación/guardado PDF y arranques protegidos. |
| electron/preload.js | 11 | desktopAPI.exportDailyPdf y canal daily:export-pdf. |
| backend/services/daily.service.js | — | Datos y agrupación del Daily; no dibuja PDF ni debe modificarse por branding. |

### Pantallas

| Archivo | Estructura actual | Intervención visual futura y precaución |
| --- | --- | --- |
| frontend/pages/login.js | Bloque SK + nombre, formulario centrado de 440px, correo, contraseña y mensaje. | Logo oficial sobre blanco, jerarquía de marca y foco; conservar IDs, autocomplete y envío de login. |
| frontend/pages/dashboard.js | Métricas, resumen parcial, recientes, salidas, acciones e integración en diálogos. | Unificar tarjetas y acentos; no mostrar planificación global ni integraciones a selected. |
| frontend/pages/reservaciones.js | Filtros, tabla ancha, paginación, formularios, detalle e impresión individual. | Corregir distribución de filtros y jerarquía de acciones; conservar búsquedas, estado de filtros y paginación. |
| frontend/pages/historial.js | Filtros, tabla, paginación compartida y diálogo de detalle. | Reutilizar tabla/detalle y estados; no habilitar la pantalla para selected. |
| frontend/pages/usuarios.js | Tabla, formulario, cambio de contraseña y controles de alcance/plataformas. | Claridad entre rol y alcance; mantener validación y controles administrativos. |
| frontend/pages/daily.js | Operaciones/transporte, sin asignar, resumen, impresión y exportación. | Mejorar jerarquía y encabezado impreso conservando datos y autorización. |
| frontend/pages/operaciones.js | Sugerencias, grupos, asignaciones, diálogos de operación y transporte. | Unificar paneles y formularios; conservar turnos explícitos, grupos 1/2 y capacidad 12/24. |
| frontend/pages/configuracion.js | Catálogos mediante pestañas, tablas y formularios compartidos. | Normalizar pestañas, búsqueda y estados de lectura; no cambiar permisos ni endpoints. |
| frontend/pages/bitacora.js | Filtros y tabla de auditoría. | Misma tipografía y tabla; conservar contenido, filtrado y acceso administrativo. |

Transportes no tiene una página independiente: su gestión está dentro de
operaciones.js y sus diálogos. No se propone crear una ruta nueva.

## 3. Apariencia e inventario de colores actuales

La interfaz mantiene el carácter administrativo de Stitch: superficies claras,
sidebar persistente, tarjetas con bordes finos, tablas densas y acentos verde
oscuro. Los cinco colores institucionales no están implementados como conjunto.
El blanco ya existe. La marca actual es un bloque SK, no el logotipo oficial.

Los dos DESIGN.md del ZIP corresponden a sistemas Stitch con tonos verdes
distintos entre sí; son referencias de distribución y componentes, no una fuente
que sustituya la paleta oficial proporcionada para esta fase.

### Colores hexadecimales en variables.css

| Valor actual | Variables o uso |
| --- | --- |
| #F7FAF9 | --color-background, --color-surface |
| #FFFFFF | --color-surface-lowest, --color-on-primary, --color-on-error |
| #F1F4F4 | --color-surface-low |
| #EBEEEE | --color-surface-container |
| #E6E9E8 | --color-surface-high |
| #6E7979 | --color-outline |
| #BEC9C8 | --color-outline-variant; bordes de tarjetas y controles |
| #005050 | --color-primary |
| #006A6A | --color-primary-container; hover y navegación activa |
| #181C1C | --color-on-surface |
| #3E4948 | --color-on-surface-variant |
| #4A6363 | --color-secondary |
| #CCE8E7 | --color-secondary-container |
| #344B50 | --color-tertiary |
| #4B6267 | --color-warning |
| #BA1A1A | --color-error |
| #FFDAD6 | --color-error-container |

### Valores escritos directamente fuera de variables.css

| Literal | Apariciones en CSS | Ubicación/función |
| --- | ---: | --- |
| #000 | 17 | pages.css, impresión: texto y bordes; primera aparición en línea 2265. |
| #fff | 6 | pages.css, fondos de impresión; primera aparición en línea 2266. |
| #333 | 2 | Texto secundario impreso del Daily y de la reserva individual. |
| #f2f2f2 | 1 | Fondo impreso de reservación cancelada, línea 2481. |
| rgba(24, 28, 28, 0.05) | 3 | Sombras de tarjetas y variantes. |
| rgba(24, 28, 28, 0.06) | 1 | Sombra del sidebar. |
| rgba(247, 250, 249, 0.94) | 1 | Fondo translúcido del header. |
| rgba(24, 28, 28, 0.42) | 6 | Backdrops de diálogos por módulo. |

Los contadores distinguen la escritura #fff de #FFFFFF; ambos representan blanco.
Los hex de pantalla están centralizados; la principal deuda de literales está
en impresión, sombras y backdrops, no distribuida en todo el JavaScript.

### Variables y tipografía existentes

Además de los 20 roles de color hay familia tipográfica, tamaños 36/28/20/18/16/
14/12px, seis alturas de línea, espacios 4/8/16/24/32px, cinco radios y dimensiones
de sidebar/header. No se detectaron referencias var() sin definición en los CSS.
Siete variables no tienen consumo en los CSS revisados: color-surface, outline,
secondary, tertiary, on-error, radius-sm y radius-xl. No se propone eliminarlas
sin revisar también su papel de compatibilidad y usos futuros.

La familia declarada es Inter, Arial, sans-serif, pero no se distribuyen archivos
de Inter ni se carga @font-face. Declarar Inter no garantiza que se renderice.
El PDF sintético revisado utiliza Arial, Arial Bold y Arial Black. Para una
identidad predecible, conservar inicialmente el fallback o incorporar una fuente
local autorizada, con licencia y cobertura de español comprobadas, en otra fase;
no introducir dependencias de fuentes por CDN.

## 4. Reutilización, inconsistencias y conflictos

### Componentes aprovechables

Mantener .btn/.btn-primary/.btn-ghost, .card, .badge y sus variantes, .field,
.input, .filter-bar, .data-table, .empty-state y .form-message. Historial y
Reservaciones ya comparten .pagination-*. Mantener las utilidades de escape de
App.ui y los data-* usados por eventos. El tema puede cambiar su presentación
sin reescribir controladores, solicitudes o permisos.

### Duplicaciones y diferencias concretas

| Hallazgo | Evidencia | Tratamiento propuesto |
| --- | --- | --- |
| Backdrops repetidos | dashboard-integration-dialog-backdrop, catalogos-dialog-backdrop, historial-dialog-backdrop y reservaciones-dialog-backdrop repiten el mismo bloque; otros variantes comparten color y z-index. | Primero tokens comunes de overlay; después agrupar selectores compatibles, manteniendo variantes y eventos. |
| Diálogos desiguales | Usuarios se centra; otros empiezan arriba; anchos 680/720/900/980/1040px y diferentes límites verticales. | Tokens de tamaño y espaciado por categoría, scroll y cabecera consistentes, sin imponer el mismo ancho a todos. |
| Tipografía declarada/reproducible | Inter no empaquetada; muestra PDF usa Arial. | Elegir una estrategia de fuente local estable antes de fijar medidas definitivas del logo y saltos. |
| Estados con presentación próxima | Badges de turno, estado, PAX e información comparten parte de sus estilos. | Roles semánticos distintos con texto visible; no distinguir solo por color. |
| Navegación y paginación activas distintas | Navegación con fondo sólido; paginación cambia borde/texto; pestañas repiten .btn-primary. | Contrato uniforme de estado activo por componente, manteniendo aria-current y eventos existentes. |
| Doble cierre de sesión | Sidebar y header ofrecen la misma acción. | Revisar jerarquía/densidad, sin retirar comportamiento ni cambiar autenticación en esta fase. |
| pages.css concentra varios sistemas | 2686 líneas, módulos, responsive e impresión. | Secciones y tokens claros primero; evitar reorganización masiva. Separar impresión solo si compensa y se prueba el orden de cascada. |
| CSS de vistas antiguas | Clases daily-observaciones-* y otras variantes siguen en CSS aunque no forman parte del render actual del Daily operativo. | No reutilizar una clase suponiendo que representa un campo actual; confirmar consumo antes de limpiar. |

### Conflictos de cascada comprobados

1. **Impresión de celdas.** base.css define td con 14px/20px. Aunque
   .daily-print-table declara 8.6px/10.5px, son valores heredables: no sustituyen
   los especificados directamente en td. En medio print se midió tabla
   8.6px/10.5px y celda 14px/20px; th sí calcula 7.4px/9px. Esto explica una
   diferencia excesiva entre cabeceras diminutas y contenido grande. Corregirlo
   en BRANDING-04 requiere un tamaño explícito de celdas, no reducir solo la tabla.
2. **Color forzado.** pages.css:2269–2276 impone color negro !important a todos
   los elementos al imprimir. Añadir color azul al encabezado con una regla
   ordinaria no funcionará. Habrá que sustituir esa política por roles de impresión
   con selectores y excepciones acotados; no aumentar !important por todas partes.
3. **Dos documentos de impresión.** El mismo @media print contiene el Daily y
   la reserva individual, con @page reservacion-individual más adelante. Un cambio
   global de colores, fuentes o @page puede afectar ambos documentos. Probar los dos.

## 5. Contraste y accesibilidad

Se calculó luminancia relativa sRGB con contraste (Lclaro + 0.05)/(Loscuro + 0.05).
Los valores de tabla se redondean para lectura; la evaluación utiliza el valor
completo. Para texto normal se utiliza 4.5:1, para texto grande 3:1 y para
límites/indicadores visuales necesarios de controles 3:1 respecto al entorno,
cuando resulten aplicables esos criterios. Esto no equivale a una auditoría AA.

### Paleta institucional oficial: valores inmutables

| Fondo oficial | Hex | Texto blanco | Texto azul #011689 | Texto oscuro #181C1C |
| --- | --- | ---: | ---: | ---: |
| Azul | #011689 | 14.21:1 | 1.00:1 | 1.21:1 |
| Turquesa | #00A499 | 3.10:1 | 4.58:1 | 5.54:1 |
| Aqua | #24E0CF | 1.66:1 | 8.55:1 | 10.34:1 |
| Lima | #94D000 | 1.86:1 | 7.64:1 | 9.23:1 |
| Blanco | #FFFFFF | 1.00:1 | 14.21:1 | 17.19:1 |

Azul con blanco es la combinación recomendada para acciones primarias y
navegación activa. Turquesa con texto oscuro ofrece más margen que turquesa con
azul. Aqua y lima funcionan como acentos o fondos con texto oscuro/azul; blanco
sobre ellos no satisface siquiera 3:1. Blanco sobre turquesa no sirve para texto
normal. No asignar automáticamente --color-on-primary a cualquier fondo de marca.

### Situación actual

- Blanco/#005050: 9.28:1; blanco/#006A6A: 6.42:1. Las acciones actuales tienen
  buen contraste y no necesitan perderlo al adoptar la nueva marca.
- #3E4948/#F7FAF9: 8.88:1 y #BA1A1A/#FFDAD6: 5.00:1.
- #BEC9C8/blanco: 1.70:1. Es adecuado como borde decorativo, pero insuficiente
  si es el único indicador necesario para reconocer un control. Los inputs usan
  ese borde: revisar su identificación y estados, no oscurecer todas las tarjetas.
- #6E7979/blanco: 4.4929:1, ligeramente inferior a 4.5:1. No usar esa variable
  como texto normal aunque redondeada parezca «4.49/4.50»; actualmente no se consume
  en los CSS revisados. Puede proponerse para borde funcional de contraste 3:1.
- Hay foco visible en base.css:92–100. Debe preservarse en todos los controles,
  comprobarse sobre los nuevos fondos y complementarse con foco de diálogos.
- Al bajar de 1100px, layout.css oculta .nav-label con display:none; .nav-icon
  ya tiene aria-hidden y el enlace no recibe aria-label. Los estilos calculados
  confirman ese caso a 1024px. El árbol de nombres puede quedar sin nombre útil;
  añadir un nombre accesible estable y comprobarlo con herramientas de accesibilidad.
  Un tooltip visual por sí solo no resuelve ese problema.

Fuentes primarias consultadas:
[WCAG 2.2, contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[contraste no textual](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html)
y [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
Las tablas de datos pueden necesitar desplazamiento bidimensional; esa necesidad
no justifica que también desborden el formulario y el resto de la página.

## 6. Responsive y densidad

- Configuración de BrowserWindow: 1366×768, mínimo 1024×640; el viewport útil
  depende del marco de ventana y la escala. Las mediciones posteriores fijaron
  tamaños de contenido explícitos. No se propone cambiar esos límites por branding.
- Sidebar de 280px que pasa a 88px a 1100px. Header de 64px, contenido con 24px
  de padding y límite de página de 1280px.
- pages.css usa breakpoints 1180 y 760px. Dashboard/Daily pasan a una columna;
  existen ajustes específicos de formularios, diálogos y paginación.
- Mínimos de tablas: Dashboard 980px, Reservaciones 1260px, Historial 1080px,
  Daily 1160px y Usuarios 900px. Mantener scroll de tabla explícito, sin reducir
  todas las fuentes para encajar columnas ni ocultar datos funcionales.

Medición con el frontend original y fixture simulado:

| Caso | Resultado |
| --- | --- |
| Dashboard selected, 1366×768 | Tabla de 980px dentro de contenedor de 641px con overflow-x:auto; no desbordó page-root. |
| Dashboard selected, 1024×640 | Tabla de 980px en contenedor de 843px; sidebar compacto con etiquetas ocultas. |
| Dashboard selected, 760×640 | Tabla con scroll local; solo simulación web, por debajo del mínimo de la ventana real. |
| Reservaciones, 1366×768, selected y Administrador | page-root de 1086px de ancho cliente con 1213px de ancho desplazable; desbordamiento adicional de 127px, no limitado a la tabla. |

En Reservaciones los filtros conservan mínimos de campos y siete columnas que
pueden hacer crecer el contenido más allá del área disponible. Corregir el grid
y min-width de sus hijos en BRANDING-03 antes de diseñar una cabecera de marca
más grande. El header con nombre largo, las acciones de fila y los diálogos
requieren además pruebas al 125–200% de escala/zoom. El diagnóstico no concluye
que todas las pantallas sean responsive a partir de una sola captura.

## 7. Propuesta de arquitectura visual

### Decisión recomendada: aprovechar variables.css

Conservar variables.css como única definición de valores del tema. Introducir
primitivas --brand-* con los cinco valores oficiales y mapear a ellas roles
semánticos. Mantener los nombres consumidos actualmente para una transición
gradual, con aliases. No añadir theme.css con una segunda copia de :root.

Si se exige el nombre theme.css, realizar en BRANDING-02 una sustitución única
del archivo y de su referencia en index.html; nunca mantener dos fuentes activas.
No es necesario ese renombrado para obtener una arquitectura mantenible.

Propuesta de capas, sin implementación en esta fase:

```text
variables.css
  primitivas institucionales + neutrales auxiliares + roles semánticos
         |
base.css / layout.css / components.css / pages.css
         |
pantallas existentes + documento HTML daily-print-root
         |
@media print + tokens --print-* derivados de la misma fuente
         |
motor Chromium/Skia de Electron -> PDF
```

No hace falta generar otra paleta en Node, consultar PostgreSQL, introducir un
framework, usar un ORM o agregar una biblioteca de PDF. El mismo DOM ya usa CSS.

### Contrato de tokens propuesto

Estos nombres y valores son propuesta documental; no se crearon archivos CSS.

| Grupo | Tokens propuestos y criterio |
| --- | --- |
| Marca | --brand-blue:#011689; --brand-turquoise:#00A499; --brand-aqua:#24E0CF; --brand-lime:#94D000; --brand-white:#FFFFFF. Inmutables. |
| Fondos | --color-background y --color-surface-low con neutros claros actuales; --color-surface-lowest:var(--brand-white). Los tonos auxiliares no sustituyen la paleta oficial. |
| Texto | Conservar --color-on-surface:#181C1C y --color-on-surface-variant:#3E4948 como neutros de lectura. |
| Bordes | --border-subtle para decoración; --border-control con contraste verificado; separar ambos del único outline-variant actual. |
| Navegación | --nav-bg blanco, --nav-text oscuro, --nav-active-bg azul, --nav-active-text blanco; hover claro con texto oscuro. |
| Botones | --button-primary-bg azul, --button-primary-text blanco; secundario turquesa con texto oscuro; --button-primary-hover con variante oscura validada del azul. |
| Tablas | --table-head-bg neutro claro; --table-head-text azul/oscuro; --table-row-hover neutro o tinte claro; bordes ligeros y numerales alineados. |
| Formularios | --input-bg blanco; --input-text oscuro; --input-border funcional; --input-placeholder con 4.5:1; altura y padding reutilizables. |
| Estados | --status-info-*, --status-success-*, --status-warning-*, --status-danger-* independientes de colores institucionales; nunca reinterpretar estado de una reservación a partir de un color. |
| Foco | --focus-ring azul sobre superficies claras y --focus-gap blanco para separar de fondos sólidos; validar sobre cada componente y estado. |
| Overlay y sombras | --overlay-backdrop y --shadow-card/--shadow-nav; centralizar los RGBA ya existentes y sus intensidades. |
| Radios | Reutilizar --radius-sm/md/lg/xl/full; botones, inputs y tarjetas según escala existente, no nuevos radios por pantalla. |
| Espaciado | Reutilizar --space-xs/sm/md/lg/xl:4/8/16/24/32px y dimensiones de shell; documentar excepciones, evitando valores mágicos repetidos. |
| Impresión | --print-brand, --print-text, --print-secondary, --print-border, --print-muted-bg, --print-font-size y --print-cell-padding; fuente de color compartida y densidad propia. |

Ejemplo conceptual de compatibilidad:

```css
:root {
  --brand-blue: #011689;
  --brand-turquoise: #00A499;
  --brand-aqua: #24E0CF;
  --brand-lime: #94D000;
  --brand-white: #FFFFFF;
  --color-primary: var(--brand-blue);
  --color-on-primary: var(--brand-white);
  --nav-active-bg: var(--brand-blue);
  --nav-active-text: var(--brand-white);
  --print-brand: var(--brand-blue);
}
```

El catálogo final debe fijar hover, foco, errores y controles antes de aplicarse.
No basta cambiar primary por turquesa: el texto blanco normal perdería contraste.

### Estados y jerarquía: decisión a cerrar en BRANDING-02

Los rojos actuales son semánticos funcionales heredados, no un sexto color
institucional aprobado. Con el requisito de usar exclusivamente la paleta de
marca, la propuesta es diseñar estados con azul/neutrales, tintes permitidos,
texto explícito, iconos y bordes diferenciados; aqua/lima pueden acentuar éxito
o advertencia con texto contrastante. La relación exacta se aprueba antes de
sustituir los roles error/warning existentes. Si se desea conservar rojo como
excepción semántica, documentar esa excepción expresamente; no asumirla.

No asignar lima automáticamente a «Confirmada» ni aqua a «Pendiente» en JavaScript:
los estados y etiquetas siguen siendo los actuales. Mantener claros los cuatro
niveles de jerarquía: marca/contexto, título de pantalla, título de sección y
datos/acciones. Evitar fondos corporativos sólidos en cada tarjeta o columna.

## 8. Logotipo: hallazgo y estrategia

No se encontró un archivo maestro local que pudiera identificarse como el
logotipo oficial descrito: manatí con olas, nombre y lema «Place where the sky
is born...». No hay assets de branding ni fuentes locales en el código fuente.
La búsqueda excluyó dependencias, paquetes generados y evidencias privadas como
fuentes de identidad. No se tomó un icono de Electron como marca corporativa.

referencias/stitch/stitch_reservacion.zip contiene capturas, HTML y dos DESIGN.md.
Algunos HTML enlazan imágenes externas descritas como logotipos estilizados.
Eso no acredita que sean el original oficial y no incluye un archivo maestro
independiente. No se descargaron ni adoptaron como sustitutos.

Ubicación sugerida, a crear únicamente en BRANDING-02 con el archivo real:

```text
frontend/assets/branding/
  community-tours-sian-kaan-logo.png     # si el original entregado es PNG
  README.md                            # origen, dimensiones y reglas de uso
```

Usar la extensión real del archivo recibido. Conservar un SVG solo si se dispone
de un original vectorial auténtico y autorizado; no convertir un raster a SVG
para presentarlo como original. No crear, recolorear, recortar ni redibujar el logo.

| Punto de integración | Criterio |
| --- | --- |
| Login | Emplazamiento principal sobre tarjeta/superficie blanca; imagen completa, proporción automática y texto alternativo corporativo. |
| Sidebar expandido | Área blanca con ancho disponible de unos 248px; definir tamaño final con la relación de aspecto real, sin estirar. |
| Sidebar compacto, 88px | El logo completo puede resultar ilegible. Requiere una variante compacta oficial o una alternativa textual accesible; no recortar automáticamente el manatí. |
| Header | Mantener prioritarios título y usuario; no repetir un logo grande si ya está visible en sidebar. Útil solo si el contexto responsive lo exige. |
| Daily PDF | Encabezado blanco, lado izquierdo, con nombre/documento y datos operativos a la derecha; tamaño acotado para no reducir el espacio de pasajeros. |

El fondo blanco forma parte de las características del archivo descrito: no
eliminarlo ni usar filtros/multiply para simular transparencia. Usar object-fit:
contain y dimensiones que mantengan la relación de aspecto. Confirmar ausencia
de márgenes internos excesivos con el archivo real, sin recortarlo por defecto.

Para raster, calcular la resolución efectiva: píxeles de ancho / ancho impreso
en pulgadas. Un ancho hipotético de 35mm requiere aproximadamente 413px para
300ppi. Es un criterio de calidad propuesto, no una medida conocida del archivo.
También comprobar nitidez a escala de pantalla 100/150/200%, el lema y texto
alternativo. La imagen debe ser local y cargar sin red; esperar su decodificación
y document.fonts.ready antes de imprimir si se incorpora una fuente local.

La marca visual dentro de la app y el icono de Windows/instalador son recursos
diferentes. No se propone modificar instalador, appId ni empaquetado en esta fase.

## 9. Diagnóstico real del Daily PDF

### Flujo y responsabilidades

1. daily.js consulta /api/daily/operativo y renderiza pantalla y #daily-print-root.
2. renderPrintSheets recorre operaciones y transportes; renderPrintSheet prepara
   una hoja lógica por transporte. No usa un servicio backend de dibujo PDF.
3. El botón Exportar PDF llama desktopAPI.exportDailyPdf({fecha}).
4. preload.js invoca daily:export-pdf. main.js comprueba emisor, vista, fecha,
   sesión, permisos y existencia de transportes mediante el endpoint autorizado.
5. event.sender.printToPDF({printBackground:true,preferCSSPageSize:true}) utiliza
   Chromium/Skia. Después del diálogo de guardado se vuelven a comprobar permisos,
   token y versión antes de escribir el archivo.
6. Imprimir usa window.print tras renovar y verificar la sesión. Ambos caminos
   utilizan el mismo documento de impresión y CSS, pero son salidas distintas.

No se usan jsPDF, PDFKit ni Puppeteer como generador de producto. Esos nombres
no deben introducirse para compartir colores que ya pueden leerse desde CSS.

### Configuración y composición actuales

| Elemento | Implementación |
| --- | --- |
| Tamaño | @page Letter landscape, 792×612pt; 279.4×215.9mm. |
| Márgenes | 8mm; área nominal de contenido 263.4×199.9mm. |
| Encabezado | Empresa en texto, subtítulo Daily operativo, fecha y PAX activos. No hay logo. |
| Metadatos | Tour/título de grupo, turno, grupo, primera hora de pickup, guía, vehículo, operador y PAX activos. |
| Tabla | Once columnas, table-layout:fixed y anchos porcentuales que suman 100%. |
| Filas | Orden por pickup; nombre/código y etiqueta CANCELADA, PAX y niños, hotel/pickup, habitación, teléfono, horario, total, depósito, saldo, vendido por y observaciones. |
| Vendido por | Respeta la lógica existente vendedor/plataforma; no sustituirla por texto de marca. |
| Observaciones impresas | Observación de la reservación y bloque OBSERVACIONES PARA EL OPERADOR. |
| Tipografía nominal | Empresa 17px; tabla 8.6px, th 7.4px, secundarios 8.5px, rótulos de metadatos 7.5px. |
| Tipografía efectiva | td hereda su valor especificado global de 14px/20px; th calcula 7.4px/9px. El PDF revisado contiene cuerpo de 10.5pt y cabeceras de unos 5.55pt. |
| Colores | Negro/blanco, secundarios #333 y filas canceladas #F2F2F2. La regla universal !important fuerza negro. |
| Fragmentación | Cada .daily-print-sheet inicia el siguiente transporte en página nueva; última hoja sin salto final. thead se repite como table-header-group. |
| Protecciones de bloques | break-inside:avoid en encabezado, metadatos, filas y observaciones del operador. No garantiza que un bloque más alto que una página pueda mantenerse entero. |

Los porcentajes de columnas son 13/5/13/5/9/6/7/7/7/10/18. Los importes y horas
usan nowrap. Nombres, hotel y observaciones permiten corte de palabra. No hay
una política explícita de repetición de todos los metadatos al continuar una
tabla en una segunda página, ni numeración operativa de continuaciones.

Una hoja lógica por transporte no significa exactamente una página física:
los textos extensos o muchas filas pueden producir continuaciones. Evitar
solucionarlo ocultando filas, reduciendo automáticamente toda la letra o recortando
observaciones. Los límites de PAX no equivalen a un límite universal de filas,
por canceladas u otros registros conservados.

### Datos que no deben confundirse con el PDF actual

La pantalla muestra reservaciones sin asignar y grupos sin transporte. El PDF
actual incluye solo transportes preparados. Se conserva el aviso correspondiente;
branding no debe agregar ni suprimir contenido operativo por decisión visual.
daily_observaciones tiene API/servicio histórico separado, pero el render actual
del Daily operativo no incorpora ese campo general a la hoja impresa. No añadirlo
como una supuesta corrección de marca ni sustituir observaciones del operador.

### Revisión de muestra existente

Se inspeccionó la muestra sintética de ACCESS-SCOPE-04B ubicada en
.access-scope-lab/04b-c7515b95715f/daily-admin.pdf, de una página Letter apaisada,
generada por Chromium/Skia. Se renderizó con Poppler y se midieron fuentes con
pdfplumber: Arial/Arial Bold/Arial Black, con tamaños efectivos de 5.55 a 12.75pt.
La imagen confirma cabecera textual sin logo, cuadrícula negra y gran espacio
libre en un ejemplo con una reserva. La diferencia de tamaños de tabla y el
código pegado visualmente al nombre en esa muestra merecen revisión de densidad
y espaciado; no prueban un error en todos los documentos.

pdfinfo informa Tagged:no. Mejorar colores y logo no convierte automáticamente
el archivo en PDF accesible o PDF/UA. El diagnóstico de etiquetado y orden de
lectura se trataría como requisito separado si se necesita.

## 10. Propuesta de estilo para Daily, sin implementación

- Mantener Letter apaisado, márgenes y once columnas como punto de partida.
  El logo no debe obligar a eliminar columnas ni reducir PAX/documentos visibles.
- Cabecera blanca con logo real, título y regla fina azul; usar turquesa/aqua/lima
  en detalles mínimos que no transporten información imprescindible por sí solos.
- Texto principal oscuro y fondos mayoritariamente blancos. Cabeceras de tabla
  claras con texto azul/oscuro y líneas finas legibles en escala de grises.
- Unificar explícitamente tamaño e interlineado de th/td/strong. Evaluar un rango
  aproximado de 8–9pt para contenido y cabeceras antes de elegirlo; comprobar con
  las once columnas y el peor caso. Es una propuesta de prueba, no un nuevo valor
  funcional aprobado ni una promesa de encajar todo en una página.
- Diferenciar canceladas con etiqueta y tratamiento de borde/fondo, manteniendo
  sus valores y exclusión del conteo activo existente. No depender de tinta roja.
- Mantener encabezados de tabla repetibles; probar observaciones extensas y
  continuaciones. Si se necesita repetir contexto o numeración, aprobar primero
  ese cambio de plantilla y comprobar compatibilidad con el motor actual.
- Definir --print-* derivados de variables.css y reglas explícitas dentro del
  ámbito impreso. No duplicar hex en un generador Node inexistente.
- Cargar el logo local una sola vez y esperar que esté listo; conservar la
  revalidación de permisos antes y después del diálogo de guardado. Una espera
  de imagen/fuente nunca puede sustituir los controles ACCESS-SCOPE.
- Revisar también la impresión individual de Reservaciones. Mantener el flujo
  de guardado, nombres de archivo, cancelación del diálogo y manejo de errores.

## 11. Plan incremental y criterios de aceptación

### BRANDING-02 — Tema global y recursos gráficos

**Archivos previstos:** frontend/css/variables.css, documentación del contrato;
frontend/assets/branding/ solo con el original entregado; index.html únicamente
si se autoriza renombrar el archivo del tema o agregar una fuente local.

**Cambios:** primitivas oficiales, aliases, roles de controles/estados, foco,
sombras y tokens de impresión; inventario real del logo y sus reglas de uso.
Preparar primero el contrato y recursos; la activación que cambie la apariencia
requiere autorización y comparación visual de referencia.

**Dependencias:** autorización para implementar; archivo oficial; aprobación del
tratamiento de estados y decisión sobre fuente/variante compacta. Los tokens
pueden prepararse aunque siga pendiente el archivo de logo; su integración no.

**Riesgos:** cambiar aliases afecta todas las pantallas de inmediato; texto
blanco sobre turquesa; temas duplicados; logotipo ilegible en barra compacta.

**Pruebas:** valores exactos de los cinco colores, ausencia de var() sin definir,
contrastes de texto/controles/foco, recursos locales, fallback de fuente y logo.

**Aceptación:** una sola fuente de valores, sin dependencias nuevas innecesarias;
cinco hex oficiales intactos; tabla de estados aprobada; original conservado sin
deformación ni vectorización automática; sin cambios de permisos o llamadas API.

### BRANDING-03 — Identidad en pantallas Electron

**Archivos previstos:** base.css, layout.css, components.css, secciones de pantalla
de pages.css, layout.js, login.js y renderizadores solo donde sea necesario para
marca/nombres accesibles. No editar auth/api/router ni backend para simplificar UI.

**Cambios:** primero login y shell; después Dashboard/Reservaciones; finalmente
Historial, Usuarios, Operaciones/Transportes, Daily en pantalla, Configuración y
Bitácora. Unificar diálogos, filtros, tablas y paginación con cambios pequeños.
Conservar la referencia estructural Stitch y corregir el desbordamiento medido.

**Dependencias:** tema y logo listos, mapa de estados aprobado y capturas base.

**Riesgos:** afectar selectores usados por eventos; ocultar datos al resolver
overflow; perder foco/labels al compactar menú; generar diferencias entre roles.

**Pruebas:** teclado, foco y cierre de modales; filtros/búsqueda/paginación;
creación/edición/cancelación con API simulada; regresión de roles y revocaciones;
1366×768/1024×640 y zoom 125/150/200%, nombres largos y estados vacíos/error.

**Aceptación:** mismos endpoints, IDs funcionales, data-* y acciones; selected
sigue viendo solo sus dos módulos; sin overflow de formularios/página completa;
scroll de tablas intencionado; nombres accesibles con sidebar compacto; colores
y jerarquía consistentes y controles legibles, sin cambios de reglas de negocio.

### BRANDING-04 — Daily PDF

**Archivos previstos:** frontend/pages/daily.js para el encabezado, bloque de
impresión de pages.css y tokens de variables.css. main.js únicamente si es
imprescindible esperar recursos, sin cambiar permisos ni opciones operativas.
preload.js se conserva salvo necesidad justificada; ningún cambio de datos/backend.

**Cambios:** logo local, roles de impresión, corrección de cascada th/td, ajustes
de espaciado y uso de tinta. Mantener el bloque print en pages.css inicialmente;
si se extrae a print.css, transferir y probar también la reserva individual para
conservar la cascada, evitando dos copias de @media print.

**Dependencias:** original con resolución conocida, tema estable y fixtures
sintéticos completos; comparación con PDF actual. No requiere migración ni librería.

**Riesgos:** columnas/saldos recortados, image loading tardío, cambios de fuente
que aumentan páginas, observaciones que no caben y pérdida de permisos al exportar.

**Pruebas:** printToPDF real sobre fixture aislado y render de todas las páginas;
texto/datos de las once columnas; 1/12 PAX por grupo y 24 por tour/turno; múltiples
transportes; canceladas; textos largos; impresión individual; exportación rechazada
para selected y revocación durante el diálogo. No usar datos reales para capturas.

**Aceptación:** mismos datos, orden, totales, exclusiones y reglas; ninguna columna
o fila oculta/recortada; logo nítido completo; cabeceras repetibles en continuaciones;
sin páginas en blanco extra; legible a escala real y en blanco/negro; autorización
IPC íntegra. La prueba física de impresora requiere aprobación y equipo apropiado.

### BRANDING-05 — Consistencia, accesibilidad y aceptación

**Archivos previstos:** correcciones acotadas de los CSS/renderizadores anteriores,
pruebas existentes y un informe de aceptación. No instalador ni esquema/credenciales.

**Cambios:** revisar todas las pantallas y salidas con una matriz común de roles,
estados, resoluciones, zoom y datos; corregir diferencias de contraste/espaciado
sin reestructurar funciones ni controles de autorización.

**Dependencias:** BRANDING-02/03/04 terminados y aceptación del uso del logo.

**Riesgos:** tomar mocks por pruebas de DB real; aprobar solo una pantalla;
interpretar el color como estado; ignorar drivers de impresión y fuentes del equipo.

**Pruebas:** regresión aislada existente, revisión visual manual de cada pantalla,
teclado/nombres accesibles, cálculo de contraste sin redondear antes de comparar,
render de cada página PDF y revisión de datos/visibilidad autorizada. Escáner
automático de accesibilidad solo si ya está disponible o se autoriza incorporarlo.

**Aceptación:** matriz sin fallos críticos, permisos intactos, pruebas verdes,
logo aprobado, diferencias visuales documentadas y ninguna conclusión de
producción o PDF/UA que no tenga evidencia específica.

## 12. Matriz funcional que debe permanecer intacta

| Perfil | Invariante |
| --- | --- |
| Administrador | Acceso completo y mismas acciones actuales. |
| Consulta all | Conserva los módulos habituales de lectura que hoy autorizan frontend/backend, sin escrituras. |
| Consulta selected | Solo Dashboard y Reservaciones, con sus plataformas autorizadas; mismo filtrado backend, detalle y errores sin fuga de información. |

Toda fase debe conservar autenticación, renovación de sesión, ACCESS-SCOPE,
filtros, búsquedas, paginación, cancelaciones, bitácora, asignación de transporte,
capacidad 12/24, grupos 1/2, turnos explícitos, pickup propio de la reservación,
reglas del Daily, exportación/impresión y conexión PostgreSQL centralizada.
No derivar turnos por hora ni asignar clientes automáticamente. No reactivar
WhatsApp ni modificar GetYourGuide/FareHarbor. No añadir tablas/campos para branding.

## 13. Verificación de esta fase y evidencia

La evidencia privada está en .access-scope-lab/branding-01/, excluida por
.gitignore: inventario/contrastes, capturas de frontend, mediciones calculadas,
copia instrumentada del harness y render de la muestra PDF. El original PDF
permanece intacto. No se distribuyen estas evidencias como recursos de la marca.

El harness terminó correctamente con API simulada. Hubo ajustes en la copia
privada para restablecer un fallo de sesión intencionado y esperar el repintado
antes de capturar: no fueron cambios ni fallos corregidos del producto.
La emulación print usó un fragmento sintético de tabla con los CSS originales
para medir la cascada; no constituye una exportación integral autenticada nueva.

Se comprobaron hashes SHA-256 de los archivos fuente revisados para asegurar que
no cambiaron y se verificó Git en modo de lectura. Las 690 pruebas de GITHUB-03
son evidencia anterior; no se presentan como una regresión completa ejecutada
en BRANDING-01. No era necesario repetirla para un informe sin cambios de producto.

**Archivo de entrega creado: docs/BRANDING-01.md.** No se modificaron
funcionalidades ni bases de datos; no hubo commit/push ni cambios del instalador.

## 14. Preparación para BRANDING-02

Sí, la base técnica permite iniciar BRANDING-02 de forma incremental, tras
autorización del usuario. Se recomienda conservar variables.css y centralizar
los roles antes de aplicar estilos por pantalla. El archivo oficial del logo,
su alternativa compacta si existe, la estrategia tipográfica y la propuesta de
estados deben quedar resueltos antes de integrar esos recursos y activar la
identidad visual. No se implementó todavía ningún cambio visual funcional.
