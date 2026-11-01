# Fase 2D.9A — Análisis y diseño de Usuarios y Catálogos

Fecha: 28 de octubre de 2026. Estado: análisis documental completado; implementación pendiente de revisión y autorización.

## 1. Conclusión y alcance

Existen **26 endpoints administrativos explícitos: 13 GET y 13 escritores**, además de dos endpoints de autenticación. Usuarios administra cuentas, contraseñas, roles y plataformas desde una página original. Configuración reúne seis catálogos: Tours, Guías, Operadores, Vehículos, Países y Plataformas. No existe un backend independiente de Configuración ni una API editable de Roles.

Los 13 escritores administrativos ya figuran en el contrato HTTP protegido 020. Pueden reutilizar su motor de precondiciones, idempotencia durable y recuperación, pero **eso no equivale a disponer de auditoría administrativa**. Ninguno de sus servicios registra Bitácora actualmente. El esquema 021, su escritor y su perfil HTTP restringen la auditoría a Operaciones, Transportes y Daily; habilitar rutas administrativas por sí solo sería insuficiente.

Se recomienda una ampliación posterior y aislada de esquema, provisionalmente **022**, que identifique Usuarios y Catálogos mediante referencias propias y preserve intactos los contratos anteriores. Después corresponderían servicios, formularios originales y validación integrada, en etapas separadas. Las credenciales y el primer Administrador requieren decisiones específicas de seguridad antes de implementarse.

Esta fase inspeccionó fuentes y evidencias anteriores. No inició servidores, Electron ni PostgreSQL; no ejecutó migraciones, suites de pruebas, scripts de aprovisionamiento o conexiones de datos. No modificó código, configuración, esquemas o contraseñas. Solo creó este informe y evidencia documental en `docs/local-fase-2d9a/`. Los 548 archivos de fuentes inventariados se comprueban por SHA-256 antes y después; los cambios locales anteriores permanecen conservados.

## 2. Inventario de módulos originales

| Módulo | Página / interfaz | Capas backend existentes |
| --- | --- | --- |
| Usuarios | `frontend/pages/usuarios.js`: alta, edición, estado y contraseña | `usuarios.routes.js`, `usuarios.controller.js`, `usuarios.validator.js`, `usuarios.service.js` |
| Roles | Selector y filtro en Usuarios | GET de roles dentro de Usuarios; constantes en `backend/constants/roles.js`; tabla `roles` |
| Asignación de plataformas | Selector all/selected y checkboxes de Usuarios | Validador/servicio de Usuarios; tabla puente `usuario_plataformas_visibles`; sin endpoint propio |
| Tours / actividades | Pestaña Tours de `frontend/pages/configuracion.js` | Rutas, controlador, validador y servicio `tours.*` |
| Guías | Pestaña Guías | Capas `guias.*` |
| Operadores / conductores | Pestaña Operadores | Capas `operadores.*`; no módulo separado de conductores |
| Vehículos | Pestaña Vehículos | Capas `vehiculos.*` |
| Países | Pestaña Países, únicamente alta | Capas `paises.*` |
| Plataformas | Pestaña Plataformas, únicamente alta | Capas `plataformas.*` |
| Configuración | Contenedor de las seis pestañas anteriores | No existe `/api/configuracion`; cada pestaña utiliza su endpoint de catálogo |
| Equivalencias externas de tours | Sin pestaña administrativa encontrada | Tabla `equivalencias_tours_externos` y servicio de resolución; sin CRUD HTTP administrativo encontrado |

Las rutas están montadas explícitamente en [backend/server.js](A:/sistema-integrador-reservaciones/backend/server.js:73). Los nombres de tablas se verificaron en `database/schema.sql` y migraciones existentes. “Actividades” corresponde a Tours; no se propone otra entidad.

`integracion_sync_estado`, `eventos_integracion` y `reservas_integracion_link` son infraestructura/estado de integraciones, no catálogos editables de Configuración. Sus controles permanecen fuera de esta propuesta. No se activa ninguna integración.

### Rutas reales

| Método | Ruta exacta | Función / particularidad |
| --- | --- | --- |
| GET | `/api/usuarios` | Listado; filtros de texto/rol/estado se aplican en frontend |
| GET | `/api/usuarios/roles` | Catálogo de roles; ruta declarada antes de `/:id` |
| GET | `/api/usuarios/:id` | Usuario público, sin password/hash |
| POST | `/api/usuarios` | Crear usuario y, si corresponde, asignaciones |
| PATCH | `/api/usuarios/:id` | Nombre, correo, rol, estado, modo y plataformas |
| PATCH | `/api/usuarios/:id/password` | Restablecer contraseña; cuerpo actual admite solo `password` |
| GET | `/api/tours` | Lista con activos e inactivos; no implementa filtro `activo` |
| GET | `/api/tours/:id` | Detalle |
| POST | `/api/tours` | Alta |
| PATCH | `/api/tours/:id` | Edición y activación/desactivación mediante `activo` |
| GET | `/api/guias` | Lista; admite `estado=true` o `estado=false` |
| GET | `/api/guias/:id` | Detalle |
| POST | `/api/guias` | Alta |
| PATCH | `/api/guias/:id` | Edición y activación/desactivación mediante `estado` |
| GET | `/api/operadores` | Lista; admite filtro `estado` |
| GET | `/api/operadores/:id` | Detalle |
| POST | `/api/operadores` | Alta |
| PATCH | `/api/operadores/:id` | Edición y activación/desactivación |
| GET | `/api/vehiculos` | Lista; admite filtro `estado` |
| GET | `/api/vehiculos/:id` | Detalle |
| POST | `/api/vehiculos` | Alta |
| PATCH | `/api/vehiculos/:id` | Edición, capacidad y activación/desactivación |
| GET | `/api/paises` | Lista |
| POST | `/api/paises` | Alta; sin edición ni desactivación implementadas |
| GET | `/api/plataformas` | Lista filtrada por alcance autorizado |
| POST | `/api/plataformas` | Alta; sin edición ni desactivación implementadas |
| POST | `/api/auth/login` | Autenticar y emitir JWT |
| GET | `/api/auth/sesion` | Leer identidad y permisos actuales del usuario autenticado |

No hay PUT o DELETE administrativos explícitos, endpoint de logout, endpoint de activar/desactivar separado, ni rutas para editar roles o asignaciones por separado. Express puede resolver HEAD a través de rutas GET y responder OPTIONS; ello no añade acciones comerciales. `endpoints.json` contiene método, ruta, archivo y línea obtenidos mediante extracción estática, sin importar los routers ni iniciar la aplicación.

