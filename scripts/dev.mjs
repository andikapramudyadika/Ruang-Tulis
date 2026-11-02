import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
const root=process.cwd(),port=Number(process.argv.find(arg=>arg.startsWith('--port='))?.split('=')[1]||process.env.PORT||4173);
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon','.txt':'text/plain; charset=utf-8'};
http.createServer(async(request,response)=>{
  try{
    if(!['GET','HEAD'].includes(request.method)){response.writeHead(405).end();return;}
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const segments=pathname.split('/');
    if(segments.some(segment=>segment.startsWith('.')||['node_modules','publisher','tests','scripts','src'].includes(segment))){response.writeHead(403).end();return;}
    let file=path.resolve(root,'.'+pathname);
    if(file!==root&&!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const type=types[path.extname(file)];if(!type){response.writeHead(403).end();return;}
    const bytes=await readFile(file);response.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});response.end(request.method==='HEAD'?undefined:bytes);
  }catch{response.writeHead(404).end('Tidak ditemukan.');}
}).listen(port,'127.0.0.1',()=>console.log(`Ruang Tulis: http://127.0.0.1:${port}`));
