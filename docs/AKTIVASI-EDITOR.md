# Aktivasi penerbitan Ruang Tulis

Editor dan draft lokal berfungsi tanpa akun Cloudflare. Langkah berikut diperlukan
satu kali agar tombol Terbitkan benar-benar menyimpan artikel ke GitHub Pages.
Kode ini belum mengaktifkan akun, OAuth App, atau Worker atas nama Anda.

Blog tetap di GitHub Pages. Worker hanya menangani login GitHub dan penerbitan.
Repository: `andikapramudyadika/Ruang-Tulis`, branch `main`, folder situs `/`.
Jika pengaturan Pages Anda menggunakan branch/folder lain, samakan konfigurasi
Worker dan `site.config.js` sebelum mengaktifkan penerbitan.

## 1. Buat Worker di Cloudflare

1. Buat atau masuk ke akun Cloudflare: https://dash.cloudflare.com/.
2. Di Workers & Pages, buat Worker bernama `ruang-tulis-publisher`.
3. Buka Edit code. Ganti contoh kode dengan seluruh isi
   `publisher/worker.bundle.mjs` yang sudah disediakan. Pilih Deploy.
4. Salin alamat HTTPS Worker, misalnya
   `https://ruang-tulis-publisher.NAMA-AKUN.workers.dev`.

Tidak memerlukan domain sendiri. Endpoint akan menolak penerbitan selama
konfigurasi belum lengkap.

## 2. Tambahkan penyimpanan sesi

1. Di Storage & Databases → KV, buat namespace bernama `ruang-tulis-sessions`.
2. Buka Worker → Bindings → Add binding → KV namespace.
3. Variable name: `SESSIONS`. Pilih namespace tadi, lalu simpan/deploy.

Sesi disimpan terenkripsi dan kedaluwarsa maksimal delapan jam. Draft artikel
disimpan di IndexedDB browser perangkat Anda, bukan di namespace ini.

## 3. Daftarkan login GitHub

Buka https://github.com/settings/applications/new menggunakan akun pemilik.

- Application name: `Ruang Tulis Editor`
- Homepage URL: `https://andikapramudyadika.github.io/Ruang-Tulis/`
- Authorization callback URL: `ALAMAT-WORKER/auth/callback`

Contoh callback:
`https://ruang-tulis-publisher.NAMA-AKUN.workers.dev/auth/callback`.
Jangan menggunakan alamat GitHub Pages sebagai callback.

Setelah aplikasi dibuat, salin Client ID dan buat Client Secret. Masukkan keduanya
langsung ke Cloudflare pada langkah berikut. Jangan menaruh secret di repository,
`site.config.js`, chat, atau screenshot.

## 4. Konfigurasikan Worker

Buka Worker → Settings → Variables and Secrets. Tambahkan:

| Nama | Tipe | Nilai |
| --- | --- | --- |
| `SITE_URL` | Text | `https://andikapramudyadika.github.io/Ruang-Tulis/` |
| `GITHUB_REPOSITORY` | Text | `andikapramudyadika/Ruang-Tulis` |
| `GITHUB_BRANCH` | Text | `main` |
| `ALLOWED_GITHUB_ID` | Text | `124312344` |
| `GITHUB_CLIENT_ID` | Secret | Client ID dari GitHub |
| `GITHUB_CLIENT_SECRET` | Secret | Client Secret dari GitHub |
| `SESSION_SECRET` | Secret | String acak 32 karakter atau lebih |

Buat SESSION_SECRET dengan generator password acak, minimal 32 karakter.
Nilainya berbeda dari Client Secret. Simpan/deploy perubahan.

Buka `ALAMAT-WORKER/health`. Hasil yang benar:
`{"configured":true}`. Nilai false berarti ada binding/variabel yang belum lengkap.

OAuth meminta scope `public_repo`; server membatasi seluruh operasi ke repository
yang ditentukan di atas dan hanya menerima ID akun pemilik. Token GitHub tidak
pernah dikirim ke editor. Browser menerima ID sesi sementara saja.

## 5. Hubungkan editor

Di `site.config.js`, isi `publisherUrl` dengan alamat Worker (tanpa `/` terakhir):

```js
publisherUrl: 'https://ruang-tulis-publisher.NAMA-AKUN.workers.dev'
```

