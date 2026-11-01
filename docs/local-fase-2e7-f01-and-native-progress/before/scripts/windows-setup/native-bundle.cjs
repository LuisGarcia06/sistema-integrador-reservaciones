'use strict';
// Comprobación previa al empaquetado futuro. No compila ni ejecuta componentes.
const fs=require('node:fs'),path=require('node:path'),G=require('./native-gate.cjs');
function load(directory){
 let validation;try{validation=JSON.parse(fs.readFileSync(path.join(directory,'native-approval.json'),'utf8'));}catch{throw Error('NATIVE_VALIDATION_REQUIRED');}
 const files={reader:'SetupIdentityAcl.exe',privateDirectories:'SetupPrivateDirectories.exe',initdb:'SetupPostgres.exe',service:'SetupPostgres.exe'};
 for(const [kind,name]of Object.entries(files))G.requireComponent(directory,kind,{validation,filename:path.join(directory,name)});
 if(validation.initdb.sha256!==validation.service.sha256)throw Error('NATIVE_COMPONENT_INTEGRITY');
 const dependency=JSON.parse(fs.readFileSync(path.join(directory,'postgres-dependency.json'),'utf8'));
 require('../../shared/optionCPostgres').validateDependency(dependency);
 return {directory,validation};
}
function copy(bundle,target,{readerOnly=false}={}){
 fs.mkdirSync(target,{recursive:false});
 for(const name of readerOnly?['SetupIdentityAcl.exe','native-approval.json']:['SetupIdentityAcl.exe','SetupPrivateDirectories.exe','SetupPostgres.exe','native-approval.json','postgres-dependency.json'])fs.copyFileSync(path.join(bundle.directory,name),path.join(target,name),fs.constants.COPYFILE_EXCL);
}
module.exports={load,copy};
