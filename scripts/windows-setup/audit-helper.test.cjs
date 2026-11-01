'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
test('auditor externo no ejecuta al importarse y rechaza rutas arbitrarias',()=>{const {audit}=require('./audit-helper.cjs');for(const name of ['../outside','C:\\program','026-setup-02;whoami',''])assert.throws(()=>audit(name),/HELPER_NAME/);});