El único DELETE administrativo indirecto encontrado es el reemplazo de filas de `usuario_plataformas_visibles` dentro del servicio de Usuarios. No elimina el usuario ni la plataforma. Las demás acciones de estado se resuelven por PATCH.

## 3. Roles y matriz de permisos vigentes

El código y los seeds definen **Administrador** y **Consulta**. “Administrador / Reservaciones” es una descripción funcional del proyecto: no hay una constante ni un seed de rol independiente llamado Reservaciones. No se inspeccionaron filas de bases existentes; la afirmación se limita a los roles soportados en fuentes. El listado de roles consulta la tabla; el servicio valida que `id_rol` exista, pero no impone por sí mismo una lista de nombres soportados.

| Acción | Administrador | Consulta all | Consulta selected | Selected sin plataformas |
| --- | --- | --- | --- | --- |
| Login, si está activo y credenciales válidas | Sí | Sí | Sí | Sí |
| GET de sesión propia | Sí | Sí | Sí | Sí |
| Página Usuarios; sus tres GET | Sí | No | No | No |
| Crear/editar/activar/desactivar/restablecer password de usuarios | Sí, con reglas de protección | No | No | No |
| Asignar rol, all/selected o plataformas | Sí | No | No | No |
| Página Configuración | Sí | Sí, lectura | No | No |
| Listas de Tours y Países | Sí | Sí | Sí, como catálogos auxiliares | Sí, como catálogos auxiliares |
| Lista de Plataformas | Todas | Todas | Solo IDs autorizados | Lista vacía |
| Detalle individual de Tour | Sí | Sí | No | No |
| Listas/detalles de Guías, Operadores y Vehículos | Sí | Sí | No | No |
| Cualquier alta/edición de catálogo | Sí | No | No | No |
| Bitácora | Sí | No | No | No |
| Reservaciones | Acceso y escritura autorizados | Lectura | Lectura de sus plataformas | Sin reservaciones visibles |

La autorización backend combina `autenticarUsuario`, `autorizarRoles` y la lista de lecturas selected de [alcanceReservaciones.middleware.js](A:/sistema-integrador-reservaciones/backend/middleware/alcanceReservaciones.middleware.js:5). Esta última permite listas auxiliares `/api/tours`, `/api/paises`, `/api/plataformas`, pero no sus detalles ni los otros catálogos.

La navegación selected actual se limita a Dashboard, Reservaciones e Integraciones según [frontend/js/auth.js](A:/sistema-integrador-reservaciones/frontend/js/auth.js:117). No se ampliarán sus pantallas para “hacer coincidir” una descripción funcional más general. La existencia de una ruta no equivale a permiso para usarla.

## 4. Flujos de Usuarios y seguridad

### Comportamiento implementado

| Flujo | Comportamiento actual que debe conservarse |
| --- | --- |
| Crear | Nombre, correo, contraseña y rol obligatorios; estado por defecto true; bcrypt con costo 12; respuesta pública sin hash |
| Editar | PATCH diferencial; no permite modificar `id_usuario`; contraseña rechazada en el PATCH general |
| Estado | PATCH `{estado:boolean}`; solo Administrador; desactivar requiere confirmación en el botón de fila |
| Protección propia | El Administrador no puede desactivar su propia cuenta ni degradar su propio rol |
| Último Administrador | El servicio bloquea Administradores activos en orden por ID y vuelve a leer la cuenta objetivo antes de impedir que desaparezca el último activo |
| Cambiar contraseña | Formulario original de nueva contraseña y confirmación; solo se envía `password`; un Administrador puede cambiar la suya o la de otro usuario, incluso inactivo |
| Asignar rol | Se valida ID positivo y existencia del rol; un Administrador puede promover/degradar a otro, con protección de último activo |
| Administrador → Consulta | Exige elección explícita de alcance final; no conserva silenciosamente acceso total |
| Consulta all | No admite asignaciones selected no vacías; lectura de todas las plataformas |
| Consulta selected | Lista de IDs enteros, positivos, únicos y ordenados; existencia comprobada con `FOR KEY SHARE` |
| Selected vacío | Es válido; no ve reservaciones y el catálogo de plataformas autorizado queda vacío |
| Persistir plataformas | Usuario/mode y reemplazo DELETE/INSERT de asignaciones dentro de una transacción |
| Login | Correo normalizado; compare bcrypt; 401 ante credencial inválida; 403 para inactivo con credencial válida |
| Logout | Limpieza local de token/identidad, solicitudes y DOM; no existe revocación server-side del JWT por logout |

Fuentes principales: [usuarios.service.js](A:/sistema-integrador-reservaciones/backend/services/usuarios.service.js:124), [validación de alcance](A:/sistema-integrador-reservaciones/backend/services/usuarios.service.js:198), [cambio de contraseña](A:/sistema-integrador-reservaciones/backend/services/usuarios.service.js:426) y [formulario original](A:/sistema-integrador-reservaciones/frontend/pages/usuarios.js:574).

La UI envía modo y conjunto completo de plataformas al modificarlos. El backend admite variantes parciales: enviar modo sin IDs utiliza un conjunto vacío; enviar solo IDs utiliza el modo actual. El adaptador propuesto debe confirmar explícitamente el conjunto final, no inferirlo de checkboxes viejos o de una respuesta de otra sesión.

### Sesiones: revocación actual y límites

El JWT contiene ID y datos de rol, con expiración por defecto de ocho horas. El middleware vuelve a consultar usuario, estado y rol; el servicio de alcance consulta modo y asignaciones sin caché. El ejecutor de comandos revalida al actor dentro de la transacción después de esperar el candado. Por tanto, el rol o las plataformas de un JWT anterior no otorgan permisos por sí solos.

El frontend verifica sesión antes de las solicitudes autenticadas y al navegar; también en foco, visibilidad y cada 30 segundos. Cambiar ID/nombre/rol/modo/plataformas invalida su versión local, aborta solicitudes y limpia páginas. Desactivar bloquea la siguiente autenticación de request. Eso no revoca retroactivamente una operación ya autorizada y confirmada.

**Cambiar password no invalida JWT emitidos**: no hay versión de sesión/credencial, lista de revocación ni comparación de emisión contra un instante de cambio. Password tampoco forma parte de la firma de sesión del frontend. Reactivar a una cuenta puede volver a admitir un JWT anterior que aún no haya expirado. Un logout local tampoco invalida una copia del token.

