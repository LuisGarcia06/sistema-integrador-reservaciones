const cp = require('node:child_process'), path = require('node:path');
async function run({m,root,clean}) {
    const child = cp.spawn(require('electron'), [path.join(__dirname,'standaloneElectronDriver.cjs'), path.join(m.directory,'manifest.json')],
        { cwd:root,env:clean(),windowsHide:true,stdio:['ignore','pipe','pipe'] });
    let out='';child.stdout.on('data',c=>out+=c);child.stderr.resume();
    const code=await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>{child.kill();reject(Error('ELECTRON_TIMEOUT'));},60000);
        child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('exit',c=>{clearTimeout(timer);resolve(c);});
    });
    if(code!==0||!out.includes('STANDALONE_ELECTRON_CLOSED_OK'))throw Error('ELECTRON_CHECK_FAILED');
    return ['Real Electron main connects to signed backend; sandbox and login verified','Real Electron window closes normally'];
}
module.exports={run};
