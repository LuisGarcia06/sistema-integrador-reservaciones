'use strict';
const {app}=require('electron');app.disableHardwareAcceleration();app.commandLine.appendSwitch('in-process-gpu');app.on('browser-window-created',(_,w)=>{w.show=()=>{};w.webContents.setBackgroundThrottling(false);w.webContents.once('did-finish-load',()=>require('./driver.cjs').attach(w));});
const args=process.argv.filter(a=>a.startsWith('--candidate='));if(args.length!==1)throw Error('CANDIDATE_REQUIRED');require(require('node:path').join(args[0].slice('--candidate='.length),'electron/main.js'));
