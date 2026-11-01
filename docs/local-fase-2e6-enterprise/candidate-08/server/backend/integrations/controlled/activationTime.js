'use strict';
function instant(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:?\d\d)$/.test(value))throw Error('CREATION_TIME_UNVERIFIED');
 const normalized=value.replace(/([+-]\d\d)(\d\d)$/,'$1:$2'),date=new Date(normalized);
 if(!Number.isFinite(date.getTime()))throw Error('CREATION_TIME_UNVERIFIED');
 const [y,m,d]=value.slice(0,10).split('-').map(Number);if(new Date(Date.UTC(y,m-1,d)).toISOString().slice(0,10)!==value.slice(0,10))throw Error('CREATION_TIME_UNVERIFIED');
 return date.toISOString();
}
function cancun(local,zone){
 if(zone!=='America/Cancun'||typeof local!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(local))throw Error('ACTIVATION_TIME_INVALID');
 const components=local.match(/\d+/g).map(Number),[year,month,day,hour,minute,second=0]=components,wanted=Date.UTC(year,month-1,day,hour,minute,second);
 const fmt=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 const parts=t=>Object.fromEntries(fmt.formatToParts(new Date(t)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 let t=wanted;for(let n=0;n<3;n++){const p=parts(t);t+=wanted-Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second);}
 const p=parts(t);if(p.year!==year||p.month!==month||p.day!==day||p.hour!==hour||p.minute!==minute||p.second!==second)throw Error('ACTIVATION_TIME_INVALID');return new Date(t).toISOString();
}
const day=iso=>instant(iso).slice(0,10);
module.exports={instant,cancun,day};
