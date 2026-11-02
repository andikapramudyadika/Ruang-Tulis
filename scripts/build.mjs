import { build } from 'esbuild';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
await mkdir('assets', {recursive:true});
await build({entryPoints:['src/editor.mjs'],outfile:'assets/editor.js',bundle:true,format:'esm',minify:true,target:['es2022'],legalComments:'linked'});
await build({entryPoints:['src/renderer.mjs'],outfile:'assets/renderer.js',bundle:true,format:'iife',globalName:'RuangRenderer',minify:true,target:['es2022'],legalComments:'linked'});
await build({entryPoints:['publisher/worker.mjs'],outfile:'publisher/worker.bundle.mjs',bundle:true,format:'esm',target:['es2022'],legalComments:'linked'});
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const notices = await Promise.all(Object.entries(lock.packages).filter(([folder,pkg])=>folder&&!pkg.dev).sort(([a],[b])=>a.localeCompare(b)).map(async ([folder])=>{
  const pkg=JSON.parse(await readFile(`${folder}/package.json`,'utf8'));
  const licenseFiles=(await readdir(folder)).filter(name=>/^licen[sc]e(?:[.\-_].*)?$/i.test(name));
  const licenses=await Promise.all(licenseFiles.map(async file=>`${file}\n${await readFile(`${folder}/${file}`,'utf8')}`));
  return `${pkg.name} ${pkg.version} — ${pkg.license||'see package license'}\n${pkg.homepage||''}\n${licenses.join('\n\n')}`;
}));
await writeFile('assets/THIRD-PARTY.txt', notices.join('\n\n')+'\n');
console.log('Browser assets built. GitHub Pages serves these files directly; no build needed to publish an article.');
