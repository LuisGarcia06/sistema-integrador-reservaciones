# BRANDING-02 — Tokens y recursos oficiales

> Cierre posterior: el usuario aprobó visualmente Electron y los dos documentos
> en la solicitud BRANDING-05 + GITHUB. Este informe conserva la evidencia de
> su fase; el estado final se documenta en [BRANDING-05](BRANDING-05.md).

Fecha: 16 de octubre de 2026. Estado: implementado localmente, sin commit/push.
Se leyó AGENTS.md y BRANDING-01. No había una implementación de BRANDING-02.
La instrucción posterior del usuario aprueba su captura como referencia principal.

## Fuente central

`frontend/css/variables.css` contiene la paleta obligatoria:

| Token | Valor |
| --- | --- |
| brand-blue | #011689 |
| brand-turquoise | #00A499 |
| brand-aqua | #24E0CF |
| brand-lime | #94D000 |
| brand-white | #FFFFFF |

Se definieron roles de superficie, textos, bordes, acciones, foco, sombras y estados.
Aqua y lima están disponibles como tokens: no se añaden áreas saturadas para
forzar su presencia. Turquesa oficial se usa en acentos; para texto blanco en
botones se utiliza el derivado oscuro #007F77 (contraste 4.88:1). El rojo semántico
existente se conserva para errores y cancelaciones. Los estados vigentes usan
un verde semántico discreto como en la referencia.

Se mantuvo la pila tipográfica existente Inter, Arial, sans-serif, con fallback
local; no se descargaron fuentes ni se añadieron servicios externos. Los tamaños
base y line-height globales permanecen para no alterar impresión.

## Recurso aprobado

El JPEG original proporcionado por el usuario se encuentra en
`frontend/assets/branding/community-tours-sian-kaan-logo.jpg`. Se comprobó igualdad
binaria con el adjunto. Dimensiones: 1296 × 932, proporción completa y fondo blanco.
Su procedencia, SHA-256 y uso están en el README de esa carpeta.

No se creó un logo nuevo ni una variante compacta. El mayor alto de la cabecera
del Sidebar responde a conservar el archivo completo que fue proporcionado.

## Límite de impresión y validación

Las reglas nuevas se limitan a pantalla; los tokens anteriores se restauran en
print. Se conserva la cascada anterior del layout para impresión. No se modificó
Daily JS ni Electron/PDF. La comparación de estilos print con el mismo fragmento
sintético se detalla en BRANDING-03; no constituye una exportación integral nueva.

La aplicación del tema y las capturas corresponden a BRANDING-03. Queda pendiente
la aprobación visual del usuario. No se modificaron base de datos, roles,
autenticación, ACCESS-SCOPE, proveedores, lanzadores ni credenciales.
