jest.mock('../config/database',()=>({query:jest.fn()}));
const service=require('../services/centroAvisos.service');
test('Orden inicial por sección',()=>{
 expect(service.validarConsulta({tab:'pendientes'}).sort).toBe('newest');
 expect(service.validarConsulta({tab:'prioritarios'}).sort).toBe('service');
 expect(service.validarConsulta({tab:'historico'}).sort).toBe('newest');
});
test.each(['newest','oldest','service'])('Orden validado %s antes de paginación',async sort=>{
 const db={query:jest.fn(async()=>({rows:[{total:0,data:[]}]}))};await service.listarCentro(service.validarConsulta({sort}),{},db);
 const sql=db.query.mock.calls[0][0];expect(sql).toMatch(/SELECT \* FROM seleccion ORDER BY [\s\S]+LIMIT/);expect(sql).toContain('id_evento_integracion');expect(sql).toContain('max(created_at)');
});
test.each(['newest;drop table','SOURCE','created_at desc', ['newest','oldest']])('Orden no permitido %j',sort=>{expect(()=>service.validarConsulta({sort})).toThrow();});
