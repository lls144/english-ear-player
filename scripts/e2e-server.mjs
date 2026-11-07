// Test-only loopback proxy. Real HTTP failures also reach WebKit's native media backend,
// which bypasses Playwright route interception and browserContext offline emulation on Windows.
import http from 'node:http';
const prod=process.env.EAR_E2E_PRODUCTION==='1',port=prod?5185:5184,upstream=prod?4173:5173;
const controls=new Map();
http.createServer(async(req,res)=>{
 const parsed=new URL(req.url,'http://127.0.0.1'),pathname=parsed.pathname;
 const control=pathname.match(/^\/__e2e_control\/([a-z0-9-]+)$/);
 if(control && req.method==='POST'){
  let body='';for await(const chunk of req)body+=chunk;
  try{controls.set(control[1],JSON.parse(body));res.writeHead(200,{'content-type':'application/json'});res.end('{}');}catch{res.writeHead(400);res.end();}
  return;
 }
 const session=pathname.match(/\/sessions\/([a-z0-9-]+)\//);
 let forwarded=pathname;
 if(session)forwarded=pathname.replace('/sessions/'+session[1]+'/','/');
 const config=session?controls.get(session[1])??{}:{};
 if(/\.mp3$/.test(pathname)){
  const matches=file=>{const id=file.replace(/\.mp3$/,'');return pathname.endsWith('/'+file)||new RegExp('/'+id+'\\.[a-f0-9]+\\.mp3$').test(pathname);};
  if(config.delayFile && matches(config.delayFile))await new Promise(r=>setTimeout(r,config.delayMs??1000));
  if(config.failFile && matches(config.failFile)){res.writeHead(config.status??503,{'content-type':'text/plain','cache-control':'no-store'});res.end('Controlled test media failure');return;}
 }
 const headers={...req.headers,host:'127.0.0.1:'+upstream};
 const proxy=http.request({hostname:'127.0.0.1',port:upstream,path:forwarded+parsed.search,method:req.method,headers},r=>{
  res.writeHead(r.statusCode??502,{...r.headers,'cache-control':'no-store'});r.pipe(res);
 });
 proxy.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end();});
 req.on('aborted',()=>proxy.destroy());req.pipe(proxy);
}).listen(port,'127.0.0.1',()=>console.log('E2E proxy ready on '+port));

