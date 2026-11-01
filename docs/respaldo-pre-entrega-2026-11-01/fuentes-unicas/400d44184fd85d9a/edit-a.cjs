const fs=require('node:fs');
for(const file of ['backend/config/operationalTransactions.js','backend/config/revisionApiTransactions.js']){
 let s=fs.readFileSync(file,'utf8');s=s.replaceAll("'administrative-frontend023-lab']","'administrative-frontend023-lab','first-access023-lab']");s=s.replace("const security=integrated||config.APP_ENVIRONMENT==='credential-security-api-lab';","const security=integrated||['credential-security-api-lab','first-access023-lab'].includes(config.APP_ENVIRONMENT);");
 if(file.endsWith('operationalTransactions.js'))s=s.replace("if (config.APP_ENVIRONMENT === 'credential-security-api-lab'", "if (config.APP_ENVIRONMENT === 'first-access023-lab' && config.DB_SCHEMA_VERSION !== '023') throw Error('OPERATIONAL_LAB_CONFIG');\n    if (config.APP_ENVIRONMENT === 'credential-security-api-lab'");
 fs.writeFileSync(file,s);
}
let s=fs.readFileSync('backend/security/credentialPolicy.js','utf8').replace('[ENVIRONMENT,INTEGRATED]','[ENVIRONMENT,INTEGRATED,\'first-access023-lab\']');fs.writeFileSync('backend/security/credentialPolicy.js',s);
s=fs.readFileSync('backend/revisionApiApp.js','utf8').replace("const integrated=", "const firstAccess=plan.config.APP_ENVIRONMENT==='first-access023-lab';\n    const integrated=").replace("const security=integrated||", "const security=firstAccess||integrated||").replace("require(integrated?", "require(firstAccess?'./config/firstAccessPolicy':integrated?");fs.writeFileSync('backend/revisionApiApp.js',s);
