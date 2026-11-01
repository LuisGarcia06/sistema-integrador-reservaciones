(function(){
  'use strict';const App=window.App=window.App||{};let generation=null;
  function supported(method,url){return method==='POST'&&/^\/api\/(usuarios|tours|guias|operadores|vehiculos|paises|plataformas)$/.test(url)||method==='PATCH'&&/^\/api\/(usuarios|tours|guias|operadores|vehiculos)\/[1-9][0-9]*$/.test(url)||method==='PATCH'&&/^\/api\/usuarios\/[1-9][0-9]*\/password$/.test(url);}
  function password(value){if(typeof value!=='string'||!value.isWellFormed()||value.includes('\0')||/^[\p{White_Space}\uFEFF]*$/u.test(value)||[...value].length<8||new TextEncoder().encode(value).length>72)throw Error('La contraseña requiere ocho puntos Unicode, máximo 72 bytes y texto válido no blanco.');return value;}
  App.adminUi={protocol:'ctsk-administrative-frontend023-v1',supported,password,get generation(){return generation;},noteGeneration(value){if(!/^[a-f0-9-]{36}$/.test(value||''))return;if(generation&&generation!==value)App.adminCommands?.clearReferences();generation=value;}};
})();
