# Contrato de primer acceso 023 (2E.1-A)

El perfil `first-access023-lab` sólo permite `POST /api/auth/login` y `GET/HEAD /api/auth/sesion`. No habilita escritores ni reutiliza la prueba A basada en fixtures como constancia de una instalación nueva.

El bootstrap conserva sus verificaciones y su prueba C legítima independiente. Crea cuenta y singleton en una transacción. El supervisor local `scripts/firstAccessAdmin.cjs` captura la clave de mantenimiento por TTY sin eco usando la utilidad anterior. El corredor automatizado usa canales privados en memoria; no se presenta como interacción humana manual.

El supervisor crea un par Ed25519 en memoria, fija sólo la clave pública en un manifiesto nuevo y liga ese manifiesto al digest exacto del manifiesto bootstrap. El hijo HTTP exige IPC heredado y genera un desafío aleatorio de 256 bits nuevo en cada arranque. El padre consulta de nuevo la instalación con su conexión local autorizada después de comprobar identidad y adquirir el candado común.

La atestación tiene propósito `ctsk-bootstrap-startup-verification023-v1`. Liga desafío, manifiestos, clúster, generación, catálogo023, singleton completo, cuenta pública inicial y tiempo de emisión. La firma se verifica con la clave pública fijada. Caduca en30 segundos y no admite tiempo futuro. No se publica una clave privada ni se fabrica una prueba de fixtures.

La verificación local exige singleton legítimo con intento/usuario exactos, principal autorizado, versión23, clúster/generación propios y huella vigente. Exige una cuenta activa Administrador/all, sin asignaciones, versión1, bcrypt12 y cero auditorías/comandos en esta entrada de primer acceso. Una base que sólo contiene un Administrador falla. El runtime verifica de nuevo identidad, privilegios, esquema023 exacto y cuenta pública antes de escuchar en loopback. Sigue sin privilegios sobre el singleton.

Reiniciar el hijo conserva JWT secret/generación y exige otra verificación viva con otro desafío. La clave SQL de aprovisionamiento y la contraseña de aplicación no se envían al hijo ni se escriben en evidencias. La configuración técnica privada del runtime conserva el mecanismo anterior de archivos `.env` por laboratorio con ACL; no se lee `.env` del repositorio.

La atestación acredita el estado durante el arranque; no sustituye los guards PostgreSQL. Las sondas de manipulación sólo actúan en clústeres sintéticos propios. No se modifica ninguna migración018–023 ni se conceden permisos nuevos. La habilitación comercial conjunta requiere un perfil B propio, pruebas y su puerta de avance.
