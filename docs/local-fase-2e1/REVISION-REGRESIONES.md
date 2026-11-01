# Revisión de regresiones 2E.1

Se revisaron los wrappers PowerShell, preparadores y casos antes de autorizar su ejecución. `AuditApiLab.ps1` crea su directorio privado y clúster nuevo; aplica021 sólo allí y prueba Operaciones/Transportes/Daily, Bitácora y ledger. Crea cuentas sintéticas de fixtures; cambia nombre/estado/rol para probar autorización. No restablece contraseñas mediante HTTP. `AdminAuditApiLab.ps1` crea otro clúster nuevo; aplica022 y prueba los seis Catálogos, auditoría y ledger, con Usuarios/password cerrados. Sus fixtures crean cuentas, sin contraseñas reales.

Ambos limpian el entorno heredado, usan únicamente puertos loopback nuevos, verifican identidad antes de SQL y detienen su clúster/hijos en finally. No leen `.env` del repositorio ni comparten el clúster de consolidación. No se ejecuta `CommandApiLab.ps1` completo. Las regresiones023 A+C se ejecutaron también en clústeres nuevos independientes y sus cambios de contraseña son únicamente las pruebas sintéticas privadas expresamente autorizadas.

Los resultados deben leerse en los informes reales correspondientes; esta revisión no declara ninguna ejecución exitosa.
