'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=__dirname,files=[];
function walk(dir){for(const e of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){const r=path.posix.join(dir,e.name);if(e.isSymbolicLink()||['node_modules','.git','dist','.agents','.codex'].includes(e.name)||r==='docs/local-fase-2e6-enterprise'||e.name.startsWith('.env'))continue;if(e.isDirectory())walk(r);else files.push({file:r,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,r))).digest('hex')});}}
walk('');fs.writeFileSync(path.join(out,'source-before.json'),JSON.stringify(files,null,2),{flag:'wx'});
const changing=['backend/config/operationalTransactions.js','backend/config/revisionApiTransactions.js','backend/security/credentialPolicy.js','backend/validators/auditoria.validator.js','backend/services/comandos.service.js','backend/services/bitacora.service.js','backend/services/reservacionesCapacity023.service.js','backend/revisionApiApp.js','backend/unifiedFrontend.js','backend/config/integration024Policy.js','backend/config/manualReferences025Policy.js','backend/services/cleanInstallationCertification.service.js','frontend/js/unifiedActivation.js','frontend/pages/reservaciones.js'];
for(const r of changing){const dest=path.join(out,'originals',r);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(path.join(root,r),dest,fs.constants.COPYFILE_EXCL);}
console.log(JSON.stringify({baselineFiles:files.length,selectiveCopies:changing.length}));
