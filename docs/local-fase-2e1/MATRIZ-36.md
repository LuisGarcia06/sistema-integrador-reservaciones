# Cobertura de los36 requisitos integrales

Ejecución aprobada: clúster7702116992483490452, una base023, un backend y entrada original `electron/main.js`. Cn indica el grupo numerado en `consolidation-verification.json.checks`;31 grupos contienen varias aserciones. B es `unified-backend-final-same-cluster.json`. Las comprobaciones externas al renderer se distinguen expresamente.

| Requisito | Evidencia y resultado |
| --- | --- |
| 1. Primer Administrador/login | Bootstrap/HTTP previo en el mismo clúster;C3; negativosA independientes aprobados |
| 2. Segundo Usuario | C5, formulario original y auditoría3 |
| 3. Roles/plataformas | C5 yC24 |
| 4. Catálogos necesarios | C6, seis pestañas originales |
| 5. Registrar Reservaciones | C7, formulario original |
| 6. Modificar/cancelar | C7 y cancelación visible enC11 |
| 7. Operaciones/guías | C8, formulario original |
| 8. Transportes/vehículos | C8, panel original y mínimo operativo |
| 9. Asociar Reservaciones | C8, controles Organizar originales y comando durable |
| 10. Capacidad/PAX | C9, vehículo3/máximo12/24–25/niños;B agrega concurrencia, cambios de identidad, canceladas, no-op y sobrecupos históricos |
| 11. Daily fecha/tour | C10, datos del grupo y transporte originales |
| 12. PDF/impresión | C10, archivo real por IPC original e impresión interceptada; revisión visual y extracción independientes |
| 13. Historial | C11, filtros y cancelación histórica2020 |
| 14. Tres auditorías | C11, Bitácora original y filas PostgreSQL históricas/2/3 |
| 15. Notificaciones/Avisos | C4, campana, filtro, grupo e historial sintéticos por GET reales |
| 16. Cambiar Usuarios/roles | C24, formularios originales |
| 17. Reset/revocación | C25–26, dos sesiones ajenas y propia |
| 18. Consulta all | C21, controles originales y backend403 |
| 19. Consulta selected | C22, plataforma visible y exclusión de oculta |
| 20. Selected sin plataformas | C23, lista vacía y navegación restringida |
| 21. Rutas no autorizadas | C21–23, cada vista nueva espera render denegado; solicitudes directas backend403; matrizB rechaza superficie externa |
| 22. Dos Administradores | C12, ventanas originales con sesiones separadas |
| 23. Conflictos409/412 | C12–13, revisión explícita y UUID nuevo |
| 24. Idempotencia/replay | C14, replay del POST real con una auditoría; B agrega simultaneidad y reutilización de clave |
| 25. Respuesta perdida/COMMIT | C15, respuesta retenida hasta timeout y recuperación porGET sin reenviar |
| 26. Resultado desconocido | C16–18, dos404 no concluyentes, misma clave y navegación bloqueada |
| 27. Fallo auditoría | C16, inyección SQL privada y hash sin cambios |
| 28. Fallo ledger | C17, inyección SQL privada y hash sin cambios |
| 29. Restricción diferida | C18, rollback total comprobado |
| 30. Navegar tras logout | C28, ruta privada termina en login |
| 31. Respuestas tardías | C19–20, lectura retenida y éxito posterior aCOMMIT no repueblan página |
| 32. Credenciales aisladas | C25–27, secretos retirados, referencia mínima y almacenamiento inspeccionado; scanner del supervisor |
| 33. Tráfico externo ausente | Trazas reales de supervisor/runtime sólo127.0.0.1 y puertos propios; sesiones Electron filtran otro origen y deshabilitan red de fondo; proveedores/webhooks no montados |
| 34. Reinicio backend/Electron | C26 yC29–31, procesos reales distintos |
| 35. Conservación de datos | C30–31, consulta original y hash comercial/auditoría/ledger idéntico antes/después |
| 36. Cerrar procesos propios | `closure.json`:29 clústeres de toda la fase detenidos, cero procesos/listeners propios; comprobación del sistema operativo |

Las inyecciones de fallos, retención de respuesta, diálogo de guardado y sustitución de impresión física son instrumentos privados. Los formularios, solicitudesHTTP, backend, transacciones, JWT, PostgreSQL y PDF son reales. Jest910 no sustituye estas comprobaciones.
