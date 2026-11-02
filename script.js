import { escapeHTML as esc, postSlug } from './lib/content.mjs';
const pages=[...document.querySelectorAll('.page')];
const menu=document.getElementById('navMenu');
const menuButton=document.getElementById('menuToggle');
const main=document.getElementById('main');
let posts=[],activeFilter='all',articleRequest=null,lastList='home';
const legacyFiles=['the-best-religion.md','investasi.md','kebiasaan-buruk.md','childfree.md','motion-action.md','memberi-pada-tempatnya.md','khutbah-jumat.md','toleransi.md','israel-palestina.md','sbmptn.md','pro-kontra-ciptaker'];
const date=(value,short=false)=>new Date(`${value}T00:00:00`).toLocaleDateString('id-ID',{day:'numeric',month:short?'short':'long',...(short?{}:{year:'numeric'})});
const category=post=>post.category.toLowerCase().includes('weekly')?'weekly':post.category.toLowerCase().includes('monthly')?'monthly':'personal';
const href=post=>`#artikel/${encodeURIComponent(postSlug(post))}`;
function closeMenu(){menu.classList.remove('open');menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Buka menu');menuButton.innerHTML=RuangUI.icon('menu');}
function showPage(id,focus=true){
 const page=pages.find(p=>p.id===id)||pages[0];
 pages.forEach(p=>p.classList.toggle('active',p===page));
 document.querySelectorAll('.nav-menu a').forEach(a=>{const exact=a.dataset.page===page.id;const selected=exact||a.dataset.page==='archive'&&['weekly','monthly','article'].includes(page.id);a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current',exact?'page':'location');else a.removeAttribute('aria-current');});
 document.querySelectorAll('.section-nav a').forEach(a=>{const selected=a.dataset.page===page.id;a.classList.toggle('active',selected);if(selected)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 closeMenu();
 window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 if(focus)(page.querySelector('h1')||main).focus({preventScroll:true});
 if(page.id!=='article')lastList=page.id;
 document.title=page.id==='home'?'Ruang Tulis':`${page.querySelector('h1')?.textContent||'Tulisan'} — Ruang Tulis`;
}
function empty(message,link=true){return `<div class="empty-state"><strong>Belum ada tulisan di sini.</strong>${esc(message)}${link?'<br><a class="text-link" href="#archive">Jelajahi tulisan lainnya '+RuangUI.icon('arrow')+'</a>':''}</div>`;}
function card(post,featured=false){return `<article class="post-card${featured?' post-featured':''}"><p class="post-meta"><time datetime="${esc(post.date)}">${esc(date(post.date))}</time><span>${esc(post.category)}</span></p><div class="post-copy"><h3><a href="${href(post)}">${esc(post.title)}</a></h3><p>${esc(post.excerpt)}</p></div><a class="read-more" href="${href(post)}" aria-label="Baca ${esc(post.title)}">${RuangUI.icon('arrow')}</a></article>`;}
function renderList(id,list,message,featured=false){const el=document.getElementById(id);el.innerHTML=list.length?list.map((p,i)=>card(p,featured&&i===0)).join(''):empty(message);el.setAttribute('aria-busy','false');}
function renderArchive(){
 const visible=posts.filter(p=>activeFilter==='all'||category(p)===activeFilter);
 const groups=new Map();visible.forEach(p=>{const month=new Date(`${p.date}T00:00:00`).toLocaleDateString('id-ID',{month:'long',year:'numeric'});if(!groups.has(month))groups.set(month,[]);groups.get(month).push(p);});
 document.getElementById('archiveList').innerHTML=visible.length?[...groups].map(([month,list])=>`<div class="archive-group"><h2>${esc(month)}</h2><ul>${list.map(p=>`<li><time datetime="${esc(p.date)}">${esc(date(p.date,true))}</time><a href="${href(p)}">${esc(p.title)}</a><small>${esc(p.category)}</small></li>`).join('')}</ul></div>`).join(''):empty('Coba kategori lain untuk menemukan tulisan.',false);
}
function backLink(){const id=['home','weekly','monthly','archive'].includes(lastList)?lastList:'home';return `<a href="#${id}" class="back-link">${RuangUI.icon('back')} Kembali ke ${id==='home'?'beranda':id==='archive'?'arsip':id==='weekly'?'Weekly Notes':'Monthly Essays'}</a>`;}
function enhanceArticle(el,post){
 const base=new URL(post.file,location.href);
 el.querySelectorAll('img').forEach((img,index)=>{
  const src=img.getAttribute('src');if(src&&!/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(src))img.src=new URL(src,base).href;
  img.loading=index===0?'eager':'lazy';img.decoding='async';
  if(img.title){const figure=document.createElement('figure');const caption=document.createElement('figcaption');caption.textContent=img.title;img.replaceWith(figure);figure.append(img,caption);}
  img.addEventListener('error',()=>{const notice=document.createElement('p');notice.className='broken-image';notice.textContent=`Gambar belum tersedia${img.alt?`: ${img.alt}`:'.'}`;img.replaceWith(notice);},{once:true});
 });
 el.querySelectorAll('a:not(.back-link)').forEach(a=>{const value=a.getAttribute('href');if(value&&!/^(?:[a-z][a-z\d+.-]*:|\/|#)/i.test(value))a.href=new URL(value,base).href;});
 const quotes=el.querySelectorAll('blockquote');const closing=quotes[quotes.length-1];if(closing){closing.classList.add('closing-quote');if(closing.nextElementSibling?.tagName==='HR')closing.nextElementSibling.classList.add('after-closing-quote');}
}
async function loadArticle(post,focus){
 const el=document.getElementById('articleContent');showPage('article',false);el.setAttribute('aria-busy','true');el.innerHTML=backLink()+'<p class="loading-state" role="status"><span class="loading-dot"></span>Menyiapkan tulisan…</p>';
 articleRequest=new AbortController();const request=articleRequest;
 try{
  if(!post)throw new Error('not-found');
  const response=await fetch(post.file,{signal:request.signal});if(!response.ok)throw new Error('not-found');
  const md=(await response.text()).replace(/^\uFEFF?(\s*\r?\n)*#\s+.+(?:\r?\n|$)/,'');
  if(request!==articleRequest)return;
  el.innerHTML=`${backLink()}<p class="eyebrow">${esc(post.category)}</p><h1 tabindex="-1">${esc(post.title)}</h1><p class="article-meta"><time datetime="${esc(post.date)}">${esc(date(post.date))}</time> · Andika Pramudya</p>${RuangRenderer.render(md)}`;
  enhanceArticle(el,post);document.title=`${post.title} — Ruang Tulis`;if(focus)el.querySelector('h1').focus({preventScroll:true});
 }catch(error){if(error.name==='AbortError')return;if(request!==articleRequest)return;el.innerHTML=`${backLink()}<h1 tabindex="-1">Tulisan belum bisa dibuka.</h1><div class="empty-state">Coba muat kembali, atau jelajahi tulisan lainnya.<br><button class="button" data-retry="article">Coba lagi</button></div>`;if(focus)el.querySelector('h1').focus({preventScroll:true});}
 finally{if(request===articleRequest)el.setAttribute('aria-busy','false');}
}
function handleHash(focus=true){
 articleRequest?.abort();let hash;try{hash=decodeURIComponent(location.hash.slice(1));}catch{hash='home';}
 if(hash.startsWith('artikel/')){loadArticle(posts.find(p=>postSlug(p)===hash.slice(8)),focus);return;}
 if(/^article-\d+$/.test(hash)){const post=posts.find(p=>p.file===`posts/${legacyFiles[Number(hash.slice(8))]}`);if(post)history.replaceState(null,'',href(post));loadArticle(post,focus);return;}
 showPage(pages.some(p=>p.id===hash&&p.id!=='article')?hash:'home',focus);
}
async function loadPosts(){
 try{const response=await fetch('posts.json',{cache:'no-cache'});if(!response.ok)throw new Error('network');posts=(await response.json()).sort((a,b)=>new Date(b.date)-new Date(a.date));
 renderList('latestPosts',posts.slice(0,3),'Tulisan baru akan hadir di sini.',true);
 renderList('weeklyPosts',posts.filter(p=>category(p)==='weekly'),'Catatan mingguan akan hadir di sini. Sementara itu, ada esai yang bisa dibaca.');
 renderList('monthlyPosts',posts.filter(p=>category(p)==='monthly'),'Esai berikutnya sedang menunggu waktunya.');renderArchive();handleHash(false);
 }catch{document.querySelectorAll('.post-list,#archiveList').forEach(el=>{el.setAttribute('aria-busy','false');el.innerHTML='<div class="empty-state" role="status"><strong>Daftar tulisan belum bisa dimuat.</strong>Periksa koneksi Anda, lalu coba kembali.<br><button class="button" data-retry="posts">Muat kembali</button></div>';});showPage('home',false);}
}
menuButton.addEventListener('click',()=>{const open=menuButton.getAttribute('aria-expanded')!=='true';menu.classList.toggle('open',open);menuButton.setAttribute('aria-expanded',String(open));menuButton.setAttribute('aria-label',open?'Tutup menu':'Buka menu');menuButton.innerHTML=RuangUI.icon(open?'close':'menu');});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&menu.classList.contains('open')){closeMenu();menuButton.focus();}});
document.addEventListener('click',e=>{if(e.target.closest('.skip-link')){e.preventDefault();main.focus();return;}if(!e.target.closest('.site-header'))closeMenu();const retry=e.target.closest('[data-retry]');if(retry){if(retry.dataset.retry==='posts')loadPosts();else handleHash();}});
document.getElementById('archiveFilter').addEventListener('click',e=>{const button=e.target.closest('[data-filter]');if(!button)return;activeFilter=button.dataset.filter;document.querySelectorAll('.filter-btn').forEach(b=>{b.classList.toggle('active',b===button);b.setAttribute('aria-pressed',String(b===button));});renderArchive();});
pages.forEach(p=>p.querySelector('h1')?.setAttribute('tabindex','-1'));
window.addEventListener('hashchange',()=>handleHash());loadPosts();