Para un perfil administrativo nuevo se recomienda diseñar, en una etapa de seguridad autorizada, una versión monotónica de sesión/credencial por usuario, incluida en JWT nuevos y comprobada contra DB. Se incrementaría al restablecer password y al desactivar; la invalidación por rol/alcance ya existe por relectura, y exigir un nuevo login para esos cambios sería una decisión adicional explícita. Esta propuesta requiere cambio de autenticación y probablemente otra columna/migración; no se añade aquí ni se presupone compatibilidad con JWT antiguos. Deben definirse los efectos de reset propio y la recuperación de su comando bajo una autenticación nueva del mismo actor. No se recomienda integrar ese flujo sin resolver esa transición.

### Hallazgos que requieren diseño y pruebas

| Hallazgo estático | Riesgo / tratamiento propuesto |
| --- | --- |
| Password valida solo string y longitud JS mínima 8 | Ocho espacios pueden guardarse, mientras login rechaza password blanco. Rechazar blancos en alta/reset manteniendo intacto el valor real, sin trim de la contraseña |
| No hay máximo de bytes en el validador HTTP de password | La biblioteca instalada documenta truncamiento bcrypt sobre 72 bytes UTF-8. Proponer máximo 72 bytes para nuevas capturas/reset, con pruebas multibyte; no cambiar contraseñas existentes ni truncar silenciosamente |
| Correo se normaliza en validador, pero UNIQUE de DB es sobre texto original | Datos históricos con diferencias de mayúsculas podrían ser ambiguos para login `LOWER(correo) LIMIT 1`. No se afirma que existan. Diseñar preflight sintético y, si se aprueba, unicidad normalizada posterior; sin correcciones masivas |
| Rol de destino solo debe existir en DB | Añadir en el perfil nuevo validación de los dos roles soportados; rechazar filas de rol desconocido, sin crear un rol Reservaciones |
| Guardar el mismo conjunto de plataformas reemplaza filas | No-op comercial puede cambiar `xmin` y contexto global. Comparar modo y conjuntos normalizados antes de escribir/auditar |
| Consulta → Administrador mantiene modo/filas de plataforma almacenados | Sesión/alcance reconoce Admin como all, pero `comandos.service.authorize` examina el modo almacenado. Podría restringir comandos con plataformas pese al rol Admin. Reproducir y alinear el ejecutor con el alcance efectivo ya definido; no limpiar asignaciones ni modificar roles silenciosamente |
| PATCH de asignaciones solo puede cambiar la tabla puente | El ETag de usuario actual no incorpora esa tabla; el contexto global sí cambia. Hoy podría producir 409 de contexto en vez de 412 de cuenta. Documentar ambos, sin inventar una revisión BIGINT |
| Algunos controladores registran el objeto de error completo | Un error PostgreSQL podría incluir detalles de fila. El nuevo camino sensible debe registrar códigos/metadatos permitidos y comprobar que no aparecen password/hash/token en logs |

El límite bcrypt se verificó en el código instalado `node_modules/bcryptjs/index.js`, función `truncates`. Son hallazgos de inspección; esta fase no ejecutó reproducciones ni certificó datos de una base real.

### Primer Administrador en instalación limpia

`database/seeds.sql` crea roles, un país y plataformas; **no crea usuarios**. POST Usuarios exige un Administrador autenticado y no puede servir como bootstrap público. El aprovisionador de laboratorio sí crea usuarios sintéticos; `scripts/usuariosDevDb02.cjs` está ligado a un entorno específico y no debe ejecutarse ni reutilizarse como inicializador general.

Propuesta para una fase posterior:

1. Aprovisionador local explícito, sin endpoint HTTP abierto ni cuenta/password predeterminados.
2. Verificar configuración privada, ACL, identidad de base/clúster/rol y esquema exactos. El ensayo inicial será solo sobre un clúster nuevo desechable.
3. Admitir únicamente instalación sin usuarios, con un único rol soportado de cada nombre. Rechazar una base con usuarios existentes, incluso si no queda un Admin activo: ese caso es recuperación administrativa, no bootstrap.
4. Tomar exclusión transaccional y volver a comprobar ausencia; dos inicializadores no deben crear dos cuentas por carrera. Obtener el rol por nombre validado, no asumir su ID.
5. Captura humana de credencial por canal local sin eco; no usar argumentos, URL, logs, archivos de texto o repositorio. Hashear con bcrypt12; credencial no persistida en manifiestos.
6. Crear Admin activo, comprobar el resultado público y registrar constancia técnica de aprovisionamiento sin secretos. Cerrar privilegios de inicialización y arrancar API con su rol runtime limitado.

La constancia de bootstrap debe identificar al aprovisionador local como tal. No atribuir retrospectivamente la creación al nuevo usuario como si ya estuviera autenticado, ni inventar un comando con un actor que todavía no existía. Si se exige un evento transaccional de bootstrap en la propia Bitácora, habrá que aprobar un origen/actor de inicialización específico: el `id_usuario` actual es un actor obligatorio y no representa esa identidad. Se recomienda decidirlo por separado, evitando hacer nullable al actor de toda Bitácora solo para resolver este caso.

## 5. Catálogos: campos, validaciones y relaciones

| Catálogo | Campos/validación actual | Estado y operaciones |
| --- | --- | --- |
| Tours | `nombre` requerido, trim, máximo 150; `descripcion` texto trim, sin máximo específico, por defecto `''`; `activo` booleano por defecto true | POST/PATCH; desactivación lógica |
| Guías | `nombre` requerido, trim, máximo 120; `estado` booleano por defecto true | POST/PATCH; desactivación lógica |
| Operadores | Igual a Guías: nombre120 y estado booleano | POST/PATCH; desactivación lógica |
| Vehículos | `identificador` requerido trim máximo50; `placas` opcional NULL/vacío→NULL máximo20; `color` opcional máximo50; `capacidad` número entero 1–12; estado por defecto true | POST/PATCH; desactivación lógica; identificador y placas únicos según constraints actuales |
| Países | `nombre` requerido trim máximo150; índice único `LOWER(TRIM(nombre))` | GET/POST; sin estado ni PATCH/DELETE |
| Plataformas | `nombre` requerido trim máximo50; índice único normalizado | GET/POST; sin estado ni PATCH/DELETE |

