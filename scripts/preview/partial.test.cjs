'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {guard}=require('./windows11-contract.cjs');
const target={platform:'win32',arch:'x64',release:'10.0.26200',argv:['electron','--ctsk-synthetic-preview'],env:{}};
test('preview exige Windows 11 y activación explícita sin heredar configuración real',()=>{
 assert.equal(guard(target).productionAuthorized,false);assert.equal(guard(target).database,'none');
 for(const patch of [{release:'10.0.19045'},{release:'unknown'},{release:null},{arch:'ia32'},{argv:['electron']},{argv:[...target.argv,'--no-sandbox']},{env:{PGDATA:'existing'}},{env:{NODE_OPTIONS:'--inspect'}}])assert.throws(()=>guard({...target,...patch}),/PREVIEW_/);
});
function request(api,method,url,body,headers={}){return new Promise(resolve=>{
 const req={method,url,headers:{host:'127.0.0.1:43111',...headers},async *[Symbol.asyncIterator](){if(body)yield Buffer.from(JSON.stringify(body));}};
 const res={statusCode:200,headersSent:false,setHeader(){},end(data){resolve({status:this.statusCode,body:String(data)});}};
 api.server.listeners('request')[0](req,res);
});}
test('API sintética funciona en memoria sin listener, PostgreSQL ni backend real',async()=>{
 const api=require('./api.cjs').crearPreviewApi();api.server.address=()=>({port:43111});
 assert.equal((await request(api,'GET','/api/reservaciones')).status,401);
 assert.equal((await request(api,'GET','/index.html',null,{host:'evil.invalid'})).status,403);
 const page=await request(api,'GET','/index.html');assert.equal(page.status,200);assert.ok(page.body.includes('preview-capability'));
 const login=await request(api,'POST','/api/auth/login',{correo:'admin@demo.invalid',password:'Solo-Demo-05'});assert.equal(login.status,200);assert.ok(JSON.parse(login.body).token);
 assert.equal(api.server.listening,false);assert.equal(api.errors.length,0);
});
