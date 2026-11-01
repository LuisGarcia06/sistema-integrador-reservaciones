# Fase2E.6 — incorporación obligatoria

Requisito añadido: **instalación definitiva completamente libre de datos sintéticos, ficticios o utilizados en desarrollo/pruebas**. Tiene carácter de puerta de salida: no declarar listo el piloto empresarial si el entregable conserva datos o dependencias de laboratorio.

El procedimiento normativo está en [INSTALACION-EMPRESARIAL-LIMPIA.md](INSTALACION-EMPRESARIAL-LIMPIA.md). No constituye autorización de despliegue ni sustituye el cierre del hitoB pendiente de2E.5.

La aceptación de2E.6 deberá acreditar:

- Base/clúster empresariales nuevos y migraciones/contratos explícitamente aprobados; sin modificar las bases actuales principal/dev.
- Estructura, relaciones, restricciones, permisos y roles/catálogos técnicos mínimos conservados.
- T0 con cero filas comerciales, usuarios/cuentas, operaciones, auditoría/eventos/referencias/ledgers de ensayo; sólo excepciones técnicas revisadas con contenido exacto.
- Bootstrap seguro propio, sin usuarios/contraseñas predeterminados; primer acceso y altas normales comprobados.
- FareHarbor/GetYourGuide desactivados, sin corte, cursor externo o vínculos heredados. Fechas empresariales se elegirán después.
- Paquetes con código operativo y dependencias aprobados, sin datos, dumps, fixtures, instrumentación, reportes/capturas, secretos/tokens o configuraciones privadas de laboratorio; evidencias separadas.
- Verificación automática de tablas/conteos/contenido técnico y de paquetes, con rechazo ante cualquier contaminación o dependencia no aprobada.
- Carga real separada, con procedencia, dry-run, revisión, autorización nominal y auditoría; nunca rellenar con datos inventados.
- Certificación técnica con alcance y limitaciones explícitos. No borrar datos de prueba para simular una instalación limpia ni alterar respaldos.

Las pruebas del requisito se ejecutan exclusivamente en clústeres sintéticos nuevos. Los datos T1 de aceptación posteriores a T0 se conservan en esos laboratorios detenidos, fuera de cualquier paquete; no se certifican como base de distribución. Los paquetes experimentales2E.5 no quedan promovidos automáticamente.