Los PATCH rechazan cuerpos vacíos y campos no permitidos; IDs de catálogo no son editables. Los límites comerciales de texto usan actualmente `.length` de JavaScript; no se igualan silenciosamente a la regla Unicode del motivo. No hay unicidad de nombre implementada para Tours/Guías/Operadores; no se inventará.

Los servicios de edición toman `FOR UPDATE`, comparan diferencias y omiten UPDATE si no hay cambios. Las altas de catálogos con detalle realizan INSERT y lectura posterior; fuera de un ejecutor transaccional no debe presumirse atomicidad de ambas consultas. El motor 020 ya las envuelve en la transacción exterior usando el pool central y su fachada.

### Dependencias PostgreSQL

| Registro | FK directas que lo utilizan | Impacto indirecto |
| --- | --- | --- |
| Rol | `usuarios.id_rol` | Permisos de todas las solicitudes y comandos |
| Usuario | `usuario_plataformas_visibles.id_usuario`, `bitacora.id_usuario`, actor del ledger020; `eventos_integracion.reviewed_by/applied_by/archived_by` | Historial de responsables y autorización. `reservaciones.vendedor` es texto, no una FK a Usuarios |
| Plataforma | `reservaciones.id_plataforma`, `usuario_plataformas_visibles.id_plataforma` | Alcance de lectura, comandos y Daily a través de las reservaciones |
| País | `reservaciones.id_pais` | Datos de pasajeros y Daily |
| Tour | `reservaciones.id_tour`, `operaciones_tour.id_tour`, `equivalencias_tours_externos.id_tour` | Agrupación, turno, transportes por operación y Daily |
| Guía | `operaciones_tour.id_guia` | Operaciones y Daily |
| Operador | `transportes_operacion.id_operador` | Transportes y Daily |
| Vehículo | `transportes_operacion.id_vehiculo` | Capacidad y presentación de transportes/Daily |

Las FK examinadas no declaran borrado en cascada; el comportamiento por defecto es NO ACTION. No se propone eliminar usuarios o registros comerciales usados históricamente. El DELETE de asignaciones puente es una operación de seguridad autorizada dentro de la transacción, no una eliminación de catálogo.

### Capacidad, inactivos e historia

La reducción de capacidad de un vehículo bloquea los transportes referenciados en orden y rechaza si alguno supera el nuevo límite al sumar PAX de reservas no canceladas. La consulta no se limita a fechas futuras. Se conserva esta regla, el máximo12, el máximo24 por tour/turno, y el mínimo operativo de dos PAX al asignar vehículo desde Transportes. PAX incluye niños; no se suma `ninos` nuevamente. Referencia: [vehiculos.service.js](A:/sistema-integrador-reservaciones/backend/services/vehiculos.service.js:182).

Los selectores originales excluyen inactivos para nuevas selecciones y mantienen visible la asociación inactiva que ya estaba elegida al editar. Las FK permanecen; desactivar no desasigna clientes, guías o transportes. Daily y consultas históricas siguen usando joins con los catálogos, sin eliminar filas por su flag de activo.

**La UI no equivale a una regla backend uniforme de inactividad.** Por ejemplo, la lectura del vehículo usada al asignar transporte consulta ID/capacidad sin estado; las FK solo prueban existencia. Si se desea impedir nuevas asociaciones a inactivos desde cualquier cliente, debe aprobarse como endurecimiento explícito, con distinción entre conservar una asociación histórica y elegir una nueva. Esta fase no modifica ese comportamiento.

Los nombres de catálogos mostrados por joins son sus valores actuales; renombrar un tour/guía/operador puede cambiar el texto de una consulta histórica o de un nuevo PDF sobre una fecha anterior. No existe congelación general del nombre comercial histórico. La auditoría propuesta conservaría anterior/nuevo del catálogo, sin agregar snapshots comerciales a Reservaciones o al Daily ni alterar su formato.

## 6. Compatibilidad con 020 y 021

| Aspecto | 020 existente | 021 existente | Diseño recomendado |
| --- | --- | --- | --- |
| Los 13 escritores administrativos | Incluidos en `revisionApiContract.routes`; probados en el corredor API020 | Bloqueados por `auditApiPolicy.command` y por el perfil frontend021 | Perfil administrativo nuevo, cerrado y optativo; conservar los anteriores |
| Transacción exterior, candado y savepoints | Disponibles | Disponibles | Reutilizar motor y pool central |
| UUIDv4, huella HMAC de cuerpo/precondiciones/actor | Disponibles | Disponibles | Reutilizar; motivo y password de petición quedan ligados a la intención, sin persistirlos en ledger |
| Recibo y GET de comando | Disponibles para recursos administrativos | Motor disponible, pero rutas administrativas fuera de alcance | Revalidar actor y referencia objetivo; no exponer recibos ajenos |
| Revisión de Usuario/Catálogos | `revision:null`; estado de fila + `xmin` interno forman ETag | Misma infraestructura subyacente | No exigir ni inventar una columna revision para integrarlos |
| Plataformas de Usuario | La tabla puente forma parte del contexto global | Igual | Comparar conjunto efectivo; considerar una foto compuesta en un contrato futuro explícito, si se decide clasificar el cambio como 412 |
| Auditoría administrativa | No implementada | Escritor/snapshots/FK/CHECK solo para tres recursos operativos | Ampliación de esquema y escritor administrativo propia |
| Formularios administrativos originales | Aún envían llamadas normales | No cargados/adaptados por la entrada021 | Adaptadores optativos sobre sus formularios existentes |

Los servicios originales pueden ejecutarse con protección **020** sin reescribir su lógica comercial: las 13 rutas están contempladas. Ninguno puede considerarse ya integrado a auditoría **021** sin trabajo adicional. Las reglas de seguridad/no-op identificadas requieren tratamiento específico incluso cuando el transporte HTTP ya sea reutilizable.

El estado actual de recursos sin revisión usa `to_jsonb(fila)` y `xmin` solo en servidor. En Usuarios esa fila interna contiene el hash de password, que influye en el HMAC de ETag/contexto. No se devuelve esa fila como snapshot público ni debe convertirse en snapshot de auditoría, log o respuesta. El ledger guarda huellas HMAC y referencias, no el cuerpo de la intención. Fuentes: [revisionApiState.js](A:/sistema-integrador-reservaciones/backend/security/revisionApiState.js:3), [commandIntent.js](A:/sistema-integrador-reservaciones/backend/security/commandIntent.js:1), [comandos.service.js](A:/sistema-integrador-reservaciones/backend/services/comandos.service.js:55).

## 7. Contrato propuesto para cada escritor

