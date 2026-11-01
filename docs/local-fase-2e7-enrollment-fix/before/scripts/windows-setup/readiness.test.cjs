'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const P=require('./policy.cjs');
function inspectHarness(options={}){
 const calls=[],module={exports:{}};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'readiness.cjs'),'utf8'),{module,__dirname,process:{platform:'win32',arch:'x64',env:{LOCALAPPDATA:options.local||"C:\\Users\\María & O'Connor %PATH% !\\AppData\\Local"}},require(id){
  if(id==='node:os')return {release:()=>options.release||'10.0.26200'};
  if(id==='node:fs')return {realpathSync:x=>x,readFileSync(file){calls.push(file);return String(file).endsWith('candidate-reference.json')?JSON.stringify({server:{inventorySha256:'server'},client:{inventorySha256:'client'}}):String(file).includes('server')?'server':'client';}};
  if(id==='./policy.cjs')return P;
  if(id==='./integrity.cjs')return {verify(){calls.push('helper');return {scope:options.badScope?'other':P.SCOPE};},sha:x=>options.badDigest?'bad':x};
  if(id==='./payload.cjs')return {verify(_root,side){calls.push(side);if(options.badPayload)throw Error('PAYLOAD_INTEGRITY');return {release:options.badRelease?'other':P.RELEASE};}};
  if(id==='node:path')return path;if(id==='node:child_process')throw Error('PROCESS_FORBIDDEN');throw Error('UNEXPECTED_IMPORT');
 }});return {inspect:()=>module.exports.inspect('C:\\Setup'),calls};
}
test('inventarios se verifican en Node sin ejecutar PowerShell o PostgreSQL',()=>{const h=inspectHarness(),r=h.inspect();assert.equal(r.verified,false);assert.equal(r.readOnly,true);assert.equal(r.provisioningAllowed,false);assert.equal(r.productionAuthorized,false);assert.equal(r.blocker,'NATIVE_SECURITY_REQUIRED');assert.ok(h.calls.includes('server')&&h.calls.includes('client'));});
for(const option of ['badScope','badDigest','badPayload','badRelease'])test('rechaza '+option,()=>assert.throws(()=>inspectHarness({[option]:true}).inspect(),/INTEGRITY/));
test('Windows 10 se rechaza antes de leer inventarios',()=>{const h=inspectHarness({release:'10.0.19045'});assert.throws(h.inspect,/VM_WINDOWS11_REQUIRED/);assert.equal(h.calls.length,0);});
test('SO ambiguo se rechaza antes de leer inventarios',()=>{const h=inspectHarness({release:'unknown'});assert.throws(h.inspect,/VM_WINDOWS11_REQUIRED/);assert.equal(h.calls.length,0);});
test('coordinador no puede convertir verificación parcial en permiso de escritura',async()=>{
 const module={exports:{}};let inspections=0;
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'coordinator.cjs'),'utf8'),{module,__dirname,require(id){if(id==='./policy.cjs')return P;if(id==='./readiness.cjs')return {inspect(){inspections++;return {verified:false,readOnly:true};}};if(id==='node:path')return path;throw Error('UNEXPECTED_IMPORT');}});
 assert.equal((await module.exports.dispatch('verify',true)).verified,false);
 for(const action of P.STEPS.slice(1))await assert.rejects(module.exports.dispatch(action,true),/NATIVE_SECURITY_REQUIRED/);
 assert.equal(inspections,1);assert.throws(module.exports.context,/NATIVE_SECURITY_REQUIRED/);
 await assert.rejects(module.exports.dispatch('verify',false),/SESSION_REJECTED/);
 const status=await module.exports.dispatch('status');assert.equal(status.stateNotRead,true);
});
