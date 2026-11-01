// Harness sin bypass de políticas: importa el main real y usa el perfil de laboratorio.
const fs=require('node:fs'),path=require('node:path');
const {app}=require('electron');
const manifest=process.argv[2],root=path.resolve(__dirname,'..');
if(!manifest||process.argv.length!==3)throw Error('LAB_MANIFEST_REQUIRED');
let passed=false;
const timeout=setTimeout(()=>{console.error('ELECTRON_CHECK_TIMEOUT');app.exit(1);},50000);
app.on('will-quit',()=>{clearTimeout(timeout);if(passed)console.log('STANDALONE_ELECTRON_CLOSED_OK');});
app.on('browser-window-created',(_event,win)=>{
    win.on('show',()=>win.hide());
    win.webContents.once('did-finish-load',async()=>{
        try{
            const prefs=win.webContents.getLastWebPreferences();
            if(!prefs.sandbox||!prefs.contextIsolation||prefs.nodeIntegration||!prefs.webSecurity)throw Error('INSECURE_RENDERER');
            const credentials=JSON.parse(fs.readFileSync(path.join(path.dirname(manifest),'test-user.json')));
            const result=await win.webContents.executeJavaScript(`(async()=>{
                await App.auth.iniciarSesion(${JSON.stringify(credentials.correo)},${JSON.stringify(credentials.password)});
                const rows=await App.api.apiFetch('/api/reservaciones');
                return App.auth.esAdministrador() && !!rows;
            })()`);
            if(!result)throw Error('LOGIN_FAILED');
            passed=true;win.close();
        }catch{console.error('ELECTRON_CHECK_FAILED');app.exit(1);}
    });
});
process.argv=[process.execPath,root,'--ctsk-mode=independent-dev','--ctsk-manifest='+manifest];
require('../electron/main.js');
