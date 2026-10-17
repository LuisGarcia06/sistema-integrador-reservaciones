# BRANDING-03 — Sidebar, encabezado, componentes y Dashboard

> Cierre posterior: el usuario aprobó visualmente Electron y los dos documentos
> en la solicitud BRANDING-05 + GITHUB. Este informe conserva la evidencia de
> su fase; el estado final se documenta en [BRANDING-05](BRANDING-05.md).

Fecha: 16 de octubre de 2026. **Implementación local terminada; pendiente de
aprobación visual del usuario. Sin commit ni push.**

## Alcance y referencia

Se leyó AGENTS.md, el diagnóstico BRANDING-01 y el estado de BRANDING-02.
Al no existir la segunda fase, se prepararon los tokens y recursos documentados
en BRANDING-02 antes de aplicar el tema. Se siguió la captura aprobada por el
usuario; está conservada como `branding-03/referencia-aprobada.png`.

El frontend real conserva sus módulos y datos dinámicos. Las capturas provienen
de ese mismo frontend cargado en Electron con API local simulada, puerto efímero
en 127.0.0.1 y perfil temporal. No se construyó una pantalla de demostración
independiente ni se copiaron los nombres, códigos o cifras de la referencia al
producto. Los códigos SYN-BR y nombres «Cliente sintético» pertenecen únicamente
al entorno privado de validación y a las capturas.

## Implementación

- Sidebar blanco de 238 px, selección azul #011689, texto blanco e iconos lineales.
- Logotipo oficial completo, sin redibujar, con proporción original y texto alternativo.
- Contraer/expandir manual a 76 px, con nombre accesible y aria-expanded. Se
  conserva el modo automático al reducir a 1100 px si no hay preferencia manual.
  La preferencia local solo guarda expanded/compact, sin información de sesión.
- Encabezado institucional pequeño, título azul de 32 px y subtítulo gris.
- Tarjetas blancas de 120 px, bordes suaves, sombras discretas, números azules
  y subrayado turquesa; etiquetas antes de los valores.
- Tabla de recientes a todo el ancho, encabezados aqua suave y títulos azules,
  separación de filas y estados legibles; desplazamiento horizontal local cuando
  no caben todas las columnas.
- Accesos rápidos existentes en una fila superior. Solo enlazan a Reservaciones,
  Operaciones y Daily según los permisos actuales. No se agregaron acciones falsas.
- Colores y roles centralizados en variables.css; botones con hover y foco azul.
- El inicio de sesión usa el mismo logo oficial en lugar del monograma SK.
- Ajuste acotado de filtros de Reservaciones a columnas adaptables para impedir
  desbordamiento global con el nuevo ancho disponible. No cambia búsquedas ni API.

## Comparación visual con la referencia

| Elemento | Referencia | Resultado y diferencia necesaria |
| --- | --- | --- |
| Sidebar | Blanco, 238 px | 238 px; mismo patrón activo azul e iconos sencillos. |
| Logo | Composición compacta en banda de unos 92 px | Archivo oficial completo a 158 × 113.6 px; banda mayor, sin recortes. |
| Contenido | Empieza en x=280 a 1400 px | x=280; gutter 42 px. |
| Tipografía | Título 32 px, cuerpo próximo a 14 px | Título 32 px, cuerpo 14 px; pila local existente. No se recibió una fuente oficial. |
| Métricas | Tres tarjetas de 120 px | Cuatro indicadores reales; dos para Consulta selected. Alto 120 px. |
| Acciones/fecha | Dos acciones demostrativas | Se conservan fecha, sesión y tres accesos reales; las métricas comienzan en y=189. |
| Tabla | Seis columnas | Se conservan ocho: Código, Fecha, Cliente, Tour, Turno, PAX, Vendido por y Estado. |
| Tarjetas/tabla | Blanco, bordes suaves y encabezado aqua | Misma jerarquía, radio y sombras discretas. |
| Contenido inferior | Espacio vacío de ejemplo | Se conservan pendientes de integración, alertas y salidas operativas. |

Se revisaron capturas a 1400 × 900 y 1024 × 768, menú manual expandido/contraído
y modo automático. En anchos reducidos las métricas pasan a dos columnas y la
tabla conserva todas sus columnas mediante scroll interno. La comprobación a
760 × 900 es adicional: Electron conserva su mínimo real de 1024 × 640.
El logo completo del modo compacto queda pequeño; no se inventó una versión nueva.

## Evidencia visual

Todas las imágenes siguientes usan datos sintéticos. La etiqueta preexistente
«Datos reales» pertenece al renderizador del producto y no convierte los fixtures
de estas capturas en datos reales.

