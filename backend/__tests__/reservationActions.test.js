const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
jest.mock('../config/database',()=>({query:jest.fn(),connect:jest.fn()}));
const root=path.resolve(__dirname,'../..'),policy=require('../../scripts/reservationFrontendPolicy.cjs');
function operations(source,admin,loading){
  const window={App:{auth:{esAdministrador:()=>admin}},addEventListener(){}};
  const document={querySelectorAll:()=>[],getElementById:()=>null,addEventListener(){}};
  const context=vm.createContext({window,document,URLSearchParams,Date,Set,Map,console});
  for(const name of ['ui.js','transportesUi.js'])vm.runInContext(fs.readFileSync(path.join(root,'frontend/js',name),'utf8'),context);
  const expose=`App.rows={pending:renderReservacionPendienteRow,assigned:renderReservacionAsignadaRow,setup(op){selectedTransportOperacion=op;organizacionDaily={operaciones:[op]};reservacionTransporteLoadingId=${loading?'1':'null'};}};`;
  vm.runInContext(source.replace(/\}\)\(\);\s*$/,expose+'})();'),context);return window.App;
}
test.each([[true,false],[true,true],[false,false],[false,true]])('controles extraídos conservan filas originales con permisos/carga %s/%s',(admin,loading)=>{
  const before=fs.readFileSync(path.join(root,'docs/local-fase-2d2/before/frontend__pages__operaciones.js'),'utf8'),after=fs.readFileSync(path.join(root,'frontend/pages/operaciones.js'),'utf8');
  const transports=[{id_transporte_operacion:10,numero_grupo:1,id_vehiculo:null,total_pax_activos:2},{id_transporte_operacion:11,numero_grupo:2,id_vehiculo:null,total_pax_activos:0}];
  const op={id_operacion_tour:1,fecha:'2097-04-01',id_tour:1,turno:'Mañana',transportes:transports};
  const old=operations(before,admin,loading),current=operations(after,admin,loading);old.rows.setup(op);current.rows.setup(op);
  for(const estado of ['Programada','Cancelada']){
    const record={id_reservacion:1,codigo:'SYN-1',nombre_cliente:'Cliente <sintético>',pax:2,ninos:1,pickup_place:'Punto',pickup_time:'07:00',estado};
    expect(current.rows.pending(record,transports)).toBe(old.rows.pending(record,transports));
    expect(current.rows.assigned(record,transports[0],transports)).toBe(old.rows.assigned(record,transports[0],transports));
    expect(current.rows.assigned(record,transports[0],[transports[0]])).toBe(old.rows.assigned(record,transports[0],[transports[0]]));
  }
});
test.each(['cancelar','transporte'])('política integrada autoriza solo el método y ruta exactos para %s',suffix=>{
  expect(policy.allowed('PATCH','/api/reservaciones/1/'+suffix)).toBe(true);
  for(const method of ['POST','PUT','DELETE','GET'])expect(policy.allowed(method,'/api/reservaciones/1/'+suffix)).toBe(false);
  for(const end of ['?x=1','/','%2f','/extra'])expect(policy.allowed('PATCH','/api/reservaciones/1/'+suffix+end)).toBe(false);
});
test.each(['/api/operaciones?fecha=2097-04-01','/api/transportes?id_operacion_tour=1'])('lecturas de selección exactas: %s',url=>{
  expect(policy.allowed('GET',url)).toBe(true);expect(policy.allowed('GET',url+'&extra=1')).toBe(false);expect(policy.allowed('POST',url)).toBe(false);
});
test('el host no sirve Operaciones ni incorpora sus escritores, Daily, altas o usuarios',()=>{
  expect(policy.assets).not.toContain('pages/operaciones.js');expect(policy.assets).toContain('js/transportesUi.js');
  for(const url of ['/api/transportes/1','/api/operaciones/1','/api/usuarios/1','/api/reservaciones'])expect(policy.allowed('PATCH',url)).toBe(false);
  expect(fs.readFileSync(path.join(root,'frontend/index.html'),'utf8')).not.toContain('reservationCommands.js');
});
test('reglas originales conservan 12 por transporte, 24 por tour/turno, mínimo y PAX con niños incluidos',()=>{
  const c=require('../services/capacidad.service');
  expect(c.validarMaximoTourTurno(24)).toBeNull();expect(c.validarMaximoTourTurno(25)).toMatch(/24/);
  expect(c.validarCapacidadTransporte({id_vehiculo:null},12)).toBeNull();expect(c.validarCapacidadTransporte({id_vehiculo:null},13)).toMatch(/12/);
  expect(c.validarCapacidadTransporte({id_vehiculo:1,capacidad:3},4)).toMatch(/capacidad/);
  expect(c.validarMinimoTransporteConVehiculo({id_vehiculo:1},1)).toMatch(/2/);
  expect(c.obtenerPaxOperativoReservacion({pax:2,ninos:1,estado:'Programada'})).toBe(2);
  expect(c.obtenerPaxOperativoReservacion({pax:8,ninos:3,estado:'Cancelada'})).toBe(0);
});
