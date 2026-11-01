'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('setup026',{run:(action,ack=false)=>ipcRenderer.invoke('setup:action',{action,ack:ack===true})});
