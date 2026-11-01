const {EventEmitter}=require('node:events');
const guard=require('../config/operationalTransactions'),configuration=require('../config/desktopConfiguration');
const lab={APP_ENVIRONMENT:'standalone-development',DB_HOST:'localhost',DB_USER:'ctsk_standalone_runtime',DB_NAME:'ctsk_standalone_abcdef123456_test',DB_PORT:'49151',DB_CLUSTER_ID:'8000000000000000000',DB_SERVER_VERSION:'18.3',GYG_GMAIL_SYNC_ENABLED:'false'};
const fake=()=>({query:jest.fn(async()=>({rows:[]}))});
test('activa solamente configuración privada desechable, no flags del entorno',()=>{
    expect(guard.isOperationalLab(lab)).toBe(true);expect(guard.isOperationalLab({APP_ENVIRONMENT:'principal'})).toBe(false);expect(guard.isOperationalLab({})).toBe(false);
});
test.each([{DB_NAME:'sian_kaan_reservaciones'},{DB_PORT:'5432'},{DB_USER:'postgres'},{DB_HOST:'192.168.1.1'},
    {DB_CLUSTER_ID:'7632825987452064788'},{GYG_GMAIL_SYNC_ENABLED:'true'},{DB_SERVER_VERSION:'18.4'}])('rechaza falso laboratorio %j',patch=>expect(()=>guard.isOperationalLab({...lab,...patch})).toThrow('OPERATIONAL_LAB_CONFIG'));