Las siguientes reglas son comunes a **cada fila** de la matriz:

- Administrador autenticado, revalidado después del candado y antes de escribir, más las reglas particulares del usuario objetivo. No usar rol/plataformas del body ni confiar en el JWT antiguo.
- Confirmación humana de la intención completa; UUIDv4 por intención. En POST, confirmar y congelar antes de pedir precondiciones ligadas al cuerpo. En PATCH, conservar la foto autorizada al abrir.
- Cabeceras de protocolo y generación exactas, `If-Match` y `If-Operational-Match`, más `Idempotency-Key`. Revisión nula es válida para estos recursos; el ETag continúa siendo obligatorio.
- 412 por registro obsoleto; 409 por contexto o negocio, distinguiendo reutilización de clave. Conservar propuesta/motivo, comparar contra GET autorizado sin renovar precondiciones y exigir decisión humana y nueva confirmación para otra intención.
- Recibo posterior a COMMIT; duplicados reconocidos sin repetir negocio/auditoría. Respuesta perdida: GET `/api/comandos/:clave` con actor y generación originales, sin reenvío. Desconocido no concluyente bloquea nueva escritura.
- No-op real sin nueva auditoría; fallo técnico revierte negocio, asignaciones, auditoría y ledger. 401/403 no se convierten en rechazos comerciales ni autorizan reintento.

| Escritor exacto | Foto/precondición y dependencia específica | Propuesta de evento administrativo |
| --- | --- | --- |
| POST `/api/usuarios` | Ausencia/intención del cuerpo; rol soportado, correo y catálogo de plataformas; credencial oculta | CREAR usuario con snapshot público; motivo opcional |
| PATCH `/api/usuarios/:id` | Usuario original y permisos/asignaciones; protecciones propia/último Admin; conjunto final ordenado | MODIFICAR, una entrada con todos los cambios efectivos; motivo obligatorio |
| PATCH `/api/usuarios/:id/password` | Cuenta objetivo y estado de credencial por ETag opaco, sin leer el hash al cliente; política de revocación pendiente | CAMBIAR_PASSWORD: exclusivamente metadatos, motivo obligatorio, snapshots NULL |
| POST `/api/tours` | Cuerpo confirmado, contexto de catálogos | CREAR, campos públicos; motivo opcional |
| PATCH `/api/tours/:id` | Tour original; relaciones con reservas/operaciones/equivalencias | MODIFICAR nombre/descripción/activo; motivo obligatorio |
| POST `/api/guias` | Cuerpo confirmado y contexto | CREAR; motivo opcional |
| PATCH `/api/guias/:id` | Guía original y operaciones relacionadas | MODIFICAR nombre/estado; motivo obligatorio |
| POST `/api/operadores` | Cuerpo confirmado y contexto | CREAR; motivo opcional |
| PATCH `/api/operadores/:id` | Operador original y transportes relacionados | MODIFICAR nombre/estado; motivo obligatorio |
| POST `/api/vehiculos` | Cuerpo, unicidad y capacidad1–12 | CREAR; motivo opcional |
| PATCH `/api/vehiculos/:id` | Vehículo original; transportes/reservas y validación bloqueada de reducción | MODIFICAR; resaltar cambio de capacidad; motivo obligatorio |
| POST `/api/paises` | Cuerpo y unicidad normalizada | CREAR; motivo opcional; no inventar PATCH/DELETE |
| POST `/api/plataformas` | Cuerpo, unicidad normalizada y repercusión en permisos | CREAR; motivo opcional; no asignar la plataforma a usuarios selected automáticamente |

Los botones de estado utilizan su PATCH correspondiente y necesitan las mismas protecciones y motivo. No crean rutas nuevas. Las acciones de rol, plataformas y nombre/estado enviadas juntas deben producir **una auditoría por cambio confirmado**, no una auditoría por cada campo.

Un alta nueva de Plataforma amplía naturalmente el catálogo visible para Consulta all; selected permanece ligado a sus IDs y no recibe permisos nuevos. Cambios de cualquier catálogo, usuario, rol o asignación alteran el contexto conservador actual de comandos operativos pendientes. La foto del registro operativo puede no cambiar y aun así corresponder 409; no se debe afirmar que editar un catálogo es ajeno a Reservaciones/Operaciones/Transportes/Daily.

El contexto incluye todas las tablas funcionales salvo Bitácora; no incluye el ledger. Un no-op que solo confirma un comando no debe invalidar otras intenciones por sí mismo. El reemplazo innecesario de asignaciones es la excepción actual que se propone corregir.

## 8. Diseño de auditoría administrativa y esquema posterior

### Estado actual

Los servicios de Usuarios y seis Catálogos no llaman a `crearEntradaBitacora` ni al escritor estructurado. La captura del motor de comandos registra IDs solo cuando el servicio inserta una auditoría. Por tanto, un recibo administrativo con `ids_bitacora:[]` en 020 no demuestra un evento administrativo auditado.

021 exige una referencia entre Operaciones, Transportes y Daily y valida exclusivamente sus claves de snapshots. Su trigger coteja método/ruta/recurso/ID/actor/generación/clave e IDs del recibo. No admite Usuarios/Catálogos ni un evento de password sin snapshots. Fuentes: [CHECK021](A:/sistema-integrador-reservaciones/database/migrations/021_auditoria_recursos_lab.sql:75) y [trigger021](A:/sistema-integrador-reservaciones/database/migrations/021_auditoria_recursos_lab.sql:108).

### Propuesta mínima, aún no autorizada

Reutilizar la tabla Bitácora y el ledger existentes. Diseñar una migración posterior **022 provisional**, aplicada primero solo a un clúster nuevo. No editar los archivos 018/019/020/021 ni hacer que sus verificadores acepten otra estructura.

