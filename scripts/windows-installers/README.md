# Candidatos Windows 2E.7

Solo aceptación sintética 026. No instalar en equipos empresariales.

La compilación, mantenimiento local y pruebas pendientes se describen en
`docs/FASE-2E7-INSTALADORES-WINDOWS.md`. La configuración global `dist:win`
no se usa para estos candidatos separados.

Los instaladores no se ejecutan durante build/audit. `Maintain-Server.ps1`
es exclusivamente para la siguiente aceptación en VM Windows 11 x64, con
solicitud y autoridad sintética externas. No crea confianza ni certificados.
