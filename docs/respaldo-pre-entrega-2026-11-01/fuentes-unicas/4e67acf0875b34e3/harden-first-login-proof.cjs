const fs=require('node:fs');let s=fs.readFileSync('scripts/unifiedAdmin.cjs','utf8');s=s.replace('function createProfile(firstProfile){',`function verifyLogin(firstProfile,observed){
 const plan=firstProfile.plan,login=observed?.login,session=observed?.session,m=plan.manifest;
 if(login?.status!==200||session?.status!==200||login.headers?.['x-ctsk-protocol']!==require('../backend/config/firstAccessPolicy').PROTOCOL||session.headers?.['x-ctsk-data-generation']!==m.dataGeneration)B.fail('UNIFIED_OBSERVED_FIRST_LOGIN_REQUIRED');
 let claims;try{claims=require('jsonwebtoken').verify(login.body?.token,plan.config.JWT_SECRET,{algorithms:['HS256'],issuer:require('../backend/security/credentialPolicy').ISSUER,audience:require('../backend/security/credentialPolicy').AUDIENCE});}catch{B.fail('UNIFIED_OBSERVED_FIRST_LOGIN_REQUIRED');}
 const user=session.body?.usuario;
 if(claims.sub!==String(m.initialUser)||claims.dg!==m.dataGeneration||claims.cv!=='1'||claims.token_use!=='access'||!user||user.id_usuario!==m.initialUser||user.rol!=='Administrador'||user.alcance_plataformas!=='all'||!Array.isArray(user.platform_ids)||user.platform_ids.length||JSON.stringify(user)!==JSON.stringify(login.body.usuario))B.fail('UNIFIED_OBSERVED_FIRST_LOGIN_REQUIRED');
 return true;
}
function createProfile(firstProfile,observed){
 verifyLogin(firstProfile,observed);`);
s=s.replace('sessionVerified:true};','sessionVerified:true,loginTokenVerified:true,unifiedCode:P.fingerprint(first.manifest.root)};');s=s.replace('module.exports={createProfile,start};','module.exports={createProfile,start,verifyLogin};');fs.writeFileSync('scripts/unifiedAdmin.cjs',s);
s=fs.readFileSync('scripts/unifiedLab.cjs','utf8').replace('createProfile(h.firstProfile)','createProfile(h.firstProfile,{login,session})');fs.writeFileSync('scripts/unifiedLab.cjs',s);
s=fs.readFileSync('backend/config/unifiedPolicy.js','utf8').replace("b.sessionVerified!==true)","b.sessionVerified!==true||b.loginTokenVerified!==true||b.unifiedCode!==m.code)");fs.writeFileSync('backend/config/unifiedPolicy.js',s);
