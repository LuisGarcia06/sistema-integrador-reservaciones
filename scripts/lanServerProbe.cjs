// No iniciar escucha/DB ni workers: comprobar que la entrada real rechaza esta topología ficticia.
const Module=require('node:module');
let io=0;
const original=Module._load;
Module._load=function(request,...args){if(request==='pg'){io++;throw Error('PROBE_POSTGRES_FORBIDDEN');}return original.call(this,request,...args);};
const net=require('node:net');
net.Server.prototype.listen=net.Socket.prototype.connect=function(){io++;throw Error('PROBE_NETWORK_FORBIDDEN');};
const cp=require('node:child_process');cp.spawn=cp.fork=()=>{io++;throw Error('PROBE_CHILD_FORBIDDEN');};
require('../backend/lanLab').main(['--server',process.argv[2]]).then(()=>{throw Error('PROBE_SERVER_MUST_REJECT');}).catch(error=>{
    if(io||!['LAN_NETWORK_NOT_ISOLATED','LAN_NETWORK_CHANGED','LAN_INVENTORY_UNAVAILABLE'].includes(error.code)){
        console.error('LAN_SERVER_PROBE_FAILED '+(error.code||error.message));process.exitCode=1;
    }else console.log('LAN_SERVER_REJECTED_SAFELY_NO_POSTGRES_NO_LISTENER');
});
