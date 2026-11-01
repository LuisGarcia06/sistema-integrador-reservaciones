// Prueba de rechazo del paquete público en ESTE equipo no aislado. Ninguna conexión permitida.
const {app,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module');
const destination=process.argv[2];
if(!path.isAbsolute(destination||''))throw Error('PROBE_CLIENT_REQUIRED');
const temp=path.join(destination,'probe-temp');fs.mkdirSync(temp);app.setPath('temp',temp);
app.disableHardwareAcceleration();app.commandLine.appendSwitch('disable-background-networking');
let refused=false,reason,networkAttempts=0,serverImports=0;
const originalError=console.error;
console.error=(...args)=>{if(args[0]==='Arranque LAN detenido:')reason=args[1];originalError(...args);};
const originalLoad=Module._load;
Module._load=function(request,...args){
    if(request==='pg'||/(?:^|[\/\\])backend(?:[\/\\]|$)/.test(request)){serverImports++;throw Error('PROBE_SERVER_IMPORT');}
    return originalLoad.call(this,request,...args);
};
require('node:net').Socket.prototype.connect=function(){networkAttempts++;throw Error('PROBE_NETWORK_FORBIDDEN');};
const cp=require('node:child_process');cp.spawn=cp.fork=()=>{throw Error('PROBE_CHILD_FORBIDDEN');};
dialog.showErrorBox=(title)=>{if(title!=='Laboratorio LAN no autorizado')throw Error('PROBE_WRONG_ERROR');refused=true;};
process.argv=process.argv.slice(0,2).concat('--ctsk-client='+path.join(destination,'client/client.json'));
app.on('will-quit',()=>{
    if(!refused||networkAttempts||serverImports||!['LAN_NETWORK_NOT_ISOLATED','LAN_NETWORK_CHANGED','LAN_INVENTORY_UNAVAILABLE'].includes(reason)){console.error('LAN_CLIENT_PROBE_FAILED '+reason);process.exitCode=1;}
    else console.log('LAN_CLIENT_REJECTED_SAFELY_NO_SERVER_NO_NETWORK');
});
require(path.join(destination,'electron/lanEntry.js'));
