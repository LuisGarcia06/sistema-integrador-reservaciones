const {EventEmitter}=require('node:events'),net=require('node:net'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const g=require('../../scripts/devDb02.cjs');
const identity={database:g.DATABASE,username:'dev_app',address:'::1/128',port:5432,schema:'public',version:'18.3'};
describe('DEV-DB-02: identidad, entorno y privilegios',()=>{
 test.each([{database:'sian_kaan_reservaciones'},{port:5433},{address:'192.0.2.1'},{schema:'otro'},{version:'18.4'},{username:'otro'}])('aborta ante destino distinto: %j',change=>expect(()=>g.validateIdentity({...identity,...change},'dev_app')).toThrow('DEV_IDENTITY_MISMATCH'));
 test('acepta identidad local exacta',()=>expect(g.validateIdentity(identity,'dev_app')).toEqual(identity));
 test('rechaza objetos que no sean tablas antes de inicializar',async()=>{
  const db={query:jest.fn().mockResolvedValueOnce({rows:[identity]}).mockResolvedValueOnce({rows:[{allowed:false}]}).mockResolvedValueOnce({rows:[{kind:'function',name:'custom_function'}]})};
  await expect(g.verifyIdentity(db,{empty:true})).rejects.toThrow('DEV_DATABASE_NOT_EMPTY');
 });
 test('rechaza cluster distinto',async()=>{
  const db={query:jest.fn().mockResolvedValueOnce({rows:[identity]}).mockResolvedValueOnce({rows:[{allowed:true}]}).mockResolvedValueOnce({rows:[{cluster:'otro'}]})};
  await expect(g.verifyIdentity(db)).rejects.toThrow('DEV_CLUSTER_MISMATCH');
 });
 test.each(['rolsuper','rolcreatedb','rolcreaterole','rolreplication','rolbypassrls'])('rechaza privilegio directo o heredado %s',async flag=>{
  await expect(g.rejectPrivilegedRole({query:async()=>({rows:[{rolname:'dev_app'},{rolname:'privileged_member',[flag]:true}]})})).rejects.toThrow('DEV_PRIVILEGED_ROLE_FORBIDDEN');
 });
 test('acepta rol ordinario sin membresias privilegiadas',async()=>{await expect(g.rejectPrivilegedRole({query:async()=>({rows:[{rolname:'dev_app'}]})})).resolves.toBeUndefined();});
 test('no hereda configuracion empresarial, tokens ni opciones Node',()=>{
  const cfg={DB_HOST:'localhost',DB_PORT:'5432',DB_NAME:g.DATABASE,JWT_SECRET:'synthetic',GYG_GMAIL_SYNC_ENABLED:'false'};
  const env=g.cleanEnvironment(cfg,{username:'dev_app',password:'synthetic'},{PATH:'safe',DB_NAME:'sian_kaan_reservaciones',PGDATABASE:'primary',APP_CONFIG_PATH:'foreign',FAREHARBOR_USER_KEY:'foreign',WHATSAPP_ACCESS_TOKEN:'foreign',GOOGLE_APPLICATION_CREDENTIALS:'foreign',GYG_GMAIL_SYNC_ENABLED:'true',NODE_OPTIONS:'--require evil',ELECTRON_RUN_AS_NODE:'1'});
  expect(env.DB_NAME).toBe(g.DATABASE);expect(env.APP_CONFIG_PATH).toBe(g.CONFIG);expect(env.GYG_GMAIL_SYNC_ENABLED).toBe('false');
  for(const key of ['PGDATABASE','FAREHARBOR_USER_KEY','WHATSAPP_ACCESS_TOKEN','GOOGLE_APPLICATION_CREDENTIALS','NODE_OPTIONS','ELECTRON_RUN_AS_NODE'])expect(env).not.toHaveProperty(key);
 });
 test('no permite iniciar sin credenciales interactivas',()=>expect(()=>g.cleanEnvironment({},{})).toThrow('DEV_CREDENTIALS_REQUIRED'));
 test.each([[{host:'external.invalid',port:5432}],[{host:'localhost',port:443}],[443,'localhost'],['/tmp/socket'],[{port:5432}]])('bloquea socket ajeno %j',(...args)=>expect(g.socketTargetAllowed(args)).toBe(false));
 test.each([[{host:'localhost',port:5432}],[5432,'127.0.0.1'],[{host:'::1',port:5432}]])('solo permite PG local %j',(...args)=>expect(g.socketTargetAllowed(args)).toBe(true));
});
describe('DEV-DB-02: puerto y pertenencia del backend',()=>{
 test('un listener IPv4 existente impide arrancar; no lo termina',async()=>{
  const own=net.createServer();await new Promise(r=>own.listen(0,'127.0.0.1',r));
  try{await expect(g.assertPortFree(own.address().port)).rejects.toThrow('DEV_PORT_UNAVAILABLE');expect(own.listening).toBe(true);}finally{await new Promise(r=>own.close(r));}
 });
 function child(){const c=new EventEmitter();c.killed=false;c.kill=jest.fn(()=>{c.killed=true;});c.stdout={resume:jest.fn()};c.stderr={resume:jest.fn()};return c;}
 test('puerto ocupado aborta antes de crear proceso',async()=>{
  const spawnProcess=jest.fn();await expect(g.startOwnedBackend({execPath:'node',env:{},spawnProcess,checkPort:async()=>{throw Error('occupied');}})).rejects.toThrow('occupied');expect(spawnProcess).not.toHaveBeenCalled();
 });
 test('solo acepta ready privado del proceso creado con nonce exacto',async()=>{
  const c=child();let options;const spawnProcess=jest.fn((exe,args,opts)=>{options=opts;setImmediate(()=>c.emit('message',{type:'dev-ready',nonce:opts.env.APP_DEV_BACKEND_NONCE}));return c;});
  await expect(g.startOwnedBackend({execPath:'node',env:{},spawnProcess,checkPort:async()=>{}})).resolves.toBe(c);expect(options.stdio).toContain('ipc');expect(c.kill).not.toHaveBeenCalled();
 });
 test('ready sin nonce valido no concede propiedad ni abre app',async()=>{
  const c=child();const spawnProcess=()=>{setImmediate(()=>c.emit('message',{type:'dev-ready',nonce:'foreign'}));return c;};
  await expect(g.startOwnedBackend({execPath:'node',env:{},spawnProcess,checkPort:async()=>{},timeout:20})).rejects.toThrow('DEV_BACKEND_TIMEOUT');expect(c.kill).toHaveBeenCalledTimes(1);
 });
 test('salida antes de ready aborta',async()=>{
  const c=child();await expect(g.startOwnedBackend({execPath:'node',env:{},checkPort:async()=>{},spawnProcess:()=>{setImmediate(()=>c.emit('exit',1));return c;}})).rejects.toThrow('DEV_BACKEND_START_FAILED');
 });
 test('rechazo del pool efectivo aborta',async()=>{
  const c=child();await expect(g.startOwnedBackend({execPath:'node',env:{},checkPort:async()=>{},spawnProcess:(exe,args,opts)=>{setImmediate(()=>c.emit('message',{type:'dev-error',nonce:opts.env.APP_DEV_BACKEND_NONCE}));return c;}})).rejects.toThrow('DEV_BACKEND_REJECTED');
 });
});
describe('Electron DEV: no reutiliza salud HTTP de otro proceso',()=>{
 async function run(startOwnedBackend){
  const windows=[],app={isPackaged:false,setPath:jest.fn(),requestSingleInstanceLock:()=>true,quit:jest.fn(),whenReady:()=>Promise.resolve(),on:jest.fn()},http={get:jest.fn()};
  class Window {constructor(){windows.push(this);this.webContents={setWindowOpenHandler:jest.fn(),on:jest.fn()};this.loadURL=jest.fn();}setMenuBarVisibility(){}maximize(){}once(){}on(){}}
  Window.getAllWindows=()=>[];
  const electron={app,BrowserWindow:Window,dialog:{showErrorBox:jest.fn()},ipcMain:{handle:jest.fn()}};
  vm.runInNewContext(fs.readFileSync(path.join(g.ROOT,'electron/main.js'),'utf8'),{require:name=>name==='electron'?electron:name==='http'?http:name==='../scripts/devDb02.cjs'?{LAB:g.LAB,startOwnedBackend}:require(name),process:{env:{APP_DEV_DB02:'1'},execPath:'electron'},console:{error:jest.fn(),log:jest.fn()},__dirname:path.join(g.ROOT,'electron'),URL,Buffer,setTimeout,clearTimeout});
  await new Promise(setImmediate);return {windows,app,http,electron};
 }
 test('ventana se abre solamente despues del ready privado',async()=>{const start=jest.fn().mockResolvedValue({kill:jest.fn()});const r=await run(start);expect(start).toHaveBeenCalledTimes(1);expect(r.http.get).not.toHaveBeenCalled();expect(r.windows).toHaveLength(1);expect(r.windows[0].loadURL).toHaveBeenCalledWith('http://127.0.0.1:3000/app/');});
 test('backend rechazado deja cero ventanas y cierra Electron',async()=>{const r=await run(jest.fn().mockRejectedValue(Error('DEV_PORT_UNAVAILABLE')));expect(r.http.get).not.toHaveBeenCalled();expect(r.windows).toHaveLength(0);expect(r.app.quit).toHaveBeenCalled();});
});


describe('DEV-DB-02: configuracion y esquema faltantes',()=>{
 const valid="DB_HOST=localhost\nDB_PORT=5432\nDB_NAME="+g.DATABASE+"\nJWT_SECRET="+'a'.repeat(64)+"\nGYG_GMAIL_SYNC_ENABLED=false\n";
 function config(text){const original=fs.readFileSync;return jest.spyOn(fs,'readFileSync').mockImplementation((p,...args)=>String(p)===g.CONFIG?Buffer.from(text):original(p,...args));}
 test.each([valid.replace(g.DATABASE,'sian_kaan_reservaciones'),valid.replace('localhost','remote.invalid'),valid.replace('false','true'),valid+'DB_PASSWORD=forbidden\n',valid.replace('a'.repeat(64),'short')])('rechaza archivo inseguro antes de conectar',text=>{
  require('dotenv');const spy=config(text);try{expect(()=>g.readConfig()).toThrow('DEV_CONFIG_INVALID');}finally{spy.mockRestore();}
 });
 test('acepta archivo independiente sin credenciales DB persistidas',()=>{require('dotenv');const spy=config(valid);try{expect(g.readConfig().DB_NAME).toBe(g.DATABASE);}finally{spy.mockRestore();}});
 function schemaDb(change={}){
  const constraints=[...Array.from({length:18},(_,i)=>({conname:i===0?'pk_usuario_plataformas_visibles':'pk_'+i,contype:'p',convalidated:true,definition:i===0?'PRIMARY KEY (id_usuario, id_plataforma)':'PRIMARY KEY (id)'})),
   ...Array.from({length:18},(_,i)=>({conname:i===0?'fk_usuario_plataformas_visibles_usuarios':i===1?'fk_usuario_plataformas_visibles_plataformas':'fk_'+i,contype:'f',convalidated:true,definition:'FOREIGN KEY'})),
   ...Array.from({length:15},(_,i)=>({conname:i===0?'chk_usuarios_alcance_plataformas':'check_'+i,contype:'c',convalidated:true,definition:i===0?"CHECK (mode IN ('all','selected'))":'CHECK (true)'}))];
  return {query:jest.fn().mockResolvedValueOnce({rows:(change.tables||g.TABLES).map(tablename=>({tablename}))}).mockResolvedValueOnce({rows:change.constraints||constraints}).mockResolvedValueOnce({rows:[{is_nullable:'NO',column_default:change.default||"'selected'::character varying"}]})};
 }
 test('schema completo es requisito',async()=>{await expect(g.verifySchema(schemaDb({tables:g.TABLES.filter(t=>t!=='usuario_plataformas_visibles')}))).rejects.toThrow('DEV_TABLES_MISMATCH');});
 test('rechaza default all en cuentas nuevas',async()=>{await expect(g.verifySchema(schemaDb({default:"'all'::character varying"}))).rejects.toThrow('DEV_SCOPE_COLUMN_MISMATCH');});
 test('rechaza constraints incompletas',async()=>{await expect(g.verifySchema(schemaDb({constraints:[]}))).rejects.toThrow('DEV_CONSTRAINTS_MISMATCH');});
 test('acepta esquema completo con PK/FK/CHECK y default selected',async()=>{await expect(g.verifySchema(schemaDb())).resolves.toHaveProperty('tables',g.TABLES);});
});
describe('DEV-DB-02: proveedores bloqueados sin efectuar conexiones',()=>{
 test('bloquea TCP externo, HTTP, HTTPS, HTTP2 y fetch',async()=>{
  const http=require('node:http'),https=require('node:https'),http2=require('node:http2');
  const originals={connect:net.Socket.prototype.connect,request:http.request,get:http.get,httpsRequest:https.request,httpsGet:https.get,http2:http2.connect,fetch:global.fetch};
  try{
   g.blockProviderNetwork();
   expect(()=>new net.Socket().connect({host:'external.invalid',port:443})).toThrow('DEV_NETWORK_BLOCKED');
   expect(()=>http.request('http://external.invalid')).toThrow('DEV_PROVIDER_HTTP_DISABLED');
   expect(()=>https.get('https://external.invalid')).toThrow('DEV_PROVIDER_HTTP_DISABLED');
   expect(()=>http2.connect('https://external.invalid')).toThrow('DEV_PROVIDER_HTTP_DISABLED');
   await expect(global.fetch('https://external.invalid')).rejects.toThrow('DEV_PROVIDER_HTTP_DISABLED');
  }finally{net.Socket.prototype.connect=originals.connect;http.request=originals.request;http.get=originals.get;https.request=originals.httpsRequest;https.get=originals.httpsGet;http2.connect=originals.http2;global.fetch=originals.fetch;}
 });
});

describe('Verificacion local: middleware registrado conserva autorizacion',()=>{
 const {invoke}=require('../../scripts/verificarDevDb02.cjs');
 test('router.use deniega acceso antes de invocar controller',async()=>{
  const router=require('express').Router(),controller=jest.fn();router.use((req,res)=>res.status(403).json({mensaje:'denied'}));router.get('/',controller);
  const r=await invoke(router,'GET','/','/api/usuarios');expect(r.statusCode).toBe(403);expect(controller).not.toHaveBeenCalled();
 });
 test('middleware de ruta obtiene metodo, baseUrl y path correctos',async()=>{
  const router=require('express').Router();router.get('/:id',(req,res)=>res.json({method:req.method,base:req.baseUrl,path:req.route.path,id:req.params.id}));
  const r=await invoke(router,'GET','/:id','/api/reservaciones',{params:{id:'synthetic'}});expect(r.body).toEqual({method:'GET',base:'/api/reservaciones',path:'/:id',id:'synthetic'});
 });
});
