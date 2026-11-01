'use strict';
// Instrumento externo al paquete; no se distribuye con cliente/servidor.
const {app}=require('electron'),path=require('node:path');
app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');
app.on('browser-window-created',(_event,w)=>{w.show=()=>{};w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',()=>require('../../scripts/pilot025ReferenceDriver.cjs').attach(w));});
require(path.join(__dirname,'packages/client/electron/main.js'));
