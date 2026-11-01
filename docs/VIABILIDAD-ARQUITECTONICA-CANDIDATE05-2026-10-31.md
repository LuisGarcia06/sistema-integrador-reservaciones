# Evaluación de viabilidad antes de candidate-05

31 de octubre de 2026 · `synthetic-acceptance-only` · `productionAuthorized=false`.

**Recomendación:** servicio oficial PostgreSQL exclusivo, cuenta dedicada sin
administración, ACL privadas, identidad del clúster y un auxiliar pequeño de
configuración/verificación. Mientras se conserve el requisito de un token
restringido antes de escribir, el auxiliar de inicialización debe crearlo y
verificarlo antes de reanudar el primer initdb, con contención del intento. No
recomiendo implementar un depurador de todos los descendientes para el alcance
ordinario de esta aplicación.

Esta recomendación **no está aplicada ni autorizada como sustitución de garantías**.
Preserva el requisito del primer token; propone prescindir de la atestación
individual de todos los descendientes antes de ejecutar código. Ese cambio de
garantía requiere autorización explícita. Una instalación convencional sin esa
verificación inicial tampoco satisface automáticamente el requisito de token.

## 1. Modelo de amenazas usado para evaluar proporcionalidad

El objetivo es evitar acceso local no autorizado, ejecución con privilegios
innecesarios, manipulación de archivos del programa/configuración, conexión o
modificación de una base ajena, pérdida de datos por fallos/reinicios e invocación
de comandos por entradas de instalación. Los permisos funcionales de la
aplicación, el rol SQL limitado y la seguridad Electron/HTTPS siguen siendo
fronteras esenciales; ningún supervisor de initdb los reemplaza.

Para comparar diseños propongo confiar en Windows y en PostgreSQL obtenido de
procedencia verificada, con sus dependencias protegidas y actualizaciones
revisadas. No tratar initdb como código arbitrario hostil. Esto es una **hipótesis
de confianza propuesta**, no una decisión ya aprobada ni una prueba de ausencia
de vulnerabilidades.

No se promete resistencia a un administrador local malicioso, kernel comprometido,
hipervisor comprometido, robo físico sin protección del disco o malware con los
mismos privilegios y acceso que una autoridad ya confiable. Si esas amenazas deben
quedar cubiertas, hay que definir controles adicionales; DEBUG_PROCESS tampoco
las resuelve por sí mismo. Una aplicación comprometida con su rol SQL puede dañar
los datos a los que ese rol tenga acceso: contener initdb no lo impide.

Las 237 pruebas anteriores validan contratos, modelos y simulaciones. Su número
no demuestra necesidad del depurador ni seguridad nativa de ninguna alternativa.

## 2. Alternativas concretas

| Aspecto | A. Supervisor completo propuesto | B. Instalación convencional del servicio oficial | C. Servicio oficial con inicialización acotada — recomendada |
| --- | --- | --- | --- |
| Base | Tokens propios, DEBUG_PROCESS, Job, inspección por creación de proceso/DLL | Cuenta limitada, servicio exclusivo, herramientas oficiales y ACL | Igual que B, más auxiliar cerrado para identidad, primer token y contención de initdb |
| Identidad antes de escribir | Se exige en cada proceso antes de ejecutarlo | Cuenta/ACL verificadas; no prueba el token restringido del primer initdb por sí sola | Primer initdb suspendido, token consultado por handle antes de reanudar |
| Descendientes | Inspección individual previa de tokens, imágenes y módulos | Confianza en mecanismos Windows y código oficial | Confianza explícita en descendientes del contexto restringido y código oficial; verificación de contención y postcondiciones |
| Fallo interno de reducción | Intenta detectarlo también por topología/eventos | No garantiza rechazo previo a escrituras con el token original | El original ya está restringido; diagnóstico/fallo/postcondición impiden certificar el intento, aunque pueda haber datos parciales |
| Árbol y cierre | Depurador + Job + handles + conciliación completa | SCM y control oficial; agregar comprobación real de cierre | Job/handles en inicialización; SCM e identidad/handles en operación; residuales bloquean reinicio |
| Código adicional crítico | Alto: depurador, tokens, DLL, broker, estados y recuperación | Menor, pero aún hace falta configuración/verificación segura y reemplazar PowerShell | Intermedio y acotado: token raíz, Job, ACL/SCM/registro y estados; sin depurador |
| Antivirus | Más comportamiento sensible; compatibilidad desconocida | Menor personalización; no garantiza aceptación antivirus | Conserva APIs sensibles de token/procesos; revisión sigue pendiente, sin prometer evitar detecciones |
| Actualizaciones | Más acoplamiento a árbol, DLL y detalles internos | Más cerca de mecanismos documentados del proveedor | Actualizar binarios y contratos cerrados; menos acoplamiento que A |
| Estado | Solo diseño/modelo; no validado nativamente | No está configurada ni certificada para nuestra VM | Recomendación conceptual; no implementada |