test('instalación por connect ocurre solo en pool aislado y envuelve una vez',async()=>{
    const principal=new EventEmitter(),p=fake(),original=p.query;guard.install(principal,{APP_ENVIRONMENT:'principal'});principal.emit('connect',p);expect(p.query).toBe(original);
    const isolated=new EventEmitter(),client=fake();guard.install(isolated,lab);isolated.emit('connect',client);const wrapped=client.query;isolated.emit('connect',client);expect(client.query).toBe(wrapped);
});
test('BEGIN toma candado transaccional antes de leer; no usa bloqueo de sesión ni reintento',async()=>{
    const c=fake(),raw=c.query;guard.protectClient(c);await c.query('BEGIN');await c.query('SELECT dependencia');await c.query('COMMIT');
    expect(raw.mock.calls.map(a=>a[0])).toEqual(['BEGIN','SET TRANSACTION ISOLATION LEVEL READ COMMITTED',"SET LOCAL lock_timeout = '2000ms'",'SELECT pg_advisory_xact_lock($1::int,$2::int)','SELECT dependencia','COMMIT']);
    expect(raw.mock.calls[3][1]).toEqual(guard.KEY);
});
test.each(['BEGIN READ ONLY','START TRANSACTION READ ONLY'])('lectura verificada conserva %s sin candado de escritura',async sql=>{
    const c=fake(),raw=c.query;guard.protectClient(c);await c.query(sql);await c.query('ROLLBACK');expect(raw.mock.calls.map(a=>a[0])).toEqual([sql,'ROLLBACK']);
});
test.each(['BEGIN; UPDATE reservaciones SET pax=99','BEGIN -- READ ONLY','BEGIN READ ONLY; COMMIT; UPDATE reservaciones SET pax=99','START TRANSACTION ISOLATION LEVEL SERIALIZABLE'])('no admite BEGIN ambiguo: %s',async sql=>{
    const c=fake(),raw=c.query;guard.protectClient(c);await expect(c.query(sql)).rejects.toThrow('OPERATIONAL_BEGIN_REQUIRED');expect(raw).not.toHaveBeenCalled();
});
test('API callback encola las consultas antes de completar el BEGIN protegido',async()=>{
    let resume;const wait=new Promise(r=>resume=r),c={query:jest.fn(async sql=>{if(String(typeof sql==='string'?sql:sql.text).startsWith('SELECT pg_advisory'))await wait;return {rows:[]};})},raw=c.query;
    guard.protectClient(c);const started=new Promise((yes,no)=>c.query('BEGIN',e=>e?no(e):yes()));
    const update=new Promise((yes,no)=>c.query({text:'UPDATE synthetic SET value=$1'},[1],e=>e?no(e):yes()));
    await new Promise(setImmediate);expect(raw.mock.calls.some(a=>typeof a[0]==='object')).toBe(false);resume();await Promise.all([started,update]);expect(raw.mock.calls.at(-1)[0].text).toBe('UPDATE synthetic SET value=$1');
});
test.each(['55P03','40P01'])('conflicto %s revierte y conserva código sin repetir SQL',async code=>{
    const c={query:jest.fn(async sql=>{if(sql.startsWith('SELECT pg_advisory'))throw Object.assign(Error('server SQL detail'),{code});return {rows:[]};})},raw=c.query;
    guard.protectClient(c);await expect(c.query('BEGIN')).rejects.toMatchObject({code,statusCode:409,operationalLab:true});expect(raw.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(raw.mock.calls.filter(a=>a[0].startsWith('SELECT pg_advisory'))).toHaveLength(1);await expect(c.query('SELECT 1')).rejects.toMatchObject({code});await c.query('ROLLBACK');await c.query('SELECT 1');
});
test('error no relacionado se conserva y el API callback lo entrega una sola vez',async()=>{
    const c={query:jest.fn(async()=>{throw Object.assign(Error('constraint'),{code:'23503'});})};guard.protectClient(c);
    const cb=jest.fn();await new Promise(resolve=>c.query('SELECT 1',e=>{cb(e);resolve();}));expect(cb).toHaveBeenCalledTimes(1);expect(cb.mock.calls[0][0]).toMatchObject({code:'23503'});expect(cb.mock.calls[0][0].statusCode).toBeUndefined();
});
test('BEGIN fallido no deja ejecutar un UPDATE callback ya encolado fuera de transacción',async()=>{
    let fail=true;
    const c={query:jest.fn(async sql=>{if(fail&&sql.startsWith('SELECT pg_advisory'))throw Object.assign(Error('busy'),{code:'55P03'});return {rows:[]};})},raw=c.query;
    guard.protectClient(c);
    const first=new Promise(resolve=>c.query('BEGIN',error=>resolve(error)));
    const next=new Promise(resolve=>c.query('UPDATE synthetic SET value=1',error=>resolve(error)));
    expect((await first).code).toBe('55P03');expect((await next)?.code).toBe('55P03');
    expect(raw.mock.calls.some(a=>a[0].startsWith('UPDATE'))).toBe(false);
    await c.query('ROLLBACK');fail=false;await c.query('BEGIN');await c.query('COMMIT');
});
test('creación en laboratorio confirma o revierte con el MISMO cliente y release',async()=>{
    const spy=jest.spyOn(configuration,'get').mockReturnValue(lab),client={...fake(),release:jest.fn()},pool={connect:jest.fn(async()=>client)};
    try{
        const work=jest.fn(async db=>{expect(db).toBe(client);return 17;});expect(await guard.creation(pool,work)).toBe(17);
        expect(client.query.mock.calls.map(a=>a[0])).toEqual(['BEGIN','COMMIT']);expect(client.release).toHaveBeenCalledTimes(1);
        client.query.mockClear();await expect(guard.creation(pool,async()=>{throw Error('synthetic');})).rejects.toThrow('synthetic');expect(client.query.mock.calls.map(a=>a[0])).toEqual(['BEGIN','ROLLBACK']);
    }finally{spy.mockRestore();}
});
test('creación heredada no cambia su contrato ni abre una conexión nueva',async()=>{
    const spy=jest.spyOn(configuration,'get').mockReturnValue({APP_ENVIRONMENT:'principal'}),pool={connect:jest.fn()};
    try{expect(await guard.creation(pool,async db=>{expect(db).toBe(pool);return 'legacy';})).toBe('legacy');expect(pool.connect).not.toHaveBeenCalled();}finally{spy.mockRestore();}
});
test('errores públicos de bloqueo solo cambian para laboratorio',()=>{
    const map=require('../utils/dbErrors').obtenerRespuestaErrorPostgres;
    expect(map({code:'55P03'})).toBeNull();expect(map({code:'55P03',operationalLab:true,message:'retry manually'})).toEqual({status:409,body:{mensaje:'retry manually'}});
});
