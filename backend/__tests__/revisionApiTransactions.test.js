function setup(){
    let tx; const raw={query:jest.fn(async()=>({rows:[]})),release:jest.fn()},pool={connect:jest.fn(async()=>raw)};
    jest.isolateModules(()=>{tx=require('../config/revisionApiTransactions');});tx.install(pool,{APP_ENVIRONMENT:'revision-api-lab'});return {tx,pool,raw};
}
test('precondiciones habilitan escrituras solo dentro de la transacción HTTP',async()=>{
    const {tx,pool,raw}=setup();
    await tx.transaction(pool,async db=>{
        await expect(db.query('UPDATE synthetic SET value=1')).rejects.toThrow('PRECONDITIONS_NOT_VERIFIED');
        tx.authorizeWrites();await pool.query('UPDATE synthetic SET value=1');
    });expect(raw.query.mock.calls.map(a=>a[0])).toEqual(['BEGIN','UPDATE synthetic SET value=1','COMMIT']);expect(raw.release).toHaveBeenCalledTimes(1);
});
test('BEGIN/COMMIT internos son savepoints y no confirman el exterior',async()=>{
    const {tx,pool,raw}=setup();
    await tx.transaction(pool,async()=>{tx.authorizeWrites();const c=await pool.connect();await c.query('BEGIN');await c.query('INSERT INTO synthetic VALUES (1)');await c.query('COMMIT');c.release();expect(raw.query.mock.calls.some(a=>a[0]==='COMMIT')).toBe(false);});
    expect(raw.query.mock.calls.map(a=>a[0])).toEqual(['BEGIN','SAVEPOINT ctsk_api_nested_1','INSERT INTO synthetic VALUES (1)','RELEASE SAVEPOINT ctsk_api_nested_1','COMMIT']);
});
test('fallo después de COMMIT interno revierte el exterior',async()=>{
    const {tx,pool,raw}=setup();await expect(tx.transaction(pool,async()=>{tx.authorizeWrites();const c=await pool.connect();await c.query('BEGIN');await c.query('UPDATE synthetic SET value=2');await c.query('COMMIT');throw Error('audit error');})).rejects.toThrow('audit error');
    expect(raw.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');expect(raw.query.mock.calls.some(a=>a[0]==='COMMIT')).toBe(false);
});
test('consultas fuera del contexto reciben una transacción PostgreSQL READ ONLY',async()=>{
    const {pool,raw}=setup();const c=await pool.connect();expect(raw.query.mock.calls[0][0]).toBe('BEGIN READ ONLY');await expect(c.query('BEGIN')).rejects.toThrow('WRITE_CONTEXT_REQUIRED');c.release();await new Promise(setImmediate);expect(raw.query.mock.calls.at(-1)[0]).toBe('ROLLBACK');
});
test('cliente retenido no puede escribir después de finalizar la transacción',async()=>{
    const {tx,pool}=setup();let held;await tx.transaction(pool,async()=>{tx.authorizeWrites();held=await pool.connect();});await expect(held.query('UPDATE synthetic SET value=2')).rejects.toThrow('TRANSACTION_ENDED');
});
test('callback de query object no se adelanta ni queda sin esperar',async()=>{
    const {tx,pool}=setup();await tx.transaction(pool,async()=>{tx.authorizeWrites();await new Promise((yes,no)=>pool.query({text:'SELECT 1',callback:(e,r)=>e?no(e):yes(r)}));});
});
test.each(['SET TRANSACTION READ WRITE','SHOW transaction_read_only; COMMIT; BEGIN; UPDATE synthetic SET value=1'])('fuera del contexto no escapa de READ ONLY: %s',async sql=>{
    const {pool,raw}=setup(),c=await pool.connect();await expect(c.query(sql)).rejects.toThrow();expect(raw.query.mock.calls).toEqual([['BEGIN READ ONLY']]);c.release();await new Promise(setImmediate);
});
test.each(['COMMIT; UPDATE synthetic SET value=1','END','START TRANSACTION','BEGIN /* other mode */','/* comment */ COMMIT','-- comment\nEND'])('servicio no puede confirmar o reemplazar límite HTTP: %s',async sql=>{
    const {tx,pool,raw}=setup();await tx.transaction(pool,async db=>{tx.authorizeWrites();await expect(db.query(sql)).rejects.toThrow();});
    expect(raw.query.mock.calls.map(a=>a[0])).toEqual(['BEGIN','COMMIT']);
});
