// Apply the saved theme before the first paint. Storage may be unavailable.
try {
  document.documentElement.dataset.theme = localStorage.getItem('theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
} catch { document.documentElement.dataset.theme = 'light'; }
