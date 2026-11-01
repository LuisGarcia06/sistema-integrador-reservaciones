'use strict';
const {app}=require('electron'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
async function painted(w,selector){await evaluate(w,`document.querySelector(${q(selector)})?.scrollIntoView({block:'center'});new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await new Promise(r=>setTimeout(r,200));}
const evaluate=(w,s)=>w.webContents.executeJavaScript(s,true),q=JSON.stringify;
async function wait(w,s){for(let n=0;n<1200;n++){if(await evaluate(w,'Boolean('+s+')'))return;await new Promise(r=>setTimeout(r,25));}throw Error('SYNC_ELECTRON_TIMEOUT '+s.slice(0,80));}
async function field(w,id,value){await evaluate(w,`(()=>{const e=document.getElementById(${q(id)});e.value=${q(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
function attach(w){if(!process.send)throw Error('SYNC_PRIVATE_DRIVER_REQUIRED');process.once('message',async input=>{try{
 await wait(w,"App.sync024?.ready&&document.getElementById('login-form')");await field(w,'login-correo',input.credentials.correo);await field(w,'login-password',input.credentials.password);await evaluate(w,"document.getElementById('login-form').requestSubmit()");await wait(w,"App.auth.estaAutenticado()&&document.getElementById('dashboard-live-summary')");
 await evaluate(w,"App.router.navigate('configuracion')");await wait(w,"document.getElementById('sync024-host')?.textContent.includes('FareHarbor')");
 if(input.mode==='activate'){
  await wait(w,"document.getElementById('sync024-cutoff')");await field(w,'sync024-cutoff','2026-12-02T00:00');await field(w,'sync024-reason','Primera activación sintética confirmada por Administrador');await evaluate(w,"document.getElementById('sync024-confirm').checked=true;document.getElementById('sync024-fareharbor-form').requestSubmit();true");
  await wait(w,"document.getElementById('sync024-host')?.textContent.includes('2026-12-02T05:00:00')&&!document.getElementById('sync024-cutoff')");
 }
 assert.equal(await evaluate(w,"document.getElementById('sync024-host').textContent.includes('Activación bloqueada')"),true);
 assert.equal(await evaluate(w,"typeof require==='undefined'&&typeof process==='undefined'"),true);
 await painted(w,'#sync024-host');const output=path.join(input.output,'sync024-'+input.mode+'.png');fs.writeFileSync(output,(await w.webContents.capturePage()).toPNG());
 if(input.mode==='inspect'){await evaluate(w,"App.router.navigate('dashboard')");await wait(w,"document.getElementById('sync024-notices')?.textContent.includes('GetYourGuide: reconciliación manual requerida')");await wait(w,"document.getElementById('dashboard-live-summary')&&document.querySelector('[data-centro-group]')");await painted(w,'#sync024-notices');fs.writeFileSync(path.join(input.output,'sync024-avisos.png'),(await w.webContents.capturePage()).toPNG());}
 process.send({type:'integration-electron-result',result:{completed:true,mode:input.mode,originalElectron:true,screenshot:output}},()=>app.exit(0));
 }catch(e){console.error('SYNC_ELECTRON_FAILED '+e.message);try{console.error('SYNC_UI_STATE '+await evaluate(w,"document.getElementById('sync024-host')?.textContent"));fs.writeFileSync(path.join(input.output,'sync024-failed.png'),(await w.webContents.capturePage()).toPNG());}catch{}app.exit(1);}});process.send({type:'integration-electron-ready'});}
module.exports={attach};