**A aporta una garantía más estrecha y fuerte:** inspección de cada descendiente
antes de su código de usuario. Windows documenta la barrera de eventos de
depuración y los derechos potentes de sus handles. Implementarla correctamente
implica nuevas responsabilidades y posibles fallos de disponibilidad.
[Eventos de depuración](https://learn.microsoft.com/en-us/windows/win32/debug/debugging-events).

**B no es insegura por definición:** es un patrón razonable cuando se confía en el
software oficial y en la cuenta/ACL verificadas. Pero no es equivalente a nuestras
garantías reforzadas. El hallazgo de initdb no hace obligatoria la depuración en
toda aplicación PostgreSQL; hace insuficiente afirmar que su código cero prueba
un token restringido.

**C mantiene el límite de privilegios inicial sin observar cada instrucción o
proceso.** No garantiza la misma atestación que A y exige aceptar expresamente
esa diferencia. El auxiliar no es un spawn simplificado ni una recompilación del
prototipo detectado; su revisión y validación siguen pendientes.

## 3. Qué proporcionan Windows y PostgreSQL

| Control | Mecanismo existente | Trabajo de Community Tours |
| --- | --- | --- |
| Identidad Windows del servicio | SCM arranca bajo la cuenta configurada | Elegir cuenta, resolver SID, verificar configuración efectiva, rechazar LocalSystem/cuenta ajena y limitar quién puede reconfigurar |
| Protección de archivos | Windows aplica DACL y etiquetas de integridad | Crear ACL correctas desde el inicio, comprobar propietario/herencia/ancestros y proteger secretos; la ACL no se configura sola |
| Privilegios del servicio | Windows permite acotar los requeridos | Configurar y medir mínimos; cuenta no administradora, SID restrictivo e integridad Medium son conceptos distintos |
| Restricción del proceso PostgreSQL | Código oficial de pg_ctl y helper interno de initdb | No confundir implementación oficial con prueba de éxito bajo cualquier fallo; conservar comprobación inicial si sigue exigida |
| Disponibilidad y parada | SCM y mecanismos oficiales PostgreSQL | Ligar servicio, proceso y clúster; confirmar disponibilidad/salida real; no usar solo SCM ni matar por nombre |
| Rol SQL/autenticación | PostgreSQL aplica roles y pg_hba.conf | Rol de ejecución limitado, configuración local explícita, secreto técnico protegido, nunca superusuario para uso cotidiano |
| Recuperación transaccional | WAL y recuperación PostgreSQL | Backups, restauración probada, almacenamiento y configuración durables; no reinicializar automáticamente ante fallos |
| Identidad de clúster | PostgreSQL expone información de control | Comparar system identifier con inscripción y directorio/puerto/servicio/imagen; el identificador no es un secreto ni prueba criptográfica por sí solo |
| Flujo de instalación | No conoce nuestra aplicación | T0, bootstrap único, HTTPS, descriptor Electron, firmas/inventarios, ocho etapas y recuperación de estados interrumpidos |

Fuentes: [SCM/cuentas](https://learn.microsoft.com/en-us/windows/win32/services/service-user-accounts),
[permisos de servicio](https://learn.microsoft.com/en-us/windows/win32/services/service-security-and-access-rights),
[ACL](https://learn.microsoft.com/en-us/windows/win32/secauthz/access-control-lists),
[privilegios requeridos](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/ns-winsvc-service_required_privileges_infow),
[roles SQL](https://www.postgresql.org/docs/18/role-attributes.html),
[pg_hba.conf](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html),
[WAL](https://www.postgresql.org/docs/18/wal-intro.html),
[pg_controldata](https://www.postgresql.org/docs/18/app-pgcontroldata.html).

En el commit 18.3 revisado, initdb puede continuar si falla su reejecución
restringida. El servicio pg_ctl usa creación restringida propia, pero su gestión
de job no equivale a nuestro KILL_ON_JOB_CLOSE estricto y algunos fallos se ignoran;
la espera de parada también es limitada. No basta con invocar herramientas
oficiales para dar esas propiedades por demostradas.
[Helper initdb](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/common/restricted_token.c),
[pg_ctl](https://github.com/postgres/postgres/blob/62d6c7d3df6287f1bd83199c1a746e50d31571a0/src/bin/pg_ctl/pg_ctl.c).

## 4. Imprescindibles, opciones y exceso de alcance

| Clasificación | Controles y motivo |
| --- | --- |
| Imprescindibles para el producto | Cuenta limitada, ACL privadas verificadas, fuentes/binaries confiables, rol SQL limitado, identidad de clúster y proceso, no tocar instancias ajenas, secretos protegidos, permisos backend, logs sin secretos, respaldo/restauración y parada/recuperación controladas |
| Requisitos vigentes reforzados | Token inicial restringido medido antes de escribir, rechazo de incertidumbre, control exclusivo de procesos, restricciones PowerShell/CMD y aceptación real en VM. No se eliminan en esta evaluación |
| Decisiones de implementación | DEBUG_PROCESS, cuenta virtual frente a cuenta local dedicada, integridad Medium exacta, lista concreta de SID restrictivos, transición de imagen del servicio y observación de DLL. No son reglas funcionales del negocio, pero los compromisos anteriores asociados a ellas deben revisarse expresamente |
| Desproporcionados para el modelo ordinario propuesto | Convertir el instalador en depurador permanente del árbol, fijar cada DLL de Windows a un hash para permitir su carga, exigir una topología exacta como sustituto de una frontera de privilegios, intentar resistir al administrador local desde la misma máquina |

Un Job para el intento de inicialización es una herramienta acotada de contención
y limpieza, **no es en sí exceso de ingeniería**. No exige DEBUG_PROCESS.
Su cierre forzado sirve para abortar un intento nuevo; no sustituye una parada
transaccional normal del servidor con datos persistentes.
[Objetos Job](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects).

La inspección antes de ejecutar todo hijo puede justificarse si queremos tratar
cada descendiente como potencialmente no confiable o mantener esa garantía exacta
como requisito de certificación. Para el modelo ordinario descrito, considero
mejor invertir primero en aislamiento, autenticación, backups y aceptación real.
Ese juicio de proporcionalidad no equivale a permiso para retirar la garantía.

## 5. Garantías y riesgos residuales

- A, si se implementa y prueba, puede acreditar los puntos de inspección previos
  de los procesos observados. No demuestra ausencia de vulnerabilidades, código
  malicioso después de esos puntos, acceso lógico indebido a datos, pérdida de
  disco o compromiso del supervisor/Windows. También añade riesgo de bloqueos por
  errores de manejo de eventos, DLL o excepciones.
- B puede demostrar cuenta efectiva, permisos, procedencia, configuración,
  identidad, inicio/cierre y persistencia mediante comprobaciones reales. No
  demuestra la restricción inicial exacta o inspección previa de cada hijo solo
  por ser una instalación convencional. Un fallo del helper interno de reducción
  sigue teniendo que valorarse.
- C puede demostrar el token inicial seguro y contención del intento mediante un
  auxiliar reducido. Puede rechazar salida incompleta/fallos conocidos y verificar
  las postcondiciones. Confía en Windows y en las rutas auditadas de herramientas
  oficiales para los descendientes; no declara que todos fueron atestados antes
  de ejecutar. La reducción interna fallida no eleva un token externo ya aprobado,
  pero puede dejar datos parciales que deben conservarse sin certificar ni reusar.

Ninguna alternativa promete que nunca habrá un proceso residual. Ante una parada
incierta, se debe detectar, bloquear un nuevo inicio y recuperar solo el contexto
propio. Si se exige prevención absoluta de residuales en operación, la solución
debe añadir una frontera de vida verificada y probar sus fallos; no puede sustituirse
silenciosamente por detección posterior. Esto tampoco obliga a usar depuración.

El system identifier puede copiarse junto al clúster. Su comparación necesita
rutas privadas, inscripción y controles de servicio/proceso. No evita por sí solo
clonación o suplantación con control administrativo del anfitrión.

## 6. Viabilidad Windows 11 Home y Restricted

Las API de servicios admiten cuentas virtuales desde Windows 7 y permiten
configurarlas sin contraseña suministrada por la aplicación. Es una base
conceptualmente compatible con Windows 11; la edición Home no debe evaluarse
por la existencia de gpedit.msc o consolas administrativas de otras ediciones.
No se propone dominio, gMSA, Active Directory o cambios de política.
[CreateServiceW](https://learn.microsoft.com/en-us/windows/win32/api/winsvc/nf-winsvc-createservicew).

**Compatibilidad conceptual no es certificación de Home.** Faltan la cuenta concreta,
sus derechos efectivos, el arranque del binario empaquetado, rutas Unicode,
antivirus y pruebas en nuestra VM. Si la cuenta virtual exige un mecanismo de
inicialización más costoso, una cuenta local dedicada es una alternativa a evaluar,
con costo de creación y gestión segura de credenciales; no se adopta ahora.
La cuenta de inicialización/propiedad de archivos y la del servidor deben quedar
compatibles; no se soluciona usando un servicio temporal con otro SID y dando
permisos amplios.

Restricted impide scripts PowerShell, no las API SCM/NTFS ni los ejecutables
PostgreSQL. Por tanto ninguna alternativa requiere cambiarlo. Pero los paquetes
actuales aún contienen dependencias PowerShell: deben sustituirse en servidor,
cliente, mantenimiento y asistente mediante rutas verificadas y sin editar los
archivos instalados protegidos por inventario.
[Política Restricted](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies?view=powershell-5.1).

El instalador enlazado por PostgreSQL para Windows es de EDB y añade componentes;
no debe ejecutarse con valores por defecto suponiendo que cumple nuestros nombres,
ACL, aislamiento o inventarios. Usar PostgreSQL oficial no implica ejecutar ese
instalador completo ni reutilizar el servicio instalado.
[Distribución Windows](https://www.postgresql.org/download/windows/).

## 7. Desarrollo, mantenimiento y actualizaciones

La valoración de esfuerzo es relativa; no hay todavía evidencia para dar una
estimación fiable en días o garantizar aceptación por el antivirus.

| Área | A: supervisor completo | B/C: servicio oficial, con auxiliar acotado en C |
| --- | --- | --- |
| Desarrollo | Mayor cantidad de lógica crítica y fallos Win32 que demostrar | Sigue habiendo trabajo nativo; el alcance puede cerrarse sin un motor de depuración |
| Instalación | Más etapas, observador, dependencias y posible transición de servicio | Cuenta, directorios, herramientas oficiales y validaciones; no requiere monitor residente de todos los hijos |
| Mantenimiento | Acoplamiento a topología, eventos, módulos y tokens exactos | Menor acoplamiento; mantener contratos de cuenta/ACL/procesos y primitivas oficiales |
| Antivirus | Hay más funciones de alto impacto que revisar; resultado desconocido | Menos comportamiento personalizado, pero ninguna promesa de evitar detecciones; cuarentena anterior sigue bloqueada |
| Actualización Windows | Hashes exactos por DLL pueden invalidar cargas legítimas | Proteger origen/ACL y revisar los componentes propios y dependencias; no desactivar inventarios silenciosamente |
| Actualización PostgreSQL | Revalidar además detalles internos supervisados | Revalidar binarios, argumentos, identidad, inicio/parada y regresiones; no reinicializar datos |

Un binario firmado identifica a su editor, no acredita por sí solo su seguridad ni
garantiza aceptación antivirus. La muestra en cuarentena sigue sin restaurarse,
ejecutarse o recompilarse; su revisión sigue una vía independiente.

18.3 es la versión autorizada en este trabajo, no una decisión de congelarla para
siempre. Las versiones menores reciben correcciones, incluidas las de seguridad;
el procedimiento productivo necesitará revisión y autorización de actualizaciones,
sin modificar ahora la versión ni asumir que cualquier futura versión satisface
estos contratos.
[Política de versiones PostgreSQL](https://www.postgresql.org/support/versioning/).

## 8. Cambios que requieren decisión explícita

| Decisión | Qué cambia | Situación actual |
| --- | --- | --- |
| Recomendada: elegir C y omitir DEBUG_PROCESS | Cambiar atestación de cada descendiente antes de ejecución por primer token medido + contención + confianza en código oficial + postcondiciones | Requiere autorización; no equivale a mantener la garantía anterior |
| Elegir B sin auxiliar de token | Sustituir restricción inicial medida por aislamiento de cuenta y herramientas oficiales | Requiere autorización adicional; no es mi recomendación mientras siga vigente el token inicial |
| Modificar Medium exacto, SID concretos o chequeo por DLL | Sustituir detalles del diseño por otra frontera validada | Debe declararse y aprobarse; no se cambian contratos o tests ahora |
| Tratar un residual solo con detección y recuperación | Cambiar una exigencia absoluta de ausencia por una garantía operativa limitada | Requiere autorización si se adopta como sustitución; no se declara equivalente |
| Cambiar tipo de cuenta o transición SCM | Afecta identidad, propiedad, credenciales y recuperación | Diseño a aprobar y probar antes de implementar |

Se conservan sin propuesta de reducción: servicio/clúster exclusivos, identidad
antes de escribir, privacidad ACL, mínimos privilegios, rechazo de bases ajenas,
secretos seguros, validaciones backend, firmas/inventarios, políticas y antivirus
intactos, excepción CMD únicamente interna, modo sintético y aceptación real.

## 9. Mínimo trabajo para desbloquear candidate-05

1. **Decisión arquitectónica:** aprobar C y su alcance de confianza o mantener la
   exigencia de atestación individual. Sin esa decisión no continuar implementando
   el depurador ni presentar B como equivalente.
2. **Prueba nativa acotada autorizada:** verificar cuenta/SID, ACL y el primer token
   suspendido bajo Windows 11 Home, y contención/limpieza de un intento. No ejecutar
   la muestra en cuarentena. Si no hay vía legítima para validar ese componente,
   C continúa bloqueada aunque el depurador se descarte.
3. **Cerrar identidad de cuenta y aprovisionamiento:** elegir y probar el mecanismo
   mínimo, sin contraseñas en CLI/solicitudes/logs ni asumir una transición SCM
   segura sin estados persistentes y lectura de vuelta. Configurador elevado solo
   para preparar el servicio; operación cotidiana sin elevación.
4. **Auxiliar y rutas propias sin PowerShell:** ACL/identidad/SCM, lanzamiento cerrado
   de initdb cuando proceda y Job de inicialización; usar Node para lógica existente.
   CMD queda interno a PostgreSQL. Verificar AutoRun del principal correcto, entorno,
   argumentos y archivos protegidos. No inventar un intérprete/escape genérico.
5. **Puertas de datos y recuperación:** clúster nuevo, marcador/inscripción, T0,
   rol SQL limitado, bootstrap interactivo único, logs, rechazo de fallos parciales,
   servicio/HTTPS e identidad; timeout no autoriza otro inicio ni borrar datos.
6. **Regresión e integración real:** cuentas/permisos incorrectos, token fallido,
   directorio/puerto/servicio ajenos, inyección por argumentos, perfiles Unicode,
   parada fallida, caída del configurador y reinicio. Reusar pruebas útiles sin
   imponer el antiguo modelo de depuración como requisito si se autoriza C.
7. **Construir después de esas puertas:** nuevos inventarios/hashes para servidor y
   cliente, setup-03 con ocho etapas. No alterar candidatos anteriores. Instalación
   aprobada únicamente después de T0, bootstrap, servidor, HTTPS, primer login,
   cierre y reinicio/persistencia reales en VirtualBox.

La evaluación no descubre una imposibilidad de PostgreSQL en Windows 11 Home.
Identifica un desajuste entre una aplicación que confía en software oficial y una
garantía de inspección propia de un ejecutor de código no confiable. Recomiendo
resolver esa decisión antes de escribir más infraestructura.

## Alcance de esta entrega

Solo se añade este documento. No hay código, tests, contratos, instaladores,
servicios, bases, políticas o antivirus modificados. No se ejecutaron pruebas
nuevas de producto ni validaciones nativas; las 237 aprobadas siguen siendo la
evidencia histórica, con sus límites. No se contactó a McAfee. Los diseños previos
permanecen conservados como antecedentes, sin convertir recomendaciones nuevas
en cambios autorizados.
