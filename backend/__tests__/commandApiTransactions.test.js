function setup(profile='command-api-lab'){
    let tx;const raw={query:jest.fn(async sql=>({rows:/^INSERT INTO bitacora/.test(sql)?[{id_bitacora:91}]:[]})),release:jest.fn()},pool={connect:jest.fn(async()=>raw)};
    jest.isolateModules(()=>{tx=require('../config/revisionApiTransactions');});tx.install(pool,{APP_ENVIRONMENT:profile,DB_SCHEMA_VERSION:profile==='command-api-lab'?'020':'019'});return {tx,pool,raw};
}
const entry={generacion_datos:'generation',id_usuario:1,clave:'key',version:1,metodo:'PATCH',ruta:'/api/reservaciones/1',recurso:'reservaciones',id_recurso:'1',huella:'a'.repeat(64),estado:'confirmado',http_status:200,resultado:{codigo:'COMANDO_CONFIRMADO'},alcance:{plataformas:[],referencias:[]}};
test('comando, modificación, auditoría y servicios internos usan el mismo cliente y un solo COMMIT exterior',async()=>{
    const {tx,pool,raw}=setup();
    await tx.transaction(pool,async db=>{
        const result=await tx.attemptCommand(async()=>{
            tx.authorizeWrites();const c=await pool.connect();expect(c).toBe(db);
            await c.query('BEGIN');await c.query('UPDATE reservaciones SET habitacion=$1 WHERE id_reservacion=$2',['A',1]);
            await c.query('INSERT INTO bitacora VALUES ($1) RETURNING id_bitacora',[1]);await c.query('COMMIT');c.release();return 'ok';
        });expect(result.value).toBe('ok');expect(await tx.recordCommand(entry)).toEqual([91]);
        expect(raw.query.mock.calls.filter(a=>a[0]==='COMMIT')).toHaveLength(0);
    });
    const sql=raw.query.mock.calls.map(a=>a[0]);expect(sql.filter(s=>s==='COMMIT')).toHaveLength(1);expect(sql.at(-1)).toBe('COMMIT');
    expect(raw.query.mock.calls.find(a=>a[0].startsWith('INSERT INTO public.comandos_idempotentes'))[1].at(-1)).toEqual([91]);expect(raw.release).toHaveBeenCalledTimes(1);
});
test('rechazo revierte trabajo y no habilita DML de negocio al registrar metadatos',async()=>{
    const {tx,pool,raw}=setup();
    await tx.transaction(pool,async db=>{
        const attempted=await tx.attemptCommand(async()=>{tx.authorizeWrites();await db.query('UPDATE reservaciones SET pax=3');await db.query('INSERT INTO bitacora VALUES(1)');throw {statusCode:400};});
        expect(attempted.error.statusCode).toBe(400);await expect(db.query('UPDATE reservaciones SET pax=4')).rejects.toThrow('PRECONDITIONS_NOT_VERIFIED');
        expect(await tx.recordCommand({...entry,estado:'rechazado',http_status:400})).toEqual([]);
    });expect(raw.query.mock.calls.map(a=>a[0])).toContain('ROLLBACK TO SAVEPOINT ctsk_command_work');
});
test('fallo al insertar el resultado revierte la transacción exterior sin COMMIT parcial',async()=>{
    const {tx,pool,raw}=setup();raw.query.mockImplementation(async sql=>{if(sql.startsWith('INSERT INTO public.comandos_idempotentes'))throw Error('storage failed');return {rows:[]};});
    await expect(tx.transaction(pool,async db=>{await tx.attemptCommand(async()=>{tx.authorizeWrites();await db.query('UPDATE reservaciones SET pax=3');});await tx.recordCommand(entry);})).rejects.toThrow('storage failed');
    expect(raw.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(raw.query.mock.calls.some(a=>a[0]==='COMMIT')).toBe(false);
});
test('lectura de recuperación no adquiere el BEGIN de escritura ni permite DML',async()=>{
    const {tx,pool,raw}=setup();await tx.readCommand(pool,async db=>{expect(await pool.connect()).toBe(db);db.release();await db.query('SELECT 1');await expect(db.query('UPDATE reservaciones SET pax=3')).rejects.toThrow('WRITE_CONTEXT_REQUIRED');});
    expect(raw.query.mock.calls.map(a=>a[0])).toEqual(['BEGIN READ ONLY','SET TRANSACTION ISOLATION LEVEL REPEATABLE READ','SELECT 1','ROLLBACK']);expect(raw.release).toHaveBeenCalledTimes(1);
});
test('perfil previo no habilita acceso interno a registro o lectura de comandos',async()=>{
    const {tx,pool}=setup('revision-api-lab');await tx.transaction(pool,async()=>{await expect(tx.attemptCommand(async()=>{})).rejects.toThrow('COMMAND_TRANSACTION_REQUIRED');await expect(tx.recordCommand(entry)).rejects.toThrow('COMMAND_TRANSACTION_REQUIRED');});await expect(tx.readCommand(pool,async()=>{})).rejects.toThrow('COMMAND_READ_REQUIRED');
});
test('rollback interno elimina referencias de auditoría que no se confirmaron',async()=>{
    const {tx,pool}=setup();await tx.transaction(pool,async db=>{
        await tx.attemptCommand(async()=>{tx.authorizeWrites();await db.query('BEGIN');await db.query('INSERT INTO bitacora VALUES(1)');await db.query('ROLLBACK');});
        expect(await tx.recordCommand(entry)).toEqual([]);
    });
});