- [Dashboard Administrador 1400](branding-03/dashboard-admin-1400.png).
- [Menú contraído 1400](branding-03/dashboard-contraido-1400.png).
- [Menú expandido manualmente 1024](branding-03/dashboard-expandido-1024.png).
- [Modo automático 1024](branding-03/dashboard-admin-1024.png).
- [Mínimo de Electron 1024 × 640](branding-03/dashboard-minimo-1024.png).
- [Tabla desplazada hasta Estado en el mínimo](branding-03/dashboard-minimo-tabla-derecha-1024.png).
- [Ventana estrecha 760](branding-03/dashboard-admin-760.png).
- [Consulta all](branding-03/dashboard-consulta-all-1400.png).
- [Consulta selected](branding-03/dashboard-consulta-selected-1400.png).
- [Reservaciones selected](branding-03/reservaciones-selected-1400.png).
- [Inicio de sesión](branding-03/login-1400.png).

## Regresión y seguridad

**690 pruebas aprobadas en 33 suites; cero fallos.** Se ejecutaron 631 pruebas
/31 suites más 59 pruebas/2 suites de parsing/Gmail con mocks. Se incluyeron todas
las pruebas backend excepto api.test.js y el test de persistencia simulada de GYG.
Jest se ejecutó con entorno sintético, APP_CONFIG_PATH=NUL y noPostgres.js, que
bloquea query/connect reales incluso si una prueba olvida su DB fake.

api.test.js se excluyó por requerir persistencia y poder modificar datos. No se
iniciaron PostgreSQL, el backend productivo, migraciones ni sincronizadores reales.
No se modificaron reservaciones, permisos, reglas operativas, autenticación,
GetYourGuide, FareHarbor, WhatsApp, lanzadores, instaladores o credenciales.

El harness frontend comprueba los tres perfiles, renovación/revocación, aislamiento
de sesiones, denegación de rutas/detalles, limpieza de impresión al cerrar sesión,
logo original cargado, menú accesible y persistencia al navegar. Comprueba dos
indicadores para selected, cuatro para all y las ocho columnas y enlaces reales.
Las comprobaciones de usuarios se realizan exclusivamente contra API simulada.

La revisión visual produjo 11 capturas y comprobó ausencia de desbordamiento
horizontal del documento. En la ventana mínima se desplazó la tabla hasta su
última columna, verificando que Estado es accesible. Se comprobaron los estilos
calculados de hover (tras completar su transición) y focus-visible mediante
emulación de esos estados en Chromium: fondo #006B64 y contorno azul de 2 px.
Esto no sustituye una prueba manual completa con teclado o lector de pantalla.

La comparación print antes/después del mismo fragmento sintético del Daily fue
idéntica en dimensiones y estilos calculados (tabla, cabecera, th, td, espaciados,
fuente, colores y bordes). Los módulos Daily y Electron permanecen iguales por
SHA-256. Esto protege la cascada existente; no se afirma una validación integral
nueva de PDF ni una prueba física de impresión. BRANDING-04 queda pendiente.

## Contraste

| Combinación | Ratio |
| --- | --- |
| Azul / blanco | 14.22:1 |
| Texto blanco / turquesa oscuro de acción | 4.88:1 |
| Texto blanco / hover turquesa | 6.39:1 |
| Texto principal / fondo | 10.82:1 |
| Texto secundario / fondo | 5.07:1 |
| Azul / cabecera aqua suave | 12.94:1 |
| Estado vigente | 6.63:1 |
| Error/cancelación | 5.00:1 |
| Borde de campo / blanco | 3.53:1 |

Los textos medidos superan 4.5:1; el borde de campo supera 3:1. El turquesa
oficial, aqua y lima se reservan para acentos o combinaciones con texto oscuro.
Esto no representa una auditoría completa de accesibilidad de todo el sistema.

## Archivos de entrega

Modificados: frontend/css/{variables,layout,components,pages}.css,
frontend/js/layout.js, frontend/pages/{dashboard,login}.js y
backend/__tests__/helpers/frontendScopeHarness.cjs (solo harness de pruebas).
Nuevos: docs/BRANDING-02.md, docs/BRANDING-03.md, docs/branding-03/ (capturas y
referencia), frontend/assets/branding/ (JPEG original y README). El informe
BRANDING-01 previo se conservó sin cambios.

Se revisaron .gitignore y los archivos candidatos. .env, .access-scope-lab,
node_modules, respaldos y credenciales siguen excluidos. La evidencia técnica
privada y logs están en .access-scope-lab/branding-03, sin agregar a Git.
No fue necesario editar .gitignore. git diff --check no detectó errores.

La revisión de hashes solo detectó cambios en los archivos fuente enumerados.
No hay staging, commit ni push de esta fase. La rama local sigue siendo
GYG+FRHB-implementado. La aprobación visual del usuario es el único paso pendiente
antes de considerar un commit posterior; no se autorizó publicar estos cambios.