1. Añadir referencias administrativas tipadas con FK: `id_usuario_afectado` —distinto del actor `id_usuario`—, `id_tour`, `id_guia`, `id_operador`, `id_vehiculo`, `id_pais`, `id_plataforma`. Son **columnas propuestas**, no existentes ni creadas en esta fase. Una referencia por evento; las referencias comerciales anteriores quedan NULL en esos eventos.
2. Introducir una rama administrativa de formato, provisionalmente versión3, manteniendo las ramas histórica NULL y operativa2. La nueva migración ampliaría explícitamente CHECK/grants/funciones mediante definiciones nuevas; no alteraría retrospectivamente filas ni fabricaría eventos.
3. Snapshot de Usuario estrictamente permitido: `nombre`, `correo`, `id_rol`, `estado`, `alcance_plataformas` almacenado y `platform_ids` ordenados. No copiar `SELECT *`. Si se presenta un nombre de rol, obtenerlo de DB y distinguirlo de una columna del usuario. El alcance efectivo Admin all debe explicarse aparte del dato de alcance almacenado.
4. Snapshots de catálogos limitados a las columnas comerciales de la tabla del apartado5, sin IDs internos ajenos, cuerpos HTTP o metadatos de autenticación.
5. Acciones CREAR/MODIFICAR con antes/nuevo según corresponda; MODIFICAR exige diferencia material y motivo. Acciones de rol/plataformas/estado/capacidad se identifican a partir de los campos modificados; no necesitan una tabla de eventos paralela.
6. Acción especial CAMBIAR_PASSWORD: referencia del usuario afectado, actor/nombre histórico, instante, origen, motivo y vínculo de comando. **Sin valores anteriores/nuevos de contraseña, ni hashes, longitudes, prefijos, tokens o copia del body.** Sus snapshots serían NULL; no simular un MODIFICAR convencional.
7. Vínculo diferido y unicidad de intención administrativa, cotejando el comando confirmado y `ids_bitacora`. Los servicios usarían el mismo cliente/PID/transacción de negocio; la auditoría se inserta antes del ledger y ambos se confirman juntos. Preservar rechazo durable sin auditoría de éxito y no-op con IDs vacíos.
8. Mantener inmutabilidad, prohibición de UPDATE/DELETE/TRUNCATE de Bitácora, grants de INSERT por columnas y funciones limitadas. Revalidar estas propiedades en el verificador nuevo.

La ampliación no puede limitarse a añadir columnas y un segundo trigger: el CHECK021 rechaza versiones distintas de2/NULL y su trigger procesa cualquier versión no NULL como operativa. La migración022 deberá sustituir explícitamente esas definiciones en el clúster nuevo por una validación/distribución que conserve exactamente la rama021 y admita la administrativa. Las filas históricas y versión2 deben exigir referencias administrativas NULL. Las FK existentes, la ejecución ALWAYS y el carácter diferido no deben perderse. Un índice único administrativo y la validación del array de IDs del recibo impedirán más de una auditoría por intención. El verificador022 comprobará la definición completa; el verificador021 original seguirá rechazando esa estructura extendida.

No se propone usar `id_operacion_tour`, `id_transporte_operacion`, `id_daily_observacion` o `id_reservacion` como referencias ficticias de administración. Tampoco un `recurso/id` genérico sin FK cuando ya se conocen las siete tablas objetivo. Las siete referencias explícitas son una ampliación revisable del modelo y requieren autorización.

El escritor administrativo compartiría contexto interno autenticado, proyección permitida y validación de motivo hasta500 caracteres Unicode; el motivo no sería columna comercial. Ninguna ruta permitiría POST directo de Bitácora. La UI original ampliaría su renderizado por tipo/versión sin mostrar el ledger como segunda Bitácora.

La revocación durable de credenciales es una **necesidad de seguridad separada** de las FK administrativas: si se aprueba el contador de sesión, definir otra ampliación acotada o su incorporación expresa a la migración acordada. No agregar tablas de sesiones, refresh tokens, colas o nuevos servicios si el requisito puede resolverse con la versión de credencial. No se escoge ni implementa ahora una migración productiva.

## 9. Reutilización de interfaces y componentes

| Componente | Reutilización posible | Adaptación mínima necesaria en una fase autorizada |
| --- | --- | --- |
| `usuarios-form` | Conservar sus modos create/edit/password, campos y selectores | Abrir edición con foto autorizada, motivo separado, confirmación, bloqueo y recibo; proteger también botones de estado |
| `catalogo-form` | Conservar seis pestañas, campos, validaciones y PATCH diferencial | Adaptador por recurso; motivo y confirmación; no perder intención al cambiar pestaña/buscar/cerrar |
| `commandLab.CommandSession` | Estado, congelación, UUID, guard, recibo y recuperación | Altas hoy solo admite Reservaciones/Operaciones/Transportes; password no está en `supported`; se requiere extensión optativa cerrada |
| `comparisonRead` | Patrón GET autorizado ya usado en módulos operativos | Ampliar a Usuarios/Catálogos: actualmente no los acepta. Sin ello `accept` vuelve a pedir precondiciones automáticamente al rechazar; no reutilizar esa rama para este diseño |
| Lectura del alta creada | Referencia de creación verificable en recibo | Países/Plataformas no tienen GET individual: usar su lista autorizada y seleccionar el ID confirmado, sin inventar endpoints |
| `commandPanel` | Formato genérico de recibos, recuperar y consultar actual por separado | No necesita mostrar el body ni password; nuevo perfil debe entregar el mismo contrato seguro de recibo |
| `revisionConflict` | Comparación de campos públicos con texto escapado | Proyección cerrada de Usuario y conjuntos de plataformas. **No usarlo directamente con password**: enumera claves de la propuesta y mostraría el secreto como texto |
| `auditUi` | Campo/validación de motivo y protocolo optativo | Configurar el contrato nuevo expresamente; no habilitar rutas ni altas por presencia de un flag genérico |
| `auth`, `apiFetch`, reset de páginas | Revalidación, cancelación y versión de sesión existentes | Reutilizar; fortalecer comprobaciones locales en callbacks de escritura y respuesta tardía. Cambios de JWT solo en la etapa de seguridad aprobada |

El borrador sensible de alta/password debe mantenerse únicamente en memoria para el envío confirmado; no va en localStorage, disco, URL, snapshots, comparadores o mensajes. El campo de confirmación no se envía. La confirmación humana describe la cuenta y la acción y señala que la credencial está oculta. Al terminar o invalidarse la identidad se liberan referencias y se limpian campos; no se promete borrado físico de strings en memoria de JavaScript.

El replay se resuelve por huella y ledger antes de volver a hashear password o llamar al servicio. Ante resultado desconocido se conserva la correlación original y se bloquea otra intención; no se cambia password con otra clave “para probar”. Un reset propio que invalide el token debe permitir una conciliación explícita tras autenticarse nuevamente como el mismo actor, sin heredar automáticamente una edición de otra sesión.

Las UI originales hoy confirman la desactivación de fila, pero no todas las altas/ediciones/reactivaciones. El nuevo perfil debe pedir confirmación para toda intención protegida conservando las advertencias específicas. Los usuarios inactivos siguen listados/administrables por Admin y sin login; no se ocultan para eludir controles. Consulta all conserva Configuración solo de lectura; selected conserva sus restricciones.

