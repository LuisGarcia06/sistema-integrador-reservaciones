// Electron real y main real. Solo se simula la elección del destino del diálogo PDF.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {app,BrowserWindow,dialog,session}=require('electron');
// Igual que los otros harnesses de impresión: render por software en el entorno de prueba.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('in-process-gpu');
const H=require('../backend/config/httpsLabPolicy'),B=require('../electron/httpsBackend');
const clientFile=process.argv[2],root=path.resolve(__dirname,'..');
if(process.argv.length!==3||!process.send)throw Error('HTTPS_DRIVER_ARGUMENTS');
let input,stage='starting',seenOffline=false,finished=false,checks=[],remote;
const timeout=setTimeout(()=>{console.error('HTTPS_DRIVER_TIMEOUT '+stage);app.exit(1);},110000);
function send(value){process.send(value);}
const pdf=path.join(path.dirname(clientFile),'daily-synthetic.pdf');
dialog.showSaveDialog=async()=>({canceled:false,filePath:pdf});
const inputReady=new Promise(resolve=>process.on('message',message=>{if(message.type==='input'){input=message;resolve();}}));
send({type:'input-ready'});
app.on('will-quit',()=>{clearTimeout(timeout);if(finished)console.log('HTTPS_ELECTRON_OK');});
async function wait(win,expression){for(let i=0;i<800;i++){
    if(win.isDestroyed())throw Error('WINDOW_DESTROYED');if(await win.webContents.executeJavaScript('Boolean('+expression+')'))return;
    await new Promise(r=>setTimeout(r,30));}throw Error('UI_WAIT '+expression);}
async function negativeTls(c){
    for(const test of input.tlsCases){
        const config={...c,port:test.port,origin:`https://127.0.0.1:${test.port}`,tlsSpki:test.tlsSpki};
        const ses=session.fromPartition('tls-negative-'+test.name);B.installTrust(ses,config);
        const win=new BrowserWindow({show:false,webPreferences:{session:ses,sandbox:true,nodeIntegration:false,contextIsolation:true,webSecurity:true}});
        try{
            if(test.name==='valid'){await win.loadURL(config.origin);assert(await win.webContents.executeJavaScript('isSecureContext'));}
            else await assert.rejects(win.loadURL(config.origin));
        }finally{win.destroy();}
    }
    checks.push('Electron valida TLS y rechaza CA desconocida, vencimiento y nombre incorrecto');
}
async function exercise(win){
    await inputReady;
    const prefs=win.webContents.getLastWebPreferences();assert(prefs.sandbox&&prefs.contextIsolation&&!prefs.nodeIntegration&&prefs.webSecurity);
    assert(await win.webContents.executeJavaScript('isSecureContext && !!navigator.locks && !!BroadcastChannel'));
    const login=()=>win.webContents.executeJavaScript(`App.auth.iniciarSesion(${JSON.stringify(input.credentials.correo)},${JSON.stringify(input.credentials.password)})`);
    if(stage==='starting'){
        stage='functional';remote=win;
        await login();await win.webContents.executeJavaScript("App.router.navigate('dashboard')");
        await wait(win,"document.querySelectorAll('[data-centro-group]').length===1");
        checks.push('Electron sandbox, contexto seguro, Web Locks, login y Centro de Avisos');
        await win.webContents.executeJavaScript("App.router.navigate('daily')");
        await wait(win,"document.getElementById('daily-fecha')");
        await win.webContents.executeJavaScript("document.getElementById('daily-fecha').value='2099-01-05';document.getElementById('daily-fecha').dispatchEvent(new Event('change'))");
        await wait(win,"document.querySelector('.daily-print-table') && !document.getElementById('daily-pdf-button').disabled");
        await win.webContents.executeJavaScript("document.getElementById('daily-pdf-button').click()");
        await wait(win,"document.getElementById('daily-message').textContent.includes('PDF guardado')");
        const buffer=fs.readFileSync(pdf);assert.equal(buffer.subarray(0,5).toString(),'%PDF-');assert(buffer.length>1000);
        checks.push('Daily PDF real mediante preload e IPC originales, revalidación HTTPS y guardado local');
        await negativeTls(H.readClient(clientFile));
        stage='awaiting-restart';send({type:'restart-needed'});
    }else if(stage==='awaiting-restart'){
        assert(seenOffline);assert.equal(await win.webContents.executeJavaScript('App.auth.estaAutenticado()'),false);
        await login();assert(await win.webContents.executeJavaScript("App.api.apiFetch('/api/reservaciones').then(()=>true)"));
        checks.push('Desconexión bloquea interfaz; reinicio reconecta con identidad nueva y exige sesión');
        finished=true;stage='done';send({type:'checks',checks});win.close();
    }
}
app.on('browser-window-created',(_event,win)=>{
    win.webContents.setBackgroundThrottling(false);
    // Mantener show:false desde el inicio, como printBrandingHarness; no hacer show/hide
    // durante la decodificación de imágenes del documento de impresión.
    win.show=()=>{};win.maximize=()=>{};
    win.webContents.once('did-finish-load',()=>{
        if(win.webContents.getURL().startsWith('https://'))exercise(win).catch(error=>{console.error('HTTPS_UI_FAILED '+error.message);app.exit(1);});
        else if(stage==='awaiting-restart'&&!seenOffline){
            try{assert(remote.isDestroyed());seenOffline=true;send({type:'offline-seen'});}catch(error){console.error(error.message);app.exit(1);}
        }
    });
});
process.argv=[process.execPath,root,'--ctsk-mode=https-lab','--ctsk-client='+clientFile];
require('../electron/main.js');
