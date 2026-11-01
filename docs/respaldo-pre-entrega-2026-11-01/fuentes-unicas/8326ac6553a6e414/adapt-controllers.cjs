'use strict';
// Registro reproducible de la adaptación acotada; compara con copias previas.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../..');
for(const [r,s,v]of [['tours','Tour','tour'],['guias','Guia','guia'],['operadores','Operador','operador'],['vehiculos','Vehiculo','vehiculo'],['paises','Pais','pais'],['plataformas','Plataforma','plataforma']]){
    const relative='backend/controllers/'+r+'.controller.js',file=path.join(root,relative),original=fs.readFileSync(file,'utf8');
    assert.equal(original,fs.readFileSync(path.join(__dirname,'originals',relative),'utf8'));
    const eol=original.includes('\r\n')?'\r\n':'\n';let content=original;
    const replace=(from,to)=>{assert.ok(content.includes(from),relative+': '+from);content=content.replace(from,to);};
    replace('validarDatos'+s+'(req.body || {})',"require('../validators/auditoria.validator').validate(validarDatos"+s+', req.body || {})');
    if(!['paises','plataformas'].includes(r))replace('validarDatosActualizacion'+s+'(req.body || {})',"require('../validators/auditoria.validator').validate(validarDatosActualizacion"+s+', req.body || {}, true)');
    if(['tours','guias','operadores'].includes(r)){
        let n=0;content=content.replace(/        console\.error\('Error al (?:crear|actualizar)[^\r\n]+/g,line=>{n++;return '        if (error.statusCode) return res.status(error.statusCode).json({mensaje:error.message});'+eol+line;});assert.equal(n,2);
    }else{
        let n=0;content=content.replace(/        const respuestaErrorPostgres = obtenerRespuestaErrorPostgres\(error\);/g,line=>{n++;return "        if (error.auditoriaFallida) return res.status(500).json({mensaje:'No se pudo registrar la auditoría'});"+eol+line;});assert.equal(n,r==='vehiculos'?2:1);
    }
    fs.writeFileSync(file,content);
}
