'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),F=require('../unifiedFrontend');
test('Carga por defecto inerte: no registra adaptadores ni toca red/DOM sin activación verificada',()=>{const App={sentinel:true},document={documentElement:{dataset:{}},head:{append(){throw Error('UNEXPECTED_ACTIVATION');}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../frontend/js/unifiedActivation.js'),'utf8'),{window:{App},document});expect(App).toEqual({sentinel:true});});
test('Servir las páginas originales exige la activación C',()=>{expect(()=>F.install({use(){throw Error('SHOULD_NOT_MOUNT');}},{manifest:{activation:'backend-only'}})).toThrow('UNIFIED_FRONTEND_GATE_REQUIRED');});
test('Lista de assets excluye configuración, filesystem y wrappers experimentales anteriores',()=>{for(const file of ['.env','../package.json','lab/administracion.html','lab/command.html','assets/branding/README.md'])expect(F.ASSETS).not.toContain(file);expect(F.ASSETS).toEqual(expect.arrayContaining(['index.html','pages/reservaciones.js','pages/operaciones.js','js/unifiedActivation.js']));});
test('Backend mantiene el esquema023 y matriz de escrituras existentes',()=>{const P=require('../config/unifiedHttpPolicy');expect(P.WRITERS).toHaveLength(22);expect(P.allowHttp('POST','/api/integraciones/fareharbor/webhook')).toBe(false);expect(P.allowHttp('GET','/api/auth/sesion')).toBe(true);});
test.each([[true,'reservaciones',true],[false,'reservaciones',false],[true,'operaciones',false]])('Edición sin motivo: perfil conjunto=%s recurso=%s válida=%s',async(active,resource,valid)=>{
 const crypto=require('node:crypto'),generation=crypto.randomUUID(),fetch=jest.fn(),App={unified:{active},auth:{obtenerVersionSesion:()=>1,obtenerUsuario:()=>({id_usuario:1})},api:{apiFetch:fetch}};
 const window={App,crypto:{randomUUID:()=>crypto.randomUUID()},setTimeout,clearTimeout},context=vm.createContext({window,Headers,AbortController});
 for(const file of ['revisionLab.js','auditUi.js','commandLab.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../../frontend/js',file),'utf8'),context);
 const url='/api/'+resource+'/1',headers={protocol:'ctsk-audit-api-v1',generation};
 fetch.mockResolvedValueOnce({status:200,headers,data:{metodo:'PATCH',ruta:url,datos:{habitacion:'Anterior'},revision:'1',generacion:generation,etag:'"e"',contexto:'"c"'}});
 const s=await new App.commandLab.CommandSession('PATCH',url).open();s.setProposal({habitacion:'Actualizada'});
 fetch.mockImplementationOnce(async()=>({status:200,headers,data:{comando:{clave:s.command.key,generacion:generation,estado:'confirmado'},resultado:{codigo:'COMANDO_CONFIRMADO',referencias:[]},ids_bitacora:[1]}}));
 if(valid){await s.submit(()=>true);expect(s.state).toBe('confirmed');expect(fetch).toHaveBeenCalledTimes(2);expect(fetch.mock.calls[1][1].body).toEqual({habitacion:'Actualizada'});}
 else{await expect(s.submit(()=>true)).rejects.toThrow(/Motivo/);expect(s.command).toBeNull();expect(fetch).toHaveBeenCalledTimes(1);}
});
