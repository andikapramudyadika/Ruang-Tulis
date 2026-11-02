import {Editor, generateHTML} from '@tiptap/core';
import {EditorState} from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import TurndownService from 'turndown';
import {render} from './renderer.mjs';
import {slugify,postSlug,escapeHTML as esc,validatePost} from '../lib/content.mjs';

const $=id=>document.getElementById(id),config=window.RUANG_TULIS;
const publisher=String(config.publisherUrl||'').replace(/\/$/,'');
const validPublisher=/^https:\/\//.test(publisher)||/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(publisher);
let db,editor,draft,saveTimer,saveQueue=Promise.resolve(),unsaved=false,publishing=false,connected=false,authWindow,authNonce,imagePosition=null,uploading=0,pollGeneration=0,draftRevision=0;
const safeSession={get(){try{return sessionStorage.getItem('ruang-session')||'';}catch{return '';}},set(value){try{if(value)sessionStorage.setItem('ruang-session',value);else sessionStorage.removeItem('ruang-session');}catch{}}};
let sessionId=safeSession.get();
const freshDraft=()=>({id:crypto.randomUUID(),title:'',date:localDate(),category:RuangUI.storage.get('last-category')||'Monthly Essay',excerpt:'',slug:'',slugTouched:false,doc:{type:'doc',content:[{type:'paragraph'}]},updated:Date.now()});
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function notice(message,error=false){$('editorNotice').hidden=!message;$('editorNotice').textContent=message;$('editorNotice').dataset.error=String(error);}
function resizeTitle(){const title=$('postTitle');title.style.height='auto';title.style.height=`${title.scrollHeight}px`;}
function openDB(){return new Promise((resolve,reject)=>{const request=indexedDB.open('ruang-tulis-writer',1);request.onupgradeneeded=()=>request.result.createObjectStore('drafts',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);request.onblocked=()=>reject(new Error('Penyimpanan diblokir.'));});}
function dbAction(mode,callback){return new Promise((resolve,reject)=>{if(!db){reject(new Error('Penyimpanan tidak tersedia.'));return;}const tx=db.transaction('drafts',mode);const request=callback(tx.objectStore('drafts'));tx.oncomplete=()=>resolve(request?.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});}
function capture(){return {...draft,title:$('postTitle').value.trim(),date:$('postDate').value,category:$('postCategory').value,slug:$('postSlug').value.trim(),excerpt:$('postExcerpt').value.trim(),doc:editor.getJSON(),updated:Date.now()};}
function updateCount(){const text=editor.getText().trim();const count=text?text.split(/\s+/).length:0;$('wordCount').textContent=`${count.toLocaleString('id-ID')} kata`;}
function scheduleSave(){draftRevision++;unsaved=true;clearTimeout(saveTimer);$('saveStatus').textContent='Menyimpan…';saveTimer=setTimeout(()=>saveDraft(),400);updateCount();}
async function saveDraft(){
  clearTimeout(saveTimer);if(!editor||!draft)return false;const snapshot=capture(),revision=draftRevision;draft=snapshot;
  const operation=saveQueue.then(()=>dbAction('readwrite',store=>store.put(snapshot)));
  saveQueue=operation.catch(()=>{});
  try{await operation;if(draft.id===snapshot.id&&revision===draftRevision){unsaved=false;$('saveStatus').textContent='Tersimpan di perangkat ini';}RuangUI.storage.set('current-draft',draft.id);return true;}
  catch{unsaved=true;$('saveStatus').textContent='Belum tersimpan';notice('Penyimpanan perangkat penuh atau tidak tersedia. Simpan salinan Markdown sebelum menutup halaman.',true);return false;}
}
function loadDocument(content,resetHistory=true){editor.chain().setContent(content,{emitUpdate:false}).command(({tr})=>{tr.setMeta('addToHistory',false);return true;}).run();if(resetHistory)editor.view.updateState(EditorState.create({schema:editor.schema,doc:editor.state.doc,plugins:editor.state.plugins}));refreshToolbar();}
function restore(value){draft=value;$('postTitle').value=draft.title||'';$('postCategory').value=draft.category||'Monthly Essay';$('postDate').value=draft.date||localDate();$('postSlug').value=draft.slug||'';$('postSlug').readOnly=!!draft.file;$('postExcerpt').value=draft.excerpt||'';$('categorySummary').textContent=$('postCategory').value;loadDocument(draft.doc||'');$('publishButton').innerHTML=`${draft.file?'Perbarui':'Terbitkan'}${RuangUI.icon('arrow')}`;$('publicationResult').hidden=true;pollGeneration++;resizeTitle();updateCount();unsaved=false;notice('');RuangUI.storage.set('current-draft',draft.id);$('saveStatus').textContent='Tersimpan di perangkat ini';}
const CaptionImage=Image.extend({
  addAttributes(){return {...this.parent?.(),assetPath:{default:null,parseHTML:element=>element.getAttribute('data-asset-path'),renderHTML:attrs=>attrs.assetPath?{'data-asset-path':attrs.assetPath}:{}}};},
  addNodeView(){return ({node})=>{
    const dom=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption');dom.append(img,caption);
    const update=current=>{if(current.type.name!=='image')return false;img.src=current.attrs.src;img.alt=current.attrs.alt||'';caption.textContent=current.attrs.title||'';caption.hidden=!current.attrs.title;return true;};update(node);
    return {dom,update,ignoreMutation:()=>true};
  };}
});
const extensions=[StarterKit.configure({heading:{levels:[2,3]},link:{openOnClick:false,isAllowedUri:url=>/^(?:https?:\/\/|mailto:|#)/i.test(url)},underline:false}),CaptionImage.configure({allowBase64:true}),Placeholder.configure({placeholder:'Apa yang sedang Anda pikirkan? Mulai menulis di sini…'})];
const turndown=new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-',emDelimiter:'*'});
turndown.addRule('strikethrough',{filter:['del','s'],replacement:content=>`~~${content}~~`});
async function hash(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function serialize(doc){
  const copy=structuredClone(doc),images=[],known=new Set();
  async function visit(node){
    if(node.type==='image'){
      if(node.attrs.assetPath)node.attrs.src=node.attrs.assetPath;
      else if(node.attrs.src.startsWith('data:')){const data=node.attrs.src,id=`img-${(await hash(data)).slice(0,32)}`;if(!known.has(id)){known.add(id);images.push({id,data});}node.attrs.src=`ruang-image:${id}`;}
      delete node.attrs.assetPath;
    }
    for(const child of node.content||[])await visit(child);
  }
  await visit(copy);return {markdown:turndown.turndown(generateHTML(copy,extensions)),images};
}
function firstParagraph(){let text='';editor.state.doc.descendants(node=>{if(!text&&node.type.name==='paragraph'&&node.textContent.trim())text=node.textContent.trim();return !text;});return (text||editor.getText()).trim().slice(0,240);}
async function api(path,options={}){
  if(!validPublisher)throw new Error('Layanan penerbitan belum diaktifkan.');
  let response;try{response=await fetch(publisher+path,{...options,headers:{'Content-Type':'application/json',Authorization:`Bearer ${sessionId}`,...options.headers}});}catch{throw new Error('Tidak dapat terhubung. Draft tetap tersimpan; coba lagi saat koneksi pulih.');}
  let data;try{data=await response.json();}catch{throw new Error('Layanan memberikan jawaban yang tidak dapat dibaca.');}
  if(!response.ok){if(response.status===401){sessionId='';safeSession.set('');setConnected(false);}throw new Error(data.error||'Permintaan belum berhasil. Coba lagi.');}return data;
}
function setConnected(value,login=''){
  connected=value;$('connectButton').textContent=value?'Putuskan sesi':validPublisher?'Hubungkan GitHub':'Aktifkan penerbitan';$('libraryConnectButton').hidden=value;$('libraryConnectButton').textContent=validPublisher?'Hubungkan GitHub':'Aktifkan penerbitan';
  $('connectionTitle').textContent=value?`Terhubung sebagai ${login}.`:'Draft milik Anda.';
  $('connectionDescription').textContent=value?'Siap menerbitkan ke Ruang Tulis. Draft tetap disimpan di perangkat ini.':validPublisher?'Masuk dengan akun pemilik saat siap menerbitkan.':'Menulis dan draft siap digunakan. Aktifkan layanan satu kali untuk menerbitkan ke blog.';
}
async function connect(){
  if(!validPublisher){$('setupDialog').showModal();return;}
  authNonce=btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');
  authWindow=window.open(`${publisher}/auth/start?nonce=${encodeURIComponent(authNonce)}`,'ruang-github','popup,width=600,height=720');
  if(!authWindow){notice('Izinkan jendela login GitHub, lalu klik Hubungkan GitHub kembali.',true);return;}
  notice('Selesaikan login di jendela GitHub. Draft Anda tetap aman di sini.');
}
window.addEventListener('message',async event=>{
  if(!validPublisher||event.origin!==new URL(publisher).origin||event.source!==authWindow||event.data?.type!=='ruang-auth'||event.data.nonce!==authNonce||!/^[A-Za-z0-9_-]{43}$/.test(event.data.session||''))return;
  authNonce=null;sessionId=event.data.session;safeSession.set(sessionId);
  try{const data=await api('/api/session');setConnected(true,data.login);notice('GitHub terhubung. Tulisan Anda siap diterbitkan.');}catch(e){notice(e.message,true);}
});
function refreshToolbar(){if(!editor)return;document.querySelectorAll('[data-command]').forEach(button=>{const command=button.dataset.command;const active=command==='h2'?editor.isActive('heading',{level:2}):command==='h3'?editor.isActive('heading',{level:3}):editor.isActive(command);if(button.hasAttribute('aria-pressed'))button.setAttribute('aria-pressed',String(active));if(command==='undo')button.disabled=!editor.can().undo()||publishing;if(command==='redo')button.disabled=!editor.can().redo()||publishing;});}
function showImageDetails(position){imagePosition=position;const node=editor.state.doc.nodeAt(position);if(node?.type.name!=='image')return;$('imageAlt').value=node.attrs.alt||'';$('imageCaption').value=node.attrs.title||'';$('imageDialog').showModal();}
async function compress(file){
  if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type))throw new Error('Pilih gambar JPEG, PNG, WebP, atau GIF.');
  if(file.size>25*1024*1024)throw new Error('Gambar maksimal 25 MB sebelum diperkecil.');
  let bitmap;try{bitmap=await createImageBitmap(file);}catch{throw new Error('Gambar tidak dapat dibaca. Coba simpan sebagai JPEG atau PNG.');}
  try{
    if(bitmap.width*bitmap.height>60000000)throw new Error('Resolusi gambar terlalu besar. Perkecil terlebih dahulu.');
    const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Perangkat belum mendukung pemrosesan gambar.');ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    let data=canvas.toDataURL('image/webp',.82);if(data.length>2000000)data=canvas.toDataURL('image/webp',.65);if(data.length>2700000)throw new Error('Gambar masih terlalu besar. Pilih gambar berukuran lebih kecil.');return data;
  }finally{bitmap.close();}
}
async function addImages(files,position){
  if(publishing)return;const selected=[...files];if(!selected.length)return;if(selected.length>12){notice('Tambahkan maksimal 12 gambar sekaligus.',true);return;}
  const identity=draft.id;uploading++;$('publishButton').disabled=true;$('libraryButton').disabled=true;notice('Menyiapkan gambar…');
  try{
    const nodes=[];for(const file of selected){nodes.push({type:'image',attrs:{src:await compress(file),alt:file.name.replace(/\.[^.]+$/,'').replace(/[-_]+/g,' '),title:''}});}
    if(identity!==draft.id)return;
    const pos=Math.min(position??editor.state.selection.from,editor.state.doc.content.size);editor.chain().focus().insertContentAt(pos,[...nodes,{type:'paragraph'}]).run();await saveDraft();notice('Gambar ditambahkan. Klik gambar untuk mengubah deskripsi dan keterangannya.');
    const first=editor.state.doc.nodeAt(pos);if(nodes.length===1&&first?.type.name==='image')showImageDetails(pos);
  }catch(e){notice(e.message,true);}finally{uploading--;$('publishButton').disabled=publishing||uploading>0;$('libraryButton').disabled=publishing||uploading>0;}
}
function freeze(value){publishing=value;document.body.dataset.publishing=String(value);editor.setEditable(!value);document.querySelectorAll('#postTitle,#postDate,#postCategory,#postSlug,#postExcerpt,#formatBar button,#libraryButton,#connectButton').forEach(el=>el.disabled=value);$('publishButton').disabled=value||uploading>0;refreshToolbar();}
async function trackLive(result,identity){
  const generation=++pollGeneration;const show=message=>{if(generation===pollGeneration&&draft.id===identity){$('publicationResult').textContent=message;const a=document.createElement('a');a.href=result.url;a.target='_blank';a.rel='noopener';a.textContent='Buka tulisan';$('publicationResult').append(document.createElement('br'),a);$('publicationResult').hidden=false;}};
  show('Tulisan tersimpan di GitHub. Menunggu GitHub Pages memperbarui blog…');
  for(let attempt=0;attempt<30;attempt++){
    if(generation!==pollGeneration||draft.id!==identity)return;
    try{const url=new URL('posts.json',config.siteUrl);url.searchParams.set('publication',result.post.publicationId);url.searchParams.set('check',Date.now());const response=await fetch(url,{cache:'no-store'});if(response.ok&&(await response.json()).some(p=>p.publicationId===result.post.publicationId)){show('Tulisan sudah tersedia di blog. Selamat, satu pemikiran lagi menemukan ruangnya.');return;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,4000));
  }
  show('Tulisan tersimpan di GitHub. Pembaruan GitHub Pages masih diproses; periksa blog sebentar lagi.');
}
async function publish(){
  if(publishing||uploading)return;if(!connected){await saveDraft();await connect();return;}
  notice('');freeze(true);const originalLabel=draft.file?'Perbarui':'Terbitkan';$('publishButton').textContent='Menyimpan…';
  try{
    const current=capture(),serialized=await serialize(current.doc);const input={title:current.title,date:current.date,category:current.category,slug:current.slug||slugify(current.title),excerpt:current.excerpt||firstParagraph(),markdown:serialized.markdown,images:serialized.images,...(current.file?{file:current.file,originalSha:current.originalSha}:{})};
    validatePost(input);const contentHash=await hash(JSON.stringify(input));const publicationId=draft.pending?.hash===contentHash?draft.pending.id:crypto.randomUUID();draft.pending={id:publicationId,hash:contentHash};await saveDraft();
    const result=await api('/api/publish',{method:'POST',body:JSON.stringify({...input,publicationId})});
    const doc=editor.getJSON();async function rewrite(node){if(node.type==='image'&&node.attrs.src.startsWith('data:')){const id=`img-${(await hash(node.attrs.src)).slice(0,32)}`;if(result.imageMap[id])node.attrs.assetPath=result.imageMap[id];}for(const child of node.content||[])await rewrite(child);}await rewrite(doc);
    draft={...draft,file:result.post.file,slug:result.post.slug,originalSha:result.fileSha,pending:null};loadDocument(doc,false);$('postSlug').value=draft.slug;$('postSlug').readOnly=true;await saveDraft();trackLive(result,draft.id);
  }catch(e){notice(e.message,true);}
  finally{freeze(false);$('publishButton').innerHTML=`${draft.file?'Perbarui':originalLabel}${RuangUI.icon('arrow')}`;}
}
function preview(){
  const current=capture();const root=$('previewContent');root.innerHTML=`<p class="eyebrow">${esc(current.category)}</p><h1>${esc(current.title||'Tulisan tanpa judul')}</h1><p class="article-meta">${esc(current.date)} · Andika Pramudya</p>${render(editor.getHTML())}`;
  root.querySelectorAll('img').forEach(img=>{if(img.title){const fig=document.createElement('figure'),caption=document.createElement('figcaption');caption.textContent=img.title;img.replaceWith(fig);fig.append(img,caption);}});$('previewDialog').showModal();
}
async function openLibrary(){
  $('libraryDialog').showModal();$('draftList').textContent='Memuat draft…';$('publishedList').textContent='Memuat tulisan…';await saveDraft();
  try{const list=await dbAction('readonly',store=>store.getAll());$('draftList').replaceChildren();for(const item of list.sort((a,b)=>b.updated-a.updated)){
    const row=document.createElement('div');row.className='library-item';const button=document.createElement('button');button.type='button';button.innerHTML=`<strong>${esc(item.title||'Tulisan tanpa judul')}${item.id===draft.id?' · sedang dibuka':''}</strong><small>${esc(new Date(item.updated).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short'}))}</small>`;
    button.addEventListener('click',async()=>{if(!await saveDraft())return;const latest=await dbAction('readonly',store=>store.get(item.id));restore(latest||item);$('libraryDialog').close();});
    const remove=document.createElement('button');remove.type='button';remove.className='icon-button draft-delete';remove.innerHTML=RuangUI.icon('close');remove.setAttribute('aria-label',`Hapus draft ${item.title||'tanpa judul'}`);remove.addEventListener('click',async()=>{if(!confirm('Hapus draft lokal ini? Tulisan yang sudah terbit tidak terhapus.'))return;await dbAction('readwrite',store=>store.delete(item.id));if(item.id===draft.id){restore(freshDraft());await saveDraft();}row.remove();});row.append(button,remove);$('draftList').append(row);
  }}catch{$('draftList').textContent='Draft perangkat belum bisa dibaca. Simpan salinan tulisan sebelum menutup halaman.';}
  if(!connected){$('publishedHint').textContent='Hubungkan GitHub untuk membuka dan menyunting tulisan yang sudah terbit.';$('publishedList').replaceChildren();return;}
  try{const list=(await api('/api/posts')).posts;$('publishedHint').textContent='Pilih tulisan untuk menyunting versi terbaru dari GitHub.';$('publishedList').replaceChildren();for(const post of list.sort((a,b)=>new Date(b.date)-new Date(a.date))){const row=document.createElement('div');row.className='library-item';const button=document.createElement('button');button.type='button';button.innerHTML=`<strong>${esc(post.title)}</strong><small>${esc(post.category)} · ${esc(post.date)}</small>`;button.addEventListener('click',()=>editPost(post,button));row.append(button);$('publishedList').append(row);}}catch(e){$('publishedList').textContent=e.message;}
}
async function editPost(post,button){
  button.disabled=true;
  try{
    const local=(await dbAction('readonly',store=>store.getAll())).filter(d=>d.file===post.file).sort((a,b)=>b.updated-a.updated)[0];
    if(local){if(!confirm('Ada draft lokal untuk tulisan ini. Buka draft tersebut? Pilih Batal untuk mengambil versi GitHub sebagai draft baru.')){}else{restore(local);$('libraryDialog').close();return;}}
    const data=await api(`/api/posts?file=${encodeURIComponent(post.file)}`);const source=data.markdown.replace(/^\uFEFF?(\s*\r?\n)*#\s+.+(?:\r?\n|$)/,'');const html=render(source);const parsed=new DOMParser().parseFromString(html,'text/html');
    if(parsed.querySelector('table,iframe,video,audio,details,h4,h5,h6'))throw new Error('Tulisan memiliki format yang belum didukung editor. Versi asli tetap aman; sunting melalui repository untuk mempertahankan format tersebut.');
    parsed.querySelectorAll('img').forEach(img=>{const original=img.getAttribute('src');if(original&&!/^(https?:|data:)/.test(original)){img.setAttribute('data-asset-path',original);img.src=new URL(original,new URL(post.file,config.siteUrl)).href;}});
    const value={...freshDraft(),title:post.title,date:post.date,category:post.category,excerpt:post.excerpt,slug:postSlug(post),slugTouched:true,file:post.file,originalSha:data.fileSha};
    if(!await saveDraft())return;restore(value);loadDocument(parsed.body.innerHTML);await saveDraft();$('libraryDialog').close();updateCount();
  }catch(e){$('publishedHint').textContent=e.message;}finally{button.disabled=false;}
}
async function exportMarkdown(){
  try{const {markdown}=await serialize(editor.getJSON());const current=capture();const html=generateHTML(current.doc,extensions);const doc=new DOMParser().parseFromString(html,'text/html');doc.querySelectorAll('img').forEach(img=>{if(img.dataset.assetPath)img.src=img.dataset.assetPath;});const source=turndown.turndown(doc.body.innerHTML);const blob=new Blob([`# ${current.title||'Tulisan tanpa judul'}\n\n${source||markdown}\n`],{type:'text/markdown;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${current.slug||slugify(current.title)||'draft'}.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('Salinan Markdown menyertakan gambar baru sebagai data gambar agar tetap tersimpan.');}catch(e){notice(e.message,true);}
}
async function init(){
  try{db=await openDB();}catch{notice('Penyimpanan perangkat tidak tersedia. Gunakan Simpan salinan Markdown untuk menjaga tulisan Anda.',true);}
  $('writingArea').replaceChildren();
  editor=new Editor({element:$('writingArea'),extensions,content:'',editorProps:{attributes:{role:'textbox','aria-label':'Isi tulisan','aria-multiline':'true'},handlePaste(view,event){const files=[...event.clipboardData?.files||[]];if(files.length){event.preventDefault();addImages(files);return true;}return false;},handleDrop(view,event){if(!event.dataTransfer?.files.length)return false;event.preventDefault();const position=view.posAtCoords({left:event.clientX,top:event.clientY})?.pos;addImages(event.dataTransfer.files,position);return true;},handleClickOn(view,pos,node,nodePos,event,direct){if(direct&&node.type.name==='image'){showImageDetails(nodePos);return true;}return false;}},onUpdate:scheduleSave,onSelectionUpdate:refreshToolbar,onTransaction:refreshToolbar});
  let saved;try{const id=RuangUI.storage.get('current-draft');if(id)saved=await dbAction('readonly',store=>store.get(id));}catch{}
  restore(saved||freshDraft());await saveDraft();setConnected(false);
  if(sessionId&&validPublisher)try{const data=await api('/api/session');setConnected(true,data.login);}catch(e){notice(e.message,true);}
  $('postTitle').addEventListener('input',()=>{resizeTitle();if(!draft.file&&!draft.slugTouched)$('postSlug').value=slugify($('postTitle').value);scheduleSave();});
  ['postDate','postCategory','postSlug','postExcerpt'].forEach(id=>$(id).addEventListener('input',()=>{if(id==='postSlug')draft.slugTouched=true;if(id==='postCategory'){$('categorySummary').textContent=$('postCategory').value;RuangUI.storage.set('last-category',$('postCategory').value);}scheduleSave();}));
  document.querySelectorAll('[data-close-dialog]').forEach(button=>button.addEventListener('click',()=>button.closest('dialog').close()));
  $('formatBar').addEventListener('mousedown',event=>{if(event.target.closest('button'))event.preventDefault();});
  document.addEventListener('click',event=>{const command=event.target.closest('[data-command]')?.dataset.command;if(!command)return;if($('formatsDialog').open)$('formatsDialog').close();const chain=editor.chain().focus();if(command==='bold')chain.toggleBold().run();else if(command==='italic')chain.toggleItalic().run();else if(command==='h2'||command==='h3')chain.toggleHeading({level:command==='h2'?2:3}).run();else if(command==='blockquote')chain.toggleBlockquote().run();else if(command==='bulletList')chain.toggleBulletList().run();else if(command==='orderedList')chain.toggleOrderedList().run();else if(command==='undo')chain.undo().run();else if(command==='redo')chain.redo().run();else if(command==='link'){$('linkUrl').value=editor.getAttributes('link').href||'';$('linkDialog').showModal();}});
  $('moreFormatsButton').addEventListener('click',()=>{$('formatsDialog').showModal();});
  $('linkForm').addEventListener('submit',event=>{event.preventDefault();const value=$('linkUrl').value.trim();if(!/^https?:\/\//i.test(value)){$('linkUrl').setCustomValidity('Gunakan alamat https:// atau http://.');$('linkUrl').reportValidity();return;}$('linkDialog').close();editor.chain().focus().extendMarkRange('link').setLink({href:value}).run();});$('linkUrl').addEventListener('input',()=> $('linkUrl').setCustomValidity(''));
  $('removeLinkButton').addEventListener('click',()=>{$('linkDialog').close();editor.chain().focus().extendMarkRange('link').unsetLink().run();});
  $('imageForm').addEventListener('submit',event=>{event.preventDefault();if(imagePosition!==null&&editor.state.doc.nodeAt(imagePosition)?.type.name==='image'){editor.chain().focus().setNodeSelection(imagePosition).updateAttributes('image',{alt:$('imageAlt').value.trim(),title:$('imageCaption').value.trim()}).run();}$('imageDialog').close();});
  $('imageButton').addEventListener('click',()=> $('imageInput').click());$('imageInput').addEventListener('change',event=>{addImages(event.target.files);event.target.value='';});
  $('previewButton').addEventListener('click',preview);$('publishButton').addEventListener('click',publish);$('libraryButton').addEventListener('click',openLibrary);
  $('libraryConnectButton').addEventListener('click',()=>{$('libraryDialog').close();connect();});
  $('newDraftButton').addEventListener('click',async()=>{if(!await saveDraft())return;restore(freshDraft());await saveDraft();$('libraryDialog').close();$('postTitle').focus();});
  $('connectButton').addEventListener('click',async()=>{if(connected){try{await api('/api/logout',{method:'POST',body:'{}'});sessionId='';safeSession.set('');setConnected(false);notice('Sesi GitHub diputuskan. Draft lokal tetap tersimpan.');}catch(e){notice(e.message,true);}}else connect();});
  $('exportButton').addEventListener('click',exportMarkdown);window.addEventListener('resize',resizeTitle);
  window.addEventListener('beforeunload',event=>{if(unsaved||publishing||uploading){event.preventDefault();event.returnValue='';}});document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')saveDraft();});
}
init().catch(()=>{notice('Editor belum berhasil dimuat. Muat ulang halaman; draft yang sudah tersimpan tetap ada.',true);$('publishButton').disabled=true;});
