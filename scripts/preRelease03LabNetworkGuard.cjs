// Ningún socket del verificador puede dirigirse a principal/DEV ni a proveedores.
require('./accessScopeNetworkGuard.cjs');
const net = require('node:net');
const original = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
    const values = Array.isArray(args[0]) ? args[0] : args;
    const option = values[0];
    const port = typeof option === 'object' ? option.port : option;
    const host = typeof option === 'object' ? option.host : values[1];
    if (Number(port) !== 55473 || host !== '127.0.0.1') throw Error('PRE_RELEASE_03_LAB_NETWORK_BLOCKED');
    return original.apply(this, args);
};