No se modificarían `frontend/index.html` ni el router principal para activar el ensayo; la entrada sería explícita y cargaría `usuarios.js`, `configuracion.js` y la Bitácora original con adaptadores optativos. No se construirían formularios paralelos.

## 10. Estrategia de laboratorio propuesta

Nombres únicamente propuestos para revisión: perfil `admin-audit-api-lab`, esquema022 y protocolo `ctsk-admin-audit-api-v1`. No existen ni se habilitaron en esta fase. Se propone un identificador distinto para que un cliente021 no interprete silenciosamente un formato administrativo diferente.

Reutilizar el aprovisionador de clúster nuevo con directorio privado, ACL, generación UUID, claves separadas y entorno limpio. Verificar identidad offline y efectiva, rol limitado y ausencia de bases ajenas antes de aplicar el esquema. Verificar021 en su clúster predecesor y luego verificar022 con contrato nuevo; los lectores antiguos deben rechazar022, no aceptar una huella forzada.

La API y el host Electron escucharían solo en 127.0.0.1 y puertos propios no protegidos. Sin `.env`, datos reales, migraciones de bases existentes, respaldos de producción, servicios/tareas Windows, LAN o integraciones. Datos/credenciales sintéticos y captura de fallos solo por IPC privado.

Lista de escritores: exactamente las 13 filas del apartado7. Lecturas: sesión; listas/roles/detalles administrativos realmente existentes; Bitácora con filtros actuales; precondiciones y recuperación exactas. Mantener bloqueados los escritores de Reservaciones, Operaciones, Transportes, Daily e Integraciones en ese perfil administrativo. Las regresiones de esos módulos se ejecutarían aparte con sus perfiles originales.

Las listas con filtro estado admitirían únicamente sus valores declarados; las demás lecturas no admitirían parámetros inventados. Rechazar rutas normalizadas de forma ambigua, parámetros duplicados/extra, IDs fuera de rango, métodos adicionales y assets no enumerados. Las pruebas de Consulta deberán llegar al backend con un sobre completo para distinguir un 403 real de un rechazo previo del proxy por falta de precondiciones.

No se crearía infraestructura de colas, sincronización, un segundo backend ni persistencia de borradores. Cerrar procesos y registrar puertos/PID/identidades propias al terminar cada ensayo, también los fallidos.

## 11. Matriz de pruebas: existente y por desarrollar

**Evidencia heredada:** 2D.8B.3 conserva 1,053 pruebas/36 suites, 22 grupos API020 con cobertura de sus25 escritores, 44 grupos API021 y16 grupos de UI021. Son resultados de esa fase, no ejecuciones nuevas de 2D.9A. `usuariosAlcance.test.js` y `frontendScope.test.js` existen, pero no forman parte de aquella selección de36 suites; no se les atribuye un resultado actualizado aquí.

E = existe código de prueba o evidencia anterior relacionada; N = cobertura nueva necesaria. Que exista una prueba parcial no demuestra integración administrativa completa.

| # | Tema | E: cobertura localizada | N: aceptación requerida |
| --- | --- | --- | --- |
| 1 | Crear/modificar Usuarios | `usuariosAlcance.test.js`; API020 crea/edita y repite | Formularios originales + auditoría022, fotos, no-op público y valores persistidos |
| 2 | Roles | Pruebas de degradación/promoción y protección propia/último Admin | Dos Admin concurrentes; rol desconocido; promoción con alcance almacenado selected; coherencia sesión/ejecutor |
| 3 | Plataformas | IDs inválidos/duplicados, all con IDs, FK y rollback simulado | Conjunto igual sin DELETE/INSERT/auditoría; cambios puente y ETag/contexto; conjunto completo confirmado |
| 4 | Consulta all/selected | `accessScope.routes.test.js`, sesiones y regresiones operativas | Perfil administrativo cerrado para ambas; GET catálogos permitido/denegado exacto; ninguna escritura |
| 5 | Selected sin plataformas | Suite de alcance contempla array vacío | UI/API del perfil nuevo, listas vacías sin filtraciones, sin acceso a Usuarios/Bitácora/Configuración |
| 6 | Revocación durante operación | API021 y UI021 verifican espera/retención y permisos actuales | Actor administrativo esperando candado, degradado/inactivo; prohibir escribir o recuperar; descartar respuestas tardías |
| 7 | Sesiones concurrentes | UI operativa y alcance actualizados entre requests | Dos sesiones de la misma cuenta y dos Admin; cambio de permisos/password y política de sesión aprobada |
| 8 | Escalamiento | Consulta no modifica su alcance ni crea usuarios; JWT antiguo no impone permisos | Body con actor/rol/nombre snapshot falsos; IDOR de usuarios/comandos; roles no soportados; Admin efectivo all coherente |
| 9 | Password | bcrypt12 en servicio; separación del PATCH; recibos020 sin secreto | UTF-8 hasta72bytes y blancos según política aprobada; campos enmascarados; ningún plaintext/hash/token en auditoría/log/recibo/errores/comparador; revocación real |
| 10 | Primer Admin | Seeds sin usuario; preparadores sintéticos y script específico no general | Bootstrap local de instalación vacía, doble inicializador, identidad incorrecta, fallo antes/después de INSERT, negativa si ya hay usuarios; trazabilidad sin actor ficticio |
| 11 | Crear/editar catálogos | API020/019 recorre altas/PATCH existentes | Todas las pestañas originales, unicidad/límites/defaults/NULL, motivo, snapshot y recibo022 |
| 12 | Inactivos con referencias | UI conserva la selección inactiva original; servicios conservan FK | Desactivar sin borrar/desasignar; histórico visible; si se autoriza, impedir asociación nueva desde API manteniendo la antigua |
| 13 | Reservaciones | Regresiones de Reservaciones y contexto | Tour/País/Plataforma cambian contexto de comandos pendientes; nombre histórico por join documentado |
| 14 | Operaciones | Regresiones y contexto de Guías/Tours | Catálogo editado entre foto y envío; 409 sin pérdida de motivo/propuesta ni asignación automática |
| 15 | Transportes | Regresiones y cambios de vehículo/operador | Renombre/estado/capacidad concurrentes; dependencias y mínimo2 preservados |
| 16 | Capacidad | `capacidad.service.test.js`; escenarios operativos reales | Reducción con transportes de varias fechas, reserva cancelada y PAX con niños; 12/24, capacidad real y rollback de auditoría |
| 17 | Conflictos Admin | 412/409 probados en módulos operativos | Cada tipo de edición administrativa, original/propuesto/actual públicos, decisión humana antes de otra foto/UUID |
| 18 | Idempotencia/recuperación | API020 cubre los13 escritores; UI021 pierde respuesta y recupera | Cada formulario administrativo, incluido password y países/plataformas sin GET individual; reinicio, clave con otro motivo, desconocido sin reenvío |
| 19 | Auditoría sin secretos | Recibos/HMAC020, allowlist021 y tests de escape | Snapshots versión3 exactos, FK de objetivo correcta, password metadatos solamente, nombre histórico de actor y escape de HTML/JSON |
| 20 | Rollback parcial | Usuarios: fake DB para asignaciones; UI/API021: SQL real | Negocio/asignaciones/auditoría/ledger022 en mismo cliente/PID/xact; fallos SQL, diferidos y respuesta perdida tras COMMIT |
| 21 | Compatibilidad | Evidencias anteriores de Reservaciones/Operaciones/Transportes/Daily y020/021 | Repetir perfiles originales sin ampliar verificadores; PDF/impresión intactos; consultas históricas NULL/v2/v3 |
| 22 | Aislamiento | Aprovisionadores y cierre de fases anteriores | Nuevo cluster022, usuarios sintéticos, rutas/assets exactos, HTTP127.0.0.1, rechazo de destinos existentes y cierre comprobado |

