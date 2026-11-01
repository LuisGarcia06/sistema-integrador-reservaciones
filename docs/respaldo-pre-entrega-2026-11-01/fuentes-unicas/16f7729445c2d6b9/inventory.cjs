'use strict';
const fs=require('node:fs'),path=require('node:path');
const modules=['auth','reservaciones','dashboard','operaciones','transportes','daily','bitacora','usuarios','tours','guias','operadores','vehiculos','paises','plataformas','eventosIntegracion','integracionesControl','centroAvisos','notificaciones'];
const inventory=[];
for(const name of modules){const file=path.join('backend/routes',name+'.routes.js');if(!fs.existsSync(file))continue;const router=require('../../'+file.replaceAll('\\','/'));for(const layer of router.stack||[]){if(!layer.route)continue;const route=layer.route;inventory.push({module:name,source:file.replaceAll('\\','/'),methods:Object.keys(route.methods).map(m=>m.toUpperCase()),path:route.path,handlers:route.stack.map(x=>x.handle.name||'anonymous')});}}
fs.writeFileSync(path.join(__dirname,'routes-inventory.json'),JSON.stringify(inventory,null,2));console.log(JSON.stringify({routes:inventory.length,modules:[...new Set(inventory.map(r=>r.module))]}));
