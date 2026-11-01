'use strict';require('./scripts/pilot025Supervisor.cjs').start(process.argv[2],process.argv[3]).catch(()=>{console.error('PILOT025_START_REJECTED');process.exitCode=1;});
