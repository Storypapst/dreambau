import http from 'node:http';import {check,run} from '../lib/check.mjs';import {publicAcceptance} from '../public-acceptance.mjs';
const policy="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
let current=policy,old=false;
const server=http.createServer((req,res)=>{
 if(req.url==='/teamwork'){res.writeHead(308,{Location:'/teamwork/'});res.end();return;}
 res.writeHead(200,{'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':current,'Content-Type':'application/json'});
 res.end(JSON.stringify(req.url.endsWith('programs.json')?{format:1,zones:[{id:'verwaltung',name:'Verwaltung',color:'lime',ring:'inner'}],programs:[]}:{format:1,checkedAt:new Date(Date.now()-(old?7200000:0)).toISOString().replace(/\.\d{3}Z$/,'Z'),reachable:[]}));
});
await new Promise((resolve)=>server.listen(0,'127.0.0.1',resolve));
try{await run(async()=>{
 for(const weak of ["script-src *; "+policy,"SCRIPT-SRC *; "+policy,policy.replace("script-src 'self'","script-src 'self' 'unsafe-inline'"),policy.replace("connect-src 'self'","connect-src *")]){
  current=weak;let rejected=false;try{await publicAcceptance('http://127.0.0.1:'+server.address().port);}catch(error){rejected=/^C52 /.test(error.message);}check('C52 real HTTP rejects duplicate, unsafe, and permissive policies',rejected);
 }
 current=policy;old=true;let rejected=false;try{await publicAcceptance('http://127.0.0.1:'+server.address().port);}catch(error){rejected=error.message==='C53 fresh status contract';}check('C56 exactly two-hour-old public status is rejected before browser acceptance',rejected);
});}finally{await new Promise((resolve)=>server.close(resolve));}
