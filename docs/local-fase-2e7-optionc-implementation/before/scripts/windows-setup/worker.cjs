'use strict';
const P=require('./policy.cjs');
async function main(){const C=require('./coordinator.cjs');if(process.argv[2]==='console-check'){C.validateJob(C.context(),process.argv[3]);console.log('CONSOLE_STAGE_VERIFIED');return;}
 let data='';for await(const chunk of process.stdin){data+=chunk;if(data.length>2048)throw Error('START_FAILED');}
 const input=JSON.parse(data);if(Object.keys(input).some(k=>!['action','ack'].includes(k))||typeof input.action!=='string')throw Error('START_FAILED');
 const result=await C.dispatch(input.action,input.ack===true);console.log(JSON.stringify({ok:true,result}));}
if(require.main===module)main().catch(e=>{console.log(JSON.stringify({ok:false,error:P.publicError(e)}));process.exitCode=1;});
module.exports={main};