Las pruebas nuevas deberán usar tanto Jest aislado como Electron/HTTP/PostgreSQL reales. No se dará por probado un rollback transaccional real a partir de fake DB, ni una autorización backend a partir de ocultar un botón. Comparar filas/hashes y transacción efectiva; no imprimir credenciales sintéticas como parte de la evidencia.

## 12. Riesgos y reversión

Los riesgos principales son ampliar rutas sin auditoría válida, filtrar password en comparadores/logs, aceptar una autorización anterior al candado, confundir el Admin efectivo con su alcance almacenado y tratar asignaciones idénticas como cambios reales. También requieren decisión la inactividad como regla backend y la invalidación durable de tokens.

La reversión de **esta fase** consiste únicamente en retirar selectivamente este informe y `docs/local-fase-2d9a/` si no hay cambios posteriores; no hay código ni esquema que revertir. `source-verification.json` y el estado Git inicial permiten comprobarlo. No usar reset/clean/restauraciones masivas ni borrar artefactos de fases anteriores.

Para una implementación futura, guardar respaldos selectivos con hashes antes de editar, detener el laboratorio antes de cambiar fuentes, rechazar restauración si el archivo recibió cambios posteriores y volver al perfil anterior creando otro clúster sintético nuevo. No se propone DOWN destructivo, eliminación de usuarios/comandos/auditorías ni adaptación de una base de datos existente.

## 13. Etapas propuestas y decisiones para revisión

| Etapa propuesta | Alcance autorizado que habría que solicitar | Criterio de salida |
| --- | --- | --- |
| 2D.9B.1 — Persistencia administrativa aislada | Contrato y migración022 nuevos, referencias propias, snapshots permitidos, evento de credencial y vínculos durables; sin UI ni escritores HTTP | Esquema sintético exacto, inmutabilidad, rechazo de secretos/actor falso y compatibilidad021 verificados |
| 2D.9B.2 — Servicios y API administrativos | Perfil nuevo con los13 escritores, adaptaciones optativas de servicios, no-op de plataformas, autorización efectiva de Admin | Atomicidad real y recuperación, rechazos, roles y capacidad; sin ampliar perfiles anteriores |
| 2D.9B.3 — Formularios originales | Adaptadores de Usuarios/Configuración, motivo y comparación segura; Bitácora administrativa | Recorrido completo en Electron y regresiones sin activar la entrada principal |
| Seguridad de credenciales — subetapa previa al flujo password integrado | Política de bytes/blancos, revocación de tokens, reset propio, primer Admin y constancia de bootstrap | Revisión explícita del cambio de autenticación/esquema y pruebas de sesiones; ningún secreto auditado |

La numeración y los identificadores de perfil/protocolo son propuestas, no archivos ni contratos implementados. Puede separarse la etapa de credenciales de las altas/ediciones no sensibles para no imponer un cambio global de autenticación junto al primer ensayo de catálogos. No debe declararse completado password si esa etapa sigue pendiente.

Decisiones a revisar antes de implementar:

1. Aprobar referencias tipadas y formato administrativo posterior a021, manteniendo una sola Bitácora y una auditoría por intención efectiva.
2. Aprobar la política de revocación de credenciales y el manejo de JWT anteriores; no asumir que el comportamiento actual ya la ofrece.
3. Acordar bootstrap local y su constancia de origen; decidir si exige un evento específico en DB sin atribución humana ficticia.
4. Aprobar la política de password nueva y cualquier preflight/índice de correo normalizado como cambios separados y acotados.
5. Decidir si impedir nuevas asociaciones a inactivos será un endurecimiento de backend; mantener mientras tanto el comportamiento constatado.
6. Confirmar que Países/Plataformas siguen siendo solo alta, Roles no tiene editor y las equivalencias/integraciones permanecen fuera del alcance.

**Siguiente fase ejecutable recomendada: 2D.9B.1, únicamente esquema y contrato de auditoría administrativa en laboratorio desechable, después de autorizar este diseño.** No habilitar todavía rutas administrativas en021, modificar formularios o comenzar la siguiente etapa de forma automática.

## 14. Evidencia de esta inspección

- `docs/local-fase-2d9a/source-before.json`: hashes de548 archivos de fuentes y documentos base seleccionados; no incluye `.env` ni secretos.
- `docs/local-fase-2d9a/source-verification.json`: comparación final, sin cambios/eliminaciones de esos archivos ni fuentes nuevas.
- `docs/local-fase-2d9a/endpoints.json`: 26 endpoints administrativos y2 de autenticación, con fuentes/líneas.
- `docs/local-fase-2d9a/references.json`: funciones y líneas revisadas para los principales hallazgos.
- `docs/local-fase-2d9a/git-status-before.txt`: estado completo de cambios locales y archivos sin seguimiento al iniciar.

Los datos de prueba citados proceden de evidencias sintéticas de fases anteriores. Esta fase no los volvió a ejecutar ni leyó credenciales de esos laboratorios. Los únicos archivos nuevos son documentación y evidencia de inspección.
