// Setup del verificador: HTTP solo loopback; PostgreSQL siempre se sustituye/bloquea.
require('../../../scripts/accessScopeNetworkGuard.cjs');
const net = require('node:net');
const connect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const values=Array.isArray(args[0])?args[0]:args, target=values[0];
    const host=target&&typeof target==='object'?target.host:values[1];
    const port=target&&typeof target==='object'?target.port:target;
    if (!['127.0.0.1','localhost','::1'].includes(host) || [5432,55473].includes(Number(port))) throw Error('RELEASE03A_SOCKET_BLOCKED');
    return connect.apply(this,args);
};
