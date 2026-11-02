(() => {
  const icons = {
    sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon:'<path d="M20.8 13.1A9 9 0 0 1 10.9 3.2 9 9 0 1 0 20.8 13.1Z"/>',
    menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
    close:'<path d="m6 6 12 12M6 18 18 6"/>',
    pen:'<path d="m15 4 5 5M4 20l5-1L20 8a2.1 2.1 0 0 0-4-4L5 15l-1 5Z"/>',
    arrow:'<path d="M5 12h14m-6-6 6 6-6 6"/>',
    back:'<path d="M19 12H5m6-6-6 6 6 6"/>',
    image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5-7 8-3-3-3 3"/>',
    plus:'<path d="M12 5v14M5 12h14"/>',
    check:'<path d="m5 12 4 4L19 6"/>',
    book:'<path d="M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v15"/>'
  };
  window.RuangUI = {
    icon(name) { return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.pen}</svg>`; },
    storage: {
      get(key) { try { return localStorage.getItem(key); } catch { return null; } },
      set(key,value) { try { localStorage.setItem(key,value); } catch {} }
    },
    setTheme(theme) {
      document.documentElement.dataset.theme=theme;
      document.body.classList.toggle('dark', theme==='dark');
      const button=document.getElementById('themeToggle');
      if(button) { button.innerHTML=this.icon(theme==='dark'?'sun':'moon'); button.setAttribute('aria-label',theme==='dark'?'Gunakan tema terang':'Gunakan tema gelap'); }
      this.storage.set('theme',theme);
    }
  };
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=RuangUI.icon(el.dataset.icon));
  RuangUI.setTheme(RuangUI.storage.get('theme') || (matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
  document.getElementById('themeToggle')?.addEventListener('click',()=>RuangUI.setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
})();
