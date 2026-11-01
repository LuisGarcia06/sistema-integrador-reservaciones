// Entrada exclusiva del paquete público; jamás cae en la modalidad heredada.
if (process.argv.some(a => a.startsWith('--ctsk-mode='))) throw Error('LAN_ENTRY_MODE_EXCLUSIVE');
process.argv.push('--ctsk-mode=lan-lab');
require('./main');
