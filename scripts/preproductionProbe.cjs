'use strict';
require('./unifiedProbe.cjs').startProbe(require('../backend/preproductionApi').start,process.argv[2]);
