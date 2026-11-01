# Inspección previa a cargar Daily — 2D.6

La pantalla original es frontend/pages/daily.js; usa los CSS comunes (incluido pages.css) y los renderizadores HTML internos. Selecciona fecha, consulta GET /api/daily/operativo?fecha=YYYY-MM-DD, presenta resumen, operaciones por turno/grupo, transportes, pasajeros asignados y pendientes. No realiza escrituras de negocio ni tiene formulario de observaciones generales. El API operativo no incluye esas observaciones; sí muestra observaciones de reservación y operador.

Observaciones generales: existen GET y PUT /api/daily/observaciones?fecha=..., con cuerpo {observaciones:string}, trim y UPSERT por fecha en daily_observaciones. PUT solo Administrador. El contrato de comandos ya admite ese PUT. daily_observaciones no tiene la columna revision BIGINT de las tres tablas revisadas en 019: se conserva revision=null y el ETag de la fila/MVCC o ausencia del contrato existente. No añadir columna ni inventar una revisión.

El laboratorio agregará un control nuevo identificado como tal, dentro de la pantalla original, con GET autorizado y foto antes de habilitar edición. No se presenta como formulario previamente existente. No añade observaciones generales a las hojas de impresión: el formato vigente imprime notas de pasajeros y de operador y excluye pendientes de asignar. Se preserva esa distinción.

HTTP original: POST /api/auth/login, GET /api/auth/sesion (también al refrescar permisos), GET /api/daily/operativo?fecha=... al seleccionar fecha. El laboratorio añade únicamente GET /api/daily/observaciones?fecha=..., POST /api/precondiciones para el PUT exacto y GET /api/comandos/:clave. Ninguna otra ruta de negocio se habilita.

PDF: el botón original espera assets y llama desktopAPI.exportDailyPdf({fecha}); electron/preload.js expone únicamente esa función vía contextBridge y ipcRenderer.invoke('daily:export-pdf'). El main verifica sender/origen/ruta /app/, autentica/refresca sesión, consulta GET operativo, ejecuta webContents.printToPDF con printBackground/preferCSSPageSize, abre diálogo de destino, vuelve a verificar autorización y escribe solo si continúa autorizado. El laboratorio ejecutará esas funciones originales aisladas del arranque principal, con preload original y diálogo sustituido por destino sintético dentro del directorio privado del ensayo. No habilitar acceso de archivos desde renderer ni nuevos IPC.

Impresión: el botón original espera logo, refresca sesión, compara identidad de consulta y llama window.print(). No usa IPC propio. En el ensayo window.print será un contador/inspector; la salida de impresión se verificará además con printToPDF real, sin trabajos ni diálogos de impresoras físicas.

Efectos laterales: UPSERT de observaciones + ledger de comando en transacción externa; PDF solo escribe un archivo de prueba; impresión de prueba no envía trabajo. El servicio Daily no genera bitácora propia, no se agrega auditoría en esta fase. Logo original .jpeg para impresión y .jpg para layout, ambos individualmente autorizados como assets.

Permisos vigentes: Administrador consulta, exporta/imprime y guarda; Consulta all consulta y puede usar los botones originales de PDF/impresión, no guarda; Consulta selected no accede a Daily ni rutas operativas. Se preserva exactamente esa política y la revocación. No cargar módulos de Operaciones/Transportes/Reservaciones ni habilitar sus escritores.

Antes del ensayo se guardaron huellas de 501 archivos de código/configuración previos y copias puntuales de daily.js, commandLab.js y commandFrontendHost.cjs. Entrada principal, Electron main/preload, servicios, migraciones y módulos anteriores permanecen sin modificar.
