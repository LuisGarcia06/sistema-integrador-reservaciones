const { contextBridge, ipcRenderer } = require('electron');

function normalizeExportOptions(options) {
    return {
        fecha: options && typeof options.fecha === 'string' ? options.fecha : ''
    };
}

contextBridge.exposeInMainWorld('desktopAPI', {
    exportDailyPdf: (options) => ipcRenderer.invoke('daily:export-pdf', normalizeExportOptions(options))
});
