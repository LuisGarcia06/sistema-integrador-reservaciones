// Solo harness: mismo preload y manejador original; destino fijo sintético, sin impresora.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),http=require('node:http');
function install({origin,output,windows}){
  const {ipcMain,BrowserWindow}=require('electron'),contexts=new Map(),active=new Set(),pdfs=[],actions=[];let held=false,release=null,pending=false;
  const source=fs.readFileSync(path.join(__dirname,'../electron/main.js'),'utf8'),code=source.slice(source.indexOf('function isAllowedAppUrl('),source.indexOf('function showConnectionState('));
  const signature=sender=>sender.executeJavaScript("JSON.stringify({date:document.getElementById('daily-fecha')?.value,html:document.getElementById('daily-print-root')?.innerHTML,version:App.auth.obtenerVersionSesion()})");
  const requestLocalPath=(url,_timeout,token)=>new Promise((yes,no)=>{const base=new URL(origin),q=http.get({host:'127.0.0.1',port:base.port,path:url,headers:{Authorization:'Bearer '+token}},r=>{let body='';r.on('data',c=>body+=c);r.on('end',()=>yes({statusCode:r.statusCode,body}));});q.on('error',no);q.setTimeout(5000,()=>q.destroy(Error('DAILY_PDF_TIMEOUT')));});
  ipcMain.handle('daily:export-pdf',async(event,payload)=>{
    const win=BrowserWindow.fromWebContents(event.sender);if(!windows.includes(win)||active.has(win))return {ok:false,busy:true};
    const allowed=await event.sender.executeJavaScript("Boolean(window.App?.dailyCommands?.beginOutput('ipc'))");if(!allowed)return {ok:false,error:'not_allowed'};active.add(win);
    let registered=contexts.get(win),before=await signature(event.sender);
    if(!registered){let handler;const context={URL,APP_ORIGIN:origin,mainWindow:win,isExportingDailyPdf:false,EXPORT_DAILY_PDF_CHANNEL:'daily:export-pdf',path,fs:fs.promises,console,requestLocalPath,ipcMain:{handle(_channel,fn){handler=fn;}},dialog:{showSaveDialog:async()=>{
      pending=true;if(held)await new Promise(r=>release=r);pending=false;
      if(await signature(win.webContents)!==registered.before)return {canceled:true};
      const filePath=path.join(output,'daily-export-'+(pdfs.length+1)+'.pdf');registered.target=filePath;return {canceled:false,filePath};
    }}};vm.runInNewContext(code,context,{filename:'electron/main.js [Daily IPC original aislado]'});registered={handler,before,target:null};contexts.set(win,registered);}
    registered.before=before;registered.target=null;
    try{const result=await registered.handler(event,payload);actions.push({fecha:payload?.fecha,ok:result.ok,canceled:result.canceled,error:result.error});if(result.ok){const bytes=fs.readFileSync(registered.target);if(bytes.subarray(0,5).toString()!=='%PDF-')throw Error('INVALID_PDF');pdfs.push({file:path.basename(registered.target),fecha:payload.fecha,bytes:bytes.length});}return result;}
    finally{active.delete(win);if(!win.isDestroyed())await event.sender.executeJavaScript("App.dailyCommands.endOutput('ipc');true");}
  });
  return {pdfs,actions,hold(){held=true;},release(){held=false;release?.();release=null;},get pending(){return pending;},close(){ipcMain.removeHandler('daily:export-pdf');}};
}
module.exports={install};
