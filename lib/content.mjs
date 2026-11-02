export const CATEGORIES = ['Weekly Note', 'Monthly Essay', 'Personal'];

export function slugify(text) {
  return String(text).normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90).replace(/-$/, '');
}

export function postSlug(post) {
  return post.slug || post.file.split('/').pop().replace(/\.md$/i, '');
}

export function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export function validPostPath(value) {
  return typeof value === 'string' && /^posts\/[a-z0-9][a-z0-9-]*(?:\.md)?$/.test(value);
}

export function validatePost(input) {
  const title = String(input.title || '').trim();
  const slug = String(input.slug || '');
  const date = String(input.date || '');
  if (!title || title.length > 180) throw new Error('Judul wajib diisi, maksimal 180 karakter.');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 90) throw new Error('Alamat tulisan tidak valid.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date) throw new Error('Tanggal tulisan tidak valid.');
  if (!CATEGORIES.includes(input.category)) throw new Error('Kategori tulisan tidak valid.');
  const markdown = String(input.markdown || '').trim();
  if (!markdown || markdown.length > 300000) throw new Error('Isi tulisan wajib diisi, maksimal 300.000 karakter.');
  const excerpt = String(input.excerpt || '').trim();
  if (excerpt.length > 400) throw new Error('Ringkasan maksimal 400 karakter.');
  if (input.file && !validPostPath(input.file)) throw new Error('Lokasi tulisan tidak valid.');
  return {title, slug, date, category:input.category, excerpt, markdown, file:input.file || `posts/${slug}.md`};
}
