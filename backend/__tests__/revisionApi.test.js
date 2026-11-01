const {tokens,canonical}=require('../security/revisionTokens');
const T=tokens('a'.repeat(64),'generation-1'),subject={type:'reservaciones',id:'1',actor:1};
const original=T.record(subject,{revision:'9007199254740993'},{datos:{nombre:'A'},revision:'9007199254740993'});
test('canonicalización estable sin convertir BIGINT a Number',()=>{
    expect(canonical({z:[2,1],a:'9007199254740993'})).toBe(canonical({a:'9007199254740993',z:[2,1]}));
    expect(()=>canonical({n:9007199254740992})).toThrow();
    expect(T.record(subject,{revision:'9007199254740993'},{datos:{nombre:'A'},revision:'9007199254740993'})).toBe(original);
    expect(()=>T.verifyRecord(original,original)).not.toThrow();
});
test.each([undefined,'*','W/'+original,original+','+original,'"collection"',original.slice(0,-3)+'00"'])('If-Match inválido/requerido %s',value=>{
    try{T.verifyRecord(value,original);throw Error('expected reject');}catch(e){expect(e.statusCode).toBe(value===undefined?428:400);}
});
test('revisión obsoleta y cambio de representación se distinguen',()=>{
    const newer=T.record(subject,{revision:'9007199254740994'},{datos:{nombre:'B'}});
    expect(()=>T.verifyRecord(original,newer)).toThrow(expect.objectContaining({statusCode:412,code:'PRECONDICION_OBSOLETA'}));
    const derived=T.record(subject,{revision:'9007199254740993'},{datos:{nombre:'A',capacidad:3}});
    expect(()=>T.verifyRecord(original,derived)).toThrow(expect.objectContaining({statusCode:409}));
});
test('otro recurso o usuario y firma inventada se rechazan',()=>{
    expect(()=>T.verifyRecord(original,T.record({...subject,id:'2'},{revision:'1'},{}))).toThrow(expect.objectContaining({statusCode:400}));
    expect(()=>tokens('b'.repeat(64),'generation-1').verifyRecord(original,original)).toThrow();
});
test('generación renovada invalida etiqueta antigua aunque la revisión coincida',()=>{
    const next=tokens('a'.repeat(64),'generation-2').record(subject,{revision:'9007199254740993'},{datos:{nombre:'A'},revision:'9007199254740993'});
    expect(()=>T.verifyRecord(original,next)).toThrow(expect.objectContaining({statusCode:412}));
});
test('contexto liga acción, entrada canónica y dependencias',()=>{
    const a={method:'PATCH',body:{id_transporte_operacion:2}},ctx=T.context(a,{members:[1,2],capacity:12});
    expect(()=>T.verifyContext(ctx,T.context(a,{members:[1,2],capacity:11}))).toThrow(expect.objectContaining({statusCode:409}));
    expect(()=>T.verifyContext(ctx,T.context({...a,body:{}},{members:[1,2],capacity:12}))).toThrow(expect.objectContaining({statusCode:400}));
});
const C=require('../security/revisionApiContract');
test.each(C.routes)('contrato de escritor específico $method $mount$path',spec=>{
    const path=spec.mount+(spec.path==='/'?'':spec.path.replace(':id','1'))+(spec.resource==='daily'?'?fecha=2098-01-01':'');
    expect(C.command(spec.method,path,{}).table).toBe(spec.table);
});
test.each(['/api/webhooks/fareharbor','/api/integraciones/fareharbor','/api/reservaciones/1/desconocido','/api/reservaciones/%31'])('no fallback para escritor desconocido %s',path=>expect(()=>C.command('POST',path,{})).toThrow());
test('guardias de perfiles previos continúan rechazando esquema 019',async()=>{
    await expect(require('../standalone').startStandalone({manifest:{environment:'revision-api-lab'},config:{DB_SCHEMA_VERSION:'019'}},{createServer:jest.fn()})).rejects.toMatchObject({code:'SCHEMA_LAB_NOT_OPERATIONAL'});
});
