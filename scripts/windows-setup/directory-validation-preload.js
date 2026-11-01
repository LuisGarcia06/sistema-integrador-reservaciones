'use strict';
const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('f02',{run:(action,ack)=>ipcRenderer.invoke('f02:action',{action,ack:ack===true})});
