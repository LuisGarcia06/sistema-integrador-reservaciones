jest.mock('../config/database', () => ({ query: jest.fn() }));
const service = require('../services/centroAvisos.service');

test.each([
    {page:'-1'}, {page:'1.5'}, {limit:'1000'}, {provider:'otro'}, {tab:'todos'},
    {from:'2026-02-31'}, {date:'2026-13-01'}, {from:'2026-10-22',to:'2026-10-21'},
    {q:['a','b']}, {q:'a'.repeat(121)}, {urgent:'maybe'}, {sql:'DROP TABLE'},
])('Rechaza filtros inválidos %j', filters => {
    expect(() => service.validarConsulta(filters)).toThrow();
});
test('Normaliza paginación y permite fecha de servicio explícita', () => {
    expect(service.validarConsulta({date:'2028-02-29',page:'2',limit:'50',q:' GYG123 '})).toMatchObject({date:'2028-02-29',page:2,limit:50,q:'GYG123'});
});
test('Consultas parametrizadas, publicadas y sin datos crudos', async () => {
    const db = { query: jest.fn(async () => ({rows:[{total:0,data:[]}]})) };
    await service.listarCentro(service.validarConsulta({date:'2026-10-21',tab:'pendientes',q:"' OR 1=1 --"}),{},db);
    const [sql, values] = db.query.mock.calls[0];
    expect(sql).toContain('aviso_publicado=true');
    expect(sql).not.toContain("' OR 1=1 --"); expect(values).toContain("%' OR 1=1 --%");
    expect(sql).not.toContain('raw_payload'); expect(sql).not.toMatch(/\b(?:UPDATE|DELETE|INSERT)\b/);
});
