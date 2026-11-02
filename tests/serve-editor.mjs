// Local, in-memory end-to-end fixture. It never calls the real GitHub API.
// Run: node tests/serve-editor.mjs — website :4175, publisher :4176.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createPublisher} from '../publisher/worker.mjs';
const root=process.cwd(),site='http://127.0.0.1:4175/',origin='http://127.0.0.1:4176';
const files=new Map(),fileShas=new Map(),blobs=new Map(),trees=new Map(),commits=new Map(),kv=new Map();
let head='initial-head',counter=0;
files.set('posts.json',await readFile('posts.json'));
for(const post of JSON.parse(files.get('posts.json')))files.set(post.file,await readFile(post.file));
const env={SITE_URL:site,GITHUB_REPOSITORY:'test-only/ruang-tulis',GITHUB_BRANCH:'main',ALLOWED_GITHUB_ID:'124312344',GITHUB_CLIENT_ID:'local-test-client',GITHUB_CLIENT_SECRET:'local-test-secret',SESSION_SECRET:'local-fixture-secret-not-for-production-123456',SESSIONS:{async get(key,type){const value=kv.get(key)||null;return type==='json'&&value?JSON.parse(value):value;},async put(key,value){kv.set(key,value);},async delete(key){kv.delete(key);}}};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const fakeGitHub=async(url,options={})=>{
  const u=new URL(url),p=u.pathname,body=options.body?JSON.parse(options.body):null;
  if(url==='https://github.com/login/oauth/access_token')return json({access_token:'local-only-test-token'});
  if(u.origin!=='https://api.github.com')throw new Error('External network forbidden in test fixture');
  if(p==='/user')return json({id:124312344,login:'local-test-owner'});
  const prefix='/repos/test-only/ruang-tulis';if(!p.startsWith(prefix))throw new Error('Wrong repository in test fixture');const route=p.slice(prefix.length);
  if(route==='')return json({permissions:{push:true}});
  if(route==='/git/ref/heads/main')return json({object:{sha:head}});
  if(route.startsWith('/git/commits/')&&!body)return json({tree:{sha:'base-tree'}});
  if(route.startsWith('/contents/')){const file=route.slice('/contents/'.length),content=files.get(file);return content?json({sha:fileShas.get(file)||'sha-'+Buffer.from(content).toString('base64').slice(-24),content:Buffer.from(content).toString('base64')}):json({},404);}
  if(route==='/git/blobs'){const sha='blob-'+ ++counter;blobs.set(sha,Buffer.from(body.content,body.encoding==='base64'?'base64':'utf8'));return json({sha});}
  if(route==='/git/trees'){const sha='tree-'+ ++counter;trees.set(sha,body.tree);return json({sha});}
  if(route==='/git/commits'){const sha='commit-'+ ++counter;commits.set(sha,body);return json({sha});}
  if(route==='/git/refs/heads/main'){if(body.force||commits.get(body.sha).parents[0]!==head)return json({},422);for(const item of trees.get(commits.get(body.sha).tree)){files.set(item.path,item.content?Buffer.from(item.content):blobs.get(item.sha));if(item.sha)fileShas.set(item.path,item.sha);}head=body.sha;return json({object:{sha:head}});}
  throw new Error('Unexpected fixture route: '+route);
};
const worker=createPublisher(fakeGitHub);
http.createServer(async(req,res)=>{
  try{
    const parts=[];for await(const chunk of req)parts.push(chunk);const body=Buffer.concat(parts);
    const request=new Request(origin+req.url,{method:req.method,headers:req.headers,...(body.length?{body}:{})});let result=await worker.fetch(request,env);
    // Complete the OAuth redirect locally; never visit the real GitHub login.
    if(req.url.startsWith('/auth/start')&&result.status===302){const state=new URL(result.headers.get('Location')).searchParams.get('state');result=new Response(null,{status:302,headers:{Location:`${origin}/auth/callback?state=${encodeURIComponent(state)}&code=fixture-code`}});}
    res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));
  }catch(error){res.writeHead(500).end(error.message);}
}).listen(4176,'127.0.0.1');
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.md':'text/plain; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
http.createServer(async(req,res)=>{
  try{
    const pathname=decodeURIComponent(new URL(req.url,site).pathname),relative=pathname.slice(1)||'index.html';
    if(relative.split('/').some(s=>s.startsWith('.')||['node_modules','publisher','tests','scripts','src'].includes(s))){res.writeHead(403).end();return;}
    let data,type;if(relative==='site.config.js'){data=`window.RUANG_TULIS={repository:'test-only/ruang-tulis',branch:'main',siteUrl:'${site}',publisherUrl:'${origin}'};`;type='text/javascript';}
    else if(files.has(relative)){data=files.get(relative);type=types[path.extname(relative)]||'application/octet-stream';}
    else{const resolved=path.resolve(root,relative);if(!resolved.startsWith(root+path.sep))throw new Error('Invalid path');await stat(resolved);data=await readFile(resolved);type=types[path.extname(resolved)]||'text/plain';}
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'}).end(data);
  }catch{res.writeHead(404).end();}
}).listen(4175,'127.0.0.1',()=>console.log(`In-memory test only: ${site}tulis.html`));
