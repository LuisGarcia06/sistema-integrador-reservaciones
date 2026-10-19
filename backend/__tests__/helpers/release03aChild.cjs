// Hijo SOLO de pruebas: ninguna configuración/credencial real ni importación de pg.
const Module = require('node:module'), net = require('node:net'), http = require('node:http');
const load = Module._load;
Module._load = function (name, ...args) {
    if (/^(pg|dotenv|googleapis|@google-cloud\/)/.test(name)) throw Error('LAB_IMPORT_BLOCKED');
    return load.call(this, name, ...args);
};
net.Socket.prototype.connect = function () { throw Error('LAB_ALL_OUTGOING_BLOCKED'); };
global.fetch = async () => { throw Error('LAB_ALL_OUTGOING_BLOCKED'); };
let server;
const send = process.send.bind(process);
process.send = (message, callback) => send({ ...message, laboratoryPort: server?.address()?.port }, callback);
const { runChild } = require('../../desktopChild');
const { config, fakePool } = require('./release03aFixtures.cjs');
runChild({
    loadConfig: () => ({ config, digest: 'd'.repeat(64) }), hashCode: () => 'c'.repeat(64),
    initialize: () => {}, getPool: () => fakePool(), isolate: () => {},
    createServer(handler) {
        server = http.createServer(handler);
        const listen = server.listen.bind(server);
        server.listen = (options, cb) => {
            if (options.port !== 3000 || options.host !== '127.0.0.1' || !options.exclusive) throw Error('LAB_BIND_CONTRACT');
            return listen({ ...options, port: Number(process.argv[2] || 0) }, cb);
        };
        return server;
    },
    getApp: () => (_req, res) => res.end('SOLO_API_FICTICIA_RELEASE_03A')
});
