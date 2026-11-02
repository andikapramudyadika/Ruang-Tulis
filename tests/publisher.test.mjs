import test from 'node:test';
import assert from 'node:assert/strict';
import {createPublisher,seal,unseal,digest,validateImages} from '../publisher/worker.mjs';
import {slugify,postSlug,validatePost} from '../lib/content.mjs';

const site='https://andikapramudyadika.github.io';
const sessionToken='S'.repeat(43),secret='test-only-session-secret-that-is-over-32-characters';
const existing={title:'Tulisan lama',date:'2026-05-03',category:'Monthly Essay',excerpt:'Awal.',file:'posts/tulisan-lama.md'};
class KV {
  data=new Map();async get(key,type){const value=this.data.get(key)??null;return type==='json'&&value?JSON.parse(value):value;}async put(key,value){this.data.set(key,value);}async delete(key){this.data.delete(key);}
}
async function fixture({conflict=false,failReceipt=false,userId=124312344}={}){
 const kv=new KV();const env={SITE_URL:site+'/Ruang-Tulis/',GITHUB_REPOSITORY:'andikapramudyadika/Ruang-Tulis',GITHUB_BRANCH:'main',ALLOWED_GITHUB_ID:'124312344',GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret',SESSION_SECRET:secret,SESSIONS:kv};
 await kv.put(`session:${await digest(sessionToken)}`,await seal({id:userId,login:'andikapramudyadika',token:'server-side-test-token',expires:Date.now()+60000},secret));
 let manifest=[{...existing}],head='head-1',updates=0,blobs=0,trees=[],commits=[],fail=conflict;const files=new Map([['posts/tulisan-lama.md',{sha:'old-blob',content:Buffer.from('Lama.').toString('base64')}]]);
 const json=(data,status=200)=>new Response(JSON.stringify(data),{status});
 const github=async(url,options={})=>{
   const u=new URL(url),pathname=u.pathname,body=options.body?JSON.parse(options.body):null;
   if(pathname==='/user')return json({id:userId,login:'andikapramudyadika'});
   if(pathname==='/repos/andikapramudyadika/Ruang-Tulis')return json({permissions:{push:true}});
   if(url==='https://github.com/login/oauth/access_token')return json({access_token:'oauth-secret'});
   if(pathname.endsWith('/git/ref/heads/main'))return json({object:{sha:head}});
   if(pathname.includes('/git/commits/')&&!body)return json({tree:{sha:'base-tree'}});
   if(pathname.endsWith('/contents/posts.json'))return json({content:Buffer.from(JSON.stringify(manifest)).toString('base64')});
   if(pathname.includes('/contents/')){const value=files.get(pathname.split('/contents/')[1]);return json(value||{},value?200:404);}
   if(pathname.endsWith('/git/blobs')){const sha=`blob-${++blobs}`;files.set(sha,{content:body.encoding==='utf-8'?Buffer.from(body.content).toString('base64'):body.content,sha});return json({sha});}
   if(pathname.endsWith('/git/trees')){trees.push(body);return json({sha:`tree-${trees.length}`});}
   if(pathname.endsWith('/git/commits')){commits.push(body);return json({sha:`commit-${commits.length}`});}
   if(pathname.endsWith('/git/refs/heads/main')){updates++;assert.equal(body.force,false);if(fail){fail=false;manifest.push({title:'Tulisan bersamaan',file:'posts/bersamaan.md'});head='other-head';return json({},422);}const tree=trees.at(-1).tree;manifest=JSON.parse(tree.find(e=>e.path==='posts.json').content);for(const entry of tree)if(entry.sha)files.set(entry.path,files.get(entry.sha));head=body.sha;return json({object:{sha:head}});}
   throw new Error(`Unexpected request: ${url}`);
 };
 if(failReceipt){const originalPut=kv.put.bind(kv);kv.put=async(key,...args)=>{if(key.startsWith('published:'))throw new Error('KV unavailable');return originalPut(key,...args);};}
 const app=createPublisher(github);
 const request=(path,body,options={})=>app.fetch(new Request(`https://publisher.example${path}`,{method:body?'POST':'GET',headers:{Origin:site,Authorization:`Bearer ${sessionToken}`,'Content-Type':'application/json',...options.headers},...(body?{body:JSON.stringify(body)}:{})}),env);
 return {app,env,kv,request,state:()=>({manifest,head,updates,blobs,trees,commits})};
}
const input=()=>({title:'Catatan baru',slug:'catatan-baru',date:'2026-11-02',category:'Personal',excerpt:'Ringkasan.',markdown:'Isi **tebal**.',images:[],publicationId:crypto.randomUUID()});

test('slug and date validation preserve stable paths',()=>{
 assert.equal(slugify('Ruang & Pikiran: Café!'),'ruang-pikiran-cafe');assert.equal(postSlug(existing),'tulisan-lama');
 assert.throws(()=>validatePost({...input(),date:'2026-02-30'}),/Tanggal/);
 assert.throws(()=>validatePost({...input(),file:'posts/../script.js'}),/Lokasi/);
 assert.throws(()=>validatePost({...input(),category:'Invalid'}),/Kategori/);
});
test('session data is encrypted and rejects tampering',async()=>{const value=await seal({token:'keep-private'},secret);assert.ok(!value.includes('keep-private'));assert.deepEqual(await unseal(value,secret),{token:'keep-private'});await assert.rejects(unseal(value,'different-secret'));});
test('anonymous, wrong owner, and foreign origin cannot publish',async()=>{const f=await fixture();assert.equal((await f.request('/api/publish',input(),{headers:{Authorization:''}})).status,401);assert.equal((await f.request('/api/publish',input(),{headers:{Origin:'https://foreign.example'}})).status,403);const other=await fixture({userId:999});assert.equal((await other.request('/api/publish',input())).status,401);assert.equal(f.state().updates,0);});
test('publication commits Markdown and manifest atomically',async()=>{const f=await fixture();const data=input();const response=await f.request('/api/publish',data);assert.equal(response.status,200);const result=await response.json();assert.equal(result.post.slug,'catatan-baru');assert.equal(f.state().updates,1);assert.equal(f.state().manifest.length,2);assert.deepEqual(f.state().trees[0].tree.map(e=>e.path).sort(),['posts.json','posts/catatan-baru.md']);assert.equal(response.headers.get('Access-Control-Allow-Origin'),site);assert.ok(!JSON.stringify(result).includes('server-side-test-token'));});
test('retrying the same publication does not duplicate a post',async()=>{const f=await fixture();const data=input();await f.request('/api/publish',data);assert.equal((await f.request('/api/publish',data)).status,200);assert.equal(f.state().updates,1);assert.equal(f.state().manifest.length,2);const changed={...data,title:'Changed'};assert.equal((await f.request('/api/publish',changed)).status,409);});
test('receipt outage after commit remains successful and retry is recovered from manifest',async()=>{const f=await fixture({failReceipt:true});const data=input();assert.equal((await f.request('/api/publish',data)).status,200);assert.equal((await f.request('/api/publish',data)).status,200);assert.equal(f.state().updates,1);});
test('concurrent unrelated commits are rebased without overwriting other posts',async()=>{const f=await fixture({conflict:true});assert.equal((await f.request('/api/publish',input())).status,200);assert.equal(f.state().updates,2);assert.equal(f.state().manifest.length,3);assert.ok(f.state().manifest.some(p=>p.file==='posts/bersamaan.md'));assert.deepEqual(f.state().commits.at(-1).parents,['other-head']);});
test('same-article conflicts preserve the remote revision',async()=>{const f=await fixture();const update={...input(),file:existing.file,slug:'tulisan-lama',originalSha:'stale'};assert.equal((await f.request('/api/publish',update)).status,409);assert.equal(f.state().updates,0);update.originalSha='old-blob';assert.equal((await f.request('/api/publish',update)).status,200);assert.equal(f.state().manifest.length,1);});
test('duplicate slugs and invalid images are rejected before a commit',async()=>{const f=await fixture();assert.equal((await f.request('/api/publish',{...input(),slug:'tulisan-lama'})).status,409);assert.equal((await f.request('/api/publish',{...input(),markdown:'![x](ruang-image:missing)'})).status,400);assert.throws(()=>validateImages([{id:'img-12345678',data:'data:image/png;base64,PHNjcmlwdD4='}]),/format/);assert.equal(f.state().updates,0);});
test('image blobs and article are included in the same tree',async()=>{const f=await fixture();const data=input();data.images=[{id:'img-12345678',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jrWoAAAAASUVORK5CYII='}];data.markdown='![Gambar](ruang-image:img-12345678 "Keterangan")';const response=await f.request('/api/publish',data);assert.equal(response.status,200);const result=await response.json();assert.match(result.imageMap['img-12345678'],/^\.\.\/images\/catatan-baru-/);assert.equal(f.state().trees[0].tree.length,3);});
test('OAuth uses PKCE, one-time state, owner check and server-only credentials',async()=>{const f=await fixture();const nonce='N'.repeat(43);const start=await f.app.fetch(new Request(`https://publisher.example/auth/start?nonce=${nonce}`),f.env);assert.equal(start.status,302);const target=new URL(start.headers.get('Location'));assert.equal(target.searchParams.get('code_challenge_method'),'S256');const state=target.searchParams.get('state');const callback=`https://publisher.example/auth/callback?state=${state}&code=test-code`;const result=await f.app.fetch(new Request(callback),f.env);assert.equal(result.status,200);const html=await result.text();assert.ok(html.includes('postMessage'));assert.ok(!html.includes('oauth-secret'));assert.ok(result.headers.get('Content-Security-Policy').includes('nonce-'));assert.equal((await f.app.fetch(new Request(callback),f.env)).status,400);});
test('unconfigured service fails closed with an actionable message',async()=>{const app=createPublisher();const response=await app.fetch(new Request('https://publisher.example/api/publish',{method:'POST',body:'{}'}),{});assert.equal(response.status,503);assert.match((await response.json()).error,/belum diaktifkan/);});