Simpan perubahan tersebut ke branch yang dipakai GitHub Pages. Pastikan seluruh
file frontend baru sudah ikut diterbitkan. Setelah Pages selesai memperbarui:

1. Buka `https://andikapramudyadika.github.io/Ruang-Tulis/tulis.html`.
2. Klik Hubungkan GitHub dan selesaikan otorisasi di jendela GitHub.
3. Tulis artikel, tambahkan gambar, lalu klik Terbitkan.
4. Editor menampilkan status commit GitHub, kemudian memeriksa apakah artikel
   sudah muncul di GitHub Pages. Pembaruan Pages tidak selalu seketika.

Login dari preview localhost sengaja ditolak oleh konfigurasi produksi. Uji login
produksi dari alamat GitHub Pages. Untuk pengembangan, gunakan OAuth App dan Worker
terpisah dengan `SITE_URL` localhost; jangan mengubah origin produksi untuk tes.

## Pemakaian sehari-hari

- Draft tersimpan otomatis di perangkat dan browser yang sama. Draft belum
  tersinkron antarpiranti. Simpan salinan Markdown bila perlu cadangan.
- Tombol buku di header membuka draft dan tulisan yang sudah terbit.
- Gambar baru diperkecil hingga sisi terpanjang 1600px dan dikonversi ke WebP.
  GIF menjadi gambar diam. Maksimal 12 gambar baru, 2 MB per gambar, 8 MB total
  gambar per penerbitan. Server memvalidasi format file.
- Klik gambar untuk mengubah deskripsi dan caption. Deskripsi membantu pembaca layar.
- Kategori dan tanggal ada di Detail tulisan. Ringkasan diambil dari paragraf
  pertama jika dikosongkan. Slug dapat diubah sebelum penerbitan pertama.
- Perbarui mempertahankan alamat tulisan. Jika versi GitHub telah berubah dari
  perangkat lain, sistem menolak penimpaan dan mempertahankan draft lokal.
- Jika koneksi terputus, coba lagi tanpa mengubah isi. Identitas penerbitan membuat
  percobaan ulang tidak membuat artikel ganda.
- Tulisan, gambar baru, dan posts.json ditulis dalam satu commit. GitHub Pages
  menggunakan commit ini untuk memperbarui situs melalui pengaturan Pages yang ada.
- Tombol Putuskan sesi menghapus sesi server; draft lokal tetap ada.

## Pengembangan

```sh
npm ci
npm run build
npm test
npm run dev
```

File `assets/editor.js`, `assets/renderer.js`, notice lisensi, dan
`publisher/worker.bundle.mjs` sudah disediakan. Situs publik tidak perlu menjalankan
build untuk setiap tulisan baru. Dependency editor hanya dimuat di halaman tulis;
halaman pembaca memuat parser Markdown dan sanitizer lokal.

Alternatif deployment Worker melalui CLI:

```sh
npx wrangler login
npx wrangler kv namespace create SESSIONS
# Isi ID namespace pada publisher/wrangler.toml.
npx wrangler deploy --config publisher/wrangler.toml
npx wrangler secret put GITHUB_CLIENT_ID --config publisher/wrangler.toml
npx wrangler secret put GITHUB_CLIENT_SECRET --config publisher/wrangler.toml
npx wrangler secret put SESSION_SECRET --config publisher/wrangler.toml
```

Jangan mengunggah `node_modules`, `.env`, `.dev.vars`, atau `.wrangler` ke Pages.
Jika menggunakan deployment Actions khusus, arahkan artifact ke file frontend
yang diperlukan; kode Worker tidak perlu dimasukkan ke artifact Pages.

## Referensi

- GitHub OAuth dan PKCE: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- Cloudflare secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Git references: https://docs.github.com/en/rest/git/refs

## Catatan konten lama

`posts/toleransi.md` merujuk `images/toleransi-5.jpg` yang tidak ada di proyek awal.
Redesign memberi pesan pengganti saat gambar gagal dimuat. Gambar dan isi asli
tidak diganti atau dihapus. Tautan lama `#article-0` hingga `#article-10` tetap
dipetakan ke artikel aslinya; tautan baru memakai `#artikel/slug`.
