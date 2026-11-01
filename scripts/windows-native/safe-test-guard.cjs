'use strict';
// Solo para node --test --experimental-test-isolation=none. Nunca se distribuye.
// Un test que intente abrir red o ejecutar un proceso real falla inmediatamente.
const cp = require('node:child_process');
const net = require('node:net');
const tls = require('node:tls');
const http = require('node:http');
const https = require('node:https');
const dgram = require('node:dgram');
const worker = require('node:worker_threads');
const blocked = () => { throw Error('SECURITY_REVIEW_FORBIDS_REAL_PROCESS_OR_NETWORK'); };
for (const name of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) cp[name] = blocked;
for (const mod of [net, tls]) { mod.connect = blocked; mod.createConnection = blocked; }
net.Socket.prototype.connect = blocked;
net.Server.prototype.listen = blocked;
for (const mod of [http, https]) { mod.request = blocked; mod.get = blocked; }
dgram.createSocket = blocked;
worker.Worker = blocked;
require('node:module').syncBuiltinESMExports();
