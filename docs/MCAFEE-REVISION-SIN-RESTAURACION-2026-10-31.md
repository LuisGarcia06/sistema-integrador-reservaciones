# Vía de revisión McAfee manteniendo la cuarentena

Fecha: 31 de octubre de 2026. **Procedimiento documentado; no se envió ninguna
consulta ni se subió un archivo**. No se restauró, excluyó, renombró, ejecutó o
recompiló el prototipo. No se consultaron ni manipularon contenedores internos de
cuarentena. `build-probe.cjs` permanece bloqueado.

## Canales oficiales comprobados

McAfee publica un [formulario de revisión de detecciones](https://www.mcafee.com/en-us/consumer-support/dispute-detection-allowlisting.html)
para clientes y proveedores. La página pide autorización legal sobre lo enviado
y admite archivos; no documenta un mecanismo para extraer nuestra muestra de
cuarentena sin restaurarla. **No se presume que el formulario o un análisis por
hash resuelvan esa limitación.**

Su [página de contacto](https://www.mcafee.com/en-us/consumer-corporate/contact-us.html)
dirige la atención al cliente al soporte oficial. La vía inicial es pedir por
ese soporte un número de caso y un procedimiento que conserve la cuarentena;
el formulario de archivos podrá utilizarse después únicamente si el proveedor
ofrece un método compatible y existe autorización expresa para lo que se comparta.
No se usará un correo, endpoint, herramienta de exportación o portal inventado.

## Identificación precisa del artefacto histórico

| Evidencia local | Valor o alcance |
| --- | --- |
| Archivo | `ctsk-native-security-probe.exe` |
| SHA256 registrado inmediatamente tras compilar | `511a7812aaf5b8c6a672ead70375812e83d7feb46e8029824f7b6bb4d6fec196` |
| Fuente de esa compilación, según probe-build.json | `bb2b43a3b1ef8213f7bf7bd5aa31e25e85b2d16b3a213946973a4c065c256342` |
| Compilador, SHA256 registrado | `aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116` |
| Fecha/hora visible | 30/10/2026 22:36; zona no mostrada |
| Estado confirmado | En cuarentena; producto atribuido a McAfee por confirmación del usuario |
| Etiqueta | `ti!511A7812AAF5`, transcrita en el borrador histórico; conservar la captura original como evidencia primaria |
| Resultado de intento histórico | ENOENT; no se obtuvo informe de ejecución del hijo |
| Falso positivo confirmado | No |

Los archivos primarios permanecen en `docs/local-fase-2e7-native05/`. La copia de
fuente original en
`docs/local-fase-2e7-security-review/before/scripts__windows-native__SecurityProbe.cs.txt`
coincide con el hash de fuente de `probe-build.json`. La fuente actual
`SecurityProbe.cs` recibió correcciones posteriores y **no debe enviarse como si
fuera la que produjo aquel ejecutable**. No se verificó de nuevo el hash binario
leyendo la cuarentena: es un hash histórico, no una extracción actual.

## Procedimiento sin extracción ni desprotección

1. El usuario abre soporte desde el enlace oficial o la interfaz de su producto.
   Puede reutilizar el borrador local `consulta-mcafee-es.txt`, revisando contacto y
   etiqueta. No se presupone aceptación por TELMEX u otro canal no verificado.
2. Primer contacto: descripción, nombre/hash histórico, estado de cuarentena y
   número de caso. Solicitar revisión de la detección y un procedimiento oficial
   sin restaurar, excluir, ejecutar ni recompilar. No afirmar que sea falso positivo.
3. Si piden evidencia adicional, el usuario revisa su alcance: captura, fuente
   histórica, informe de compilación y logs carecen de secretos requeridos para
   esta consulta, pero rutas personales deben minimizarse. No se adjuntan datos
   empresariales, credenciales o información del host sin necesidad y autorización.
4. Si necesitan el binario, pedir un método del propio proveedor que preserve la
   cuarentena/protecciones. Si no existe o exige restaurar/excluir/desactivar,
   **detener el envío y mantener el bloqueo**. No buscar una extracción alternativa,
   recrear la muestra o modificar el comportamiento para evitar la detección.
5. Registrar caso, respuesta, artefacto/hash analizado y alcance del dictamen.
   Un dictamen o actualización del proveedor no aprueba por sí solo un broker
   distinto, su fuente corregida o el diseño de depuración propuesto.
6. Antes de cualquier ejecución futura, establecer una vía y plan de validación
   nativa autorizados, con evidencia de procedencia y protecciones activas en la
   VM sintética. La autorización actual sigue limitada a revisión estática y
   pruebas aisladas; no habilita ejecutar la muestra detectada.

No se crea aquí una lista blanca del producto, no se instala certificado alguno
ni se solicita cambiar políticas. El procedimiento permite iniciar revisión
legítima sin prometer que McAfee acepte una muestra inaccesible ni que la declare
segura. La resolución de la detección y la demostración técnica de seguridad son
puertas independientes.
