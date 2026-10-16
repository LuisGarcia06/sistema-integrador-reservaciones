const fs=require('node:fs'),g=require('../../scripts/devDb02.cjs');
describe('DEV-DB-03: identidad de la cuenta configurada',()=>{
 const cfg={DB_HOST:'localhost',DB_PORT:'5432',DB_NAME:g.DATABASE,DB_USER:'sian_kaan_dev_app',JWT_SECRET:'a'.repeat(64),GYG_GMAIL_SYNC_ENABLED:'false'};
 test('credencial distinta de la configurada aborta antes de conectar',()=>{expect(()=>g.cleanEnvironment(cfg,{username:'postgres',password:'synthetic'})).toThrow('DEV_CONFIG_USER_MISMATCH');});
 test('el usuario configurado prevalece sobre variables heredadas',()=>{const env=g.cleanEnvironment(cfg,{username:'sian_kaan_dev_app',password:'synthetic'},{DB_USER:'postgres',DB_NAME:'sian_kaan_reservaciones',PGPASSWORD:'foreign',NODE_OPTIONS:'--require foreign',PATH:'safe'});expect(env.DB_USER).toBe('sian_kaan_dev_app');expect(env.DB_NAME).toBe(g.DATABASE);expect(env.APP_CONFIG_PATH).toBe(g.CONFIG);expect(env).not.toHaveProperty('PGPASSWORD');expect(env).not.toHaveProperty('NODE_OPTIONS');});
 test('archivo independiente rechaza usuarios administrativos',()=>{
  require('dotenv');const original=fs.readFileSync,spy=jest.spyOn(fs,'readFileSync').mockImplementation((p,...args)=>String(p)===g.CONFIG?Buffer.from(Object.entries({...cfg,DB_USER:'postgres'}).map(([k,v])=>k+'='+v).join('\n')):original(p,...args));
  try{expect(()=>g.readConfig()).toThrow('DEV_CONFIG_INVALID');}finally{spy.mockRestore();}
 });
 test('archivo independiente admite solamente el rol limitado designado',()=>{
  require('dotenv');const original=fs.readFileSync,spy=jest.spyOn(fs,'readFileSync').mockImplementation((p,...args)=>String(p)===g.CONFIG?Buffer.from(Object.entries(cfg).map(([k,v])=>k+'='+v).join('\n')):original(p,...args));
  try{expect(g.readConfig().DB_USER).toBe('sian_kaan_dev_app');}finally{spy.mockRestore();}
 });
});

