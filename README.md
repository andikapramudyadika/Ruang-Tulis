# Ruang Tulis

Blog pribadi statis untuk GitHub Pages, dengan editor rich text dan layanan
penerbitan GitHub terpisah. Isi tetap disimpan sebagai Markdown, metadata di
`posts.json`, dan gambar di `images/`.

- Pembaca: `index.html`
- Editor: `tulis.html`
- Pengaturan publik: `site.config.js`
- Aktivasi penerbitan: [Panduan](docs/AKTIVASI-EDITOR.md)
- Design tokens dan prinsip: [DESIGN.md](DESIGN.md)

```sh
npm ci
npm run build
npm test
npm run dev
```

Frontend hasil build disertakan agar Pages tetap dapat menjalankan situs statis.
Build diperlukan setelah mengubah `src/`, bukan setiap kali menerbitkan tulisan.
Tiptap menangani rich text/undo/paste; Turndown mengubahnya ke Markdown; Marked
dan DOMPurify merender konten secara aman. Esbuild hanya alat pengembangan.
Dependency dan lisensinya dicatat di `assets/THIRD-PARTY.txt`.

Layanan Cloudflare belum aktif sampai pemilik mengonfigurasi OAuth, KV, dan
secrets. Tanpa konfigurasi, editor menyimpan draft lokal dan menampilkan panduan;
tombol Terbitkan tidak berpura-pura telah menerbitkan tulisan.
