const I=require('../security/commandIntent'),C=require('../security/revisionApiContract');
const generation='1a2b3c4d-1234-4567-89ab-123456789abc',key='a'.repeat(64),uuid='1a2b3c4d-1234-4567-89ab-123456789abd';
const headers={'if-match':'"original-record"','if-operational-match':'"original-context"'};
const spec=body=>C.command('PATCH','/api/reservaciones/1',body);
const hash=(body,actor=1,extra=headers)=>I.fingerprint(key,generation,actor,spec(body),extra);
test('huella canónica estable liga cuerpo y precondiciones; no convierte BIGINT textual',()=>{
    expect(hash({habitacion:'A',revision:'9007199254740993'})).toBe(hash({revision:'9007199254740993',habitacion:'A'}));
    expect(hash({a:null})).not.toBe(hash({}));expect(hash({a:'2'})).not.toBe(hash({a:2}));
    expect(()=>hash({a:9007199254740992})).toThrow();
});
test.each([
    ['cuerpo',()=>hash({habitacion:'B'})],['actor',()=>hash({habitacion:'A'},2)],
    ['If-Match',()=>hash({habitacion:'A'},1,{...headers,'if-match':'"other"'})],
    ['contexto',()=>hash({habitacion:'A'},1,{...headers,'if-operational-match':'"other"'})],
    ['generación',()=>I.fingerprint(key,'another',1,spec({habitacion:'A'}),headers)],
    ['ruta',()=>I.fingerprint(key,generation,1,C.command('PATCH','/api/reservaciones/2',{habitacion:'A'}),headers)]
])('cambio de %s no reconoce la intención anterior',(_name,changed)=>expect(I.equal(hash({habitacion:'A'}),changed())).toBe(false));
test.each(['if-match','if-operational-match'])('falta %s conserva 428',name=>{
    const h={...headers};delete h[name];expect(()=>hash({},1,h)).toThrow(expect.objectContaining({statusCode:428}));
});
test('identidad de comando es propia del protocolo; duplicados no se aceptan',()=>{
    const h={'idempotency-key':uuid,'x-ctsk-data-generation':generation,'x-ctsk-protocol':'p'};
    expect(I.identity({headers:h},generation,'p')).toBe(uuid);
    expect(()=>I.identity({headers:{...h,'x-ctsk-data-generation':'other'}},generation,'p')).toThrow(expect.objectContaining({statusCode:409}));
    expect(()=>I.identity({headers:h,rawHeaders:['Idempotency-Key',uuid,'Idempotency-Key',uuid]},generation,'p')).toThrow();
    expect(()=>I.identity({headers:{...h,'idempotency-key':'HTTPS-nonce'}},generation,'p')).toThrow();
});
test('recibos nunca copian el cuerpo ni la representación de negocio',()=>{
    const {metadata,receipt}=require('../services/comandos.service'),s=C.command('POST','/api/usuarios',{password:'SYN-SECRET',nombre:'Privado'});
    const scope=metadata(s,null,{body:{datos:{id_usuario:7,password:'SYN-HASH',nombre:'Privado'}}});
    expect(scope).toEqual({plataformas:[],referencias:[{recurso:'usuarios',id:'7'}]});
    const out=receipt({http_status:200,clave:uuid,generacion_datos:generation,estado:'confirmado',resultado:{referencias:scope.referencias},ids_bitacora:[]});
    expect(JSON.stringify(out)).not.toMatch(/SYN-SECRET|SYN-HASH|Privado/);
});
