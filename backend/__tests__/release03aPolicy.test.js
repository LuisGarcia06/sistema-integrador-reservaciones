const fs = require('node:fs');
const path = require('node:path');
const { config, schema, identity, fakePool } = require('./helpers/release03aFixtures.cjs');
const policy = require('../config/desktopPolicy');
const { validateSchema, canonical, CHECK } = require('../config/desktopSchema');
const { verifyPostgres } = require('../config/desktopPostgres');

describe('RELEASE-03A configuración determinista y ACL de solo lectura', () => {
    test('solo hereda allowlist Windows; no coloca secretos en env del hijo', () => {
        const env = policy.cleanEnvironment({SystemRoot:'C:\\Windows',PATH:'ruta',TEMP:'temporal',UNRELATED:'ignorada'});
        expect(env).toEqual({SystemRoot:'C:\\Windows',PATH:'ruta',TEMP:'temporal',ELECTRON_RUN_AS_NODE:'1',NODE_ENV:'production'});
    });
    test.each(['DB_NAME','db_password','PGDATABASE','PGSERVICEFILE','APP_CONFIG_PATH','APP_DEV_DB02','APP_PRINCIPAL_TEST',
        'NODE_OPTIONS','NODE_PATH','NODE_EXTRA_CA_CERTS','ELECTRON_RUN_AS_NODE','GYG_GMAIL_SYNC_ENABLED',
        'FAREHARBOR_USER_KEY','GETYOURGUIDE_TOKEN','WHATSAPP_ACCESS_TOKEN','GOOGLE_APPLICATION_CREDENTIALS','JWT_SECRET','HTTPS_PROXY','INTEGRATION_DASHBOARD_CUTOFF_AT'])('rechaza variable heredada %s sin publicar su valor', key => {
        expect(() => policy.cleanEnvironment({[key]:config.DB_PASSWORD})).toThrow(policy.MESSAGES.ENV_CONFLICT);
    });
    test.each(['test','development'])('no confunde NODE_ENV=%s con principal', mode => expect(() => policy.cleanEnvironment({NODE_ENV:mode})).toThrow(policy.MESSAGES.ENV_CONFLICT));
    test.each(['DB_PASSWORD','JWT_SECRET','DB_CLUSTER_ID','DB_SCHEMA_VERSION','APP_ENVIRONMENT'])('requiere %s', key => {
        const c={...config};delete c[key];expect(() => policy.validateConfig(c)).toThrow(policy.MESSAGES.CONFIG_INVALID);
    });
    test.each([{DB_NAME:'sian_kaan_reservaciones_dev'},{DB_HOST:'192.0.2.1'},{DB_PORT:'55473'},{DB_USER:'postgres'},
        {DB_SERVER_VERSION:'18.4'},{DB_CLUSTER_ID:'otro'},{GYG_GMAIL_SYNC_ENABLED:'true'},{UNKNOWN:'x'},
        {DB_PASSWORD:'   '},{JWT_SECRET:' '.repeat(64)},{JWT_SECRET:1234}])('rechaza configuración incompatible %j', change => expect(() => policy.validateConfig({...config,...change})).toThrow(policy.MESSAGES.CONFIG_INVALID));
    test('ACL verificada antes de leer y repetida; no utiliza dotenv.config', () => {
        const name=path.resolve('ficticio-no-existe.env'), original=fs.readFileSync;
        const spy=jest.spyOn(fs,'readFileSync').mockImplementation((file,...args)=>file===name?Object.entries(config).map(([k,v])=>k+'='+v).join('\n'):original(file,...args));
        const checkAcl=jest.fn();
        try { expect(policy.readConfig(name,{checkAcl}).config).toEqual(config); expect(checkAcl).toHaveBeenCalledTimes(2); }
        finally { spy.mockRestore(); }
    });
    test('ACL insegura impide leer secretos', () => {
        const spy=jest.spyOn(fs,'readFileSync');
        try { expect(() => policy.readConfig(path.resolve('falso.env'),{checkAcl:()=>{throw Error('inseguro');}})).toThrow(policy.MESSAGES.CONFIG_ACL);expect(spy).not.toHaveBeenCalled(); }
        finally {spy.mockRestore();}
    });
    test('archivo faltante y duplicados no tienen fallback', () => {
        expect(() => policy.readConfig(path.resolve('no-existe-03a.env'),{checkAcl:()=>{}})).toThrow(policy.MESSAGES.CONFIG_MISSING);
        const name=path.resolve('falso.env'), original=fs.readFileSync;
        const spy=jest.spyOn(fs,'readFileSync').mockImplementation((file,...args)=>file===name?'DB_NAME=x\nDB_NAME=y':original(file,...args));
        try {expect(() => policy.readConfig(name,{checkAcl:()=>{}})).toThrow(policy.MESSAGES.CONFIG_INVALID);}finally{spy.mockRestore();}
    });
    test.each([3,4,null])('ACL falla cerrada con salida %s, sin volcar stdout/stderr', status => {
        const {checkAcl}=require('../config/windowsConfigAcl'); const run=jest.fn(()=>({status,stderr:config.DB_PASSWORD}));
        expect(() => checkAcl('C:\\ficticio.env',{platform:'win32',run})).toThrow('CONFIG_ACL');
        expect(run.mock.calls[0][2]).toMatchObject({input:'C:\\ficticio.env',windowsHide:true});
    });
    test('verificador ACL rechaza plataformas no verificables',()=>expect(()=>require('../config/windowsConfigAcl').checkAcl('/fake',{platform:'linux'})).toThrow('CONFIG_ACL'));
    test('Windows: parser real y archivo ficticio ausente; ninguna modificación NTFS',()=>{
        if(process.platform!=='win32') return;
        const {SCRIPT,checkAcl}=require('../config/windowsConfigAcl'),cp=require('node:child_process');
        const script="$errors=$null; $tokens=$null; [Management.Automation.Language.Parser]::ParseInput([Console]::In.ReadToEnd(),[ref]$tokens,[ref]$errors) | Out-Null; if ($errors.Count) { exit 1 }; exit 0";
        const result=cp.spawnSync(path.join(process.env.SystemRoot,'System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{input:SCRIPT,encoding:'utf8',windowsHide:true,timeout:15000});
        expect(result.status).toBe(0);
        expect(()=>checkAcl(path.resolve('docs/release-03a/ficticio-ausente.env'))).toThrow('CONFIG_ACL');
        try{checkAcl(path.resolve('docs/release-03a/ficticio-ausente.env'));}catch(e){expect(e.code).toBe('CONFIG_MISSING');}
    });
});

describe('RELEASE-03A identidad efectiva y guardia completa 017 sin PostgreSQL', () => {
    test('esquema válido y casts equivalentes de scope aceptados',()=>{expect(()=>validateSchema(schema())).not.toThrow();expect(canonical(CHECK)).toContain('not_applied');});
    test.each([
        s=>{s.columns=[];}, s=>{s.columns[0].type='timestamp with time zone';}, s=>{s.columns[1].nullable=false;},
        s=>{s.columns[2].default="'x'::text";}, s=>{s.constraints.pop();}, s=>{s.constraints[0].validated=false;},
        s=>{s.constraints[0].definition+=' ON DELETE CASCADE';}, s=>{s.constraints[0].deferrable=true;},
        s=>{s.constraints[1].definition=s.constraints[1].definition.replace('<= 500','<= 5000');},
        s=>{s.constraints[1].definition=s.constraints[1].definition.replace(' AND ',' OR ');},
        s=>{s.constraints[1].definition=s.constraints[1].definition.replace('not_applied','applied');},
        s=>{s.indexes=[];}, s=>{s.indexes[0].valid=false;}, s=>{s.indexes[0].ready=false;},
        s=>{s.indexes[0].definition=s.indexes[0].definition.replace('DESC','ASC');},
        s=>{s.indexes[0].definition=s.indexes[0].definition.replace('IS NOT NULL','IS NULL');},
        s=>{s.scope_column=0;}, s=>{s.scope_links=2;}, s=>{s.tables.pop();}
    ])('017 ausente/parcial o scope incompatible bloquea (%#)', change=>{const s=schema();change(s);expect(()=>validateSchema(s)).toThrow(policy.MESSAGES.SCHEMA_INVALID);});
    test('identidad válida: consultas únicamente de lectura y conexión liberada',async()=>{
        const pool=fakePool();await verifyPostgres(pool,config);expect(pool.released).toBe(true);expect(pool.calls[0]).toBe('BEGIN READ ONLY');expect(pool.calls.at(-1)).toBe('ROLLBACK');
    });
    test('acepta representación inet explícita /32 del mismo servidor IPv4',async()=>await expect(verifyPostgres(fakePool({row:{...identity,address:'127.0.0.1/32'}}),config)).resolves.toBeUndefined());
    test.each([{database:'sian_kaan_reservaciones_dev'},{username:'postgres'},{port:55473},{address:'::1'},{schema:'otro'},{version:'180004'}])('identidad real incompatible %j',async change=>{const pool=fakePool({row:{...identity,...change}});await expect(verifyPostgres(pool,config)).rejects.toMatchObject({code:'PG_IDENTITY'});expect(pool.released).toBe(true);});
    test('clúster distinto se rechaza',async()=>await expect(verifyPostgres(fakePool({cluster:'otro'}),config)).rejects.toMatchObject({code:'PG_CLUSTER'}));
    test('sin permiso de identidad no eleva privilegios ni continúa',async()=>{
        const pool=fakePool({row:{...identity,cluster_allowed:false}});await expect(verifyPostgres(pool,config)).rejects.toMatchObject({code:'PG_CLUSTER'});expect(pool.calls.some(s=>/GRANT|CREATE|ALTER/.test(s))).toBe(false);
    });
    test('rol elevado o propietario se rechaza',async()=>await expect(verifyPostgres(fakePool({unsafe:true}),config)).rejects.toMatchObject({code:'PG_ROLE'}));
    test('PostgreSQL inaccesible: mensaje seguro sin credenciales',async()=>{
        await expect(verifyPostgres({connect:async()=>{throw Error(config.DB_PASSWORD);}},config)).rejects.toEqual(expect.objectContaining({code:'PG_UNAVAILABLE',message:policy.MESSAGES.PG_UNAVAILABLE}));
        await expect(verifyPostgres(fakePool({error:true}),config)).rejects.toMatchObject({code:'PG_UNAVAILABLE'});
    });
});
