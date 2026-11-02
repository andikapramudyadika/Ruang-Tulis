# Ruang Tulis

An Indonesian personal journal. Calm, readable, warm, and precise. The existing
voice “Catatan pribadi, ditulis pelan.” remains the identity of the site.

Inspired by Open Design's Notion reference for warm neutral structure, and Apple
for alignment, restrained depth, and feedback. This adapts those principles to
long-form writing rather than reproducing a product marketing page.

`style.css :root` is the source of truth for shared semantic tokens. Dark theme
overrides live in `[data-theme="dark"]`. `editor.css` uses the same tokens.

- Primary text #31302e; secondary #615d59; page #fff; surface #f6f5f4.
- Dark page #171717; surface #211f1c; text #f4f1ea; secondary #b2aca4.
- Blue is reserved for links, focus, and selected actions. Focus is 2px, offset 4px.
- Spacing: 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64px.
- Radius: 6px controls, 10px panels, 14px dialogs. Shadows only on raised UI.
- Typography: existing system stack; 400 reading, 500 controls, 600 headings.
- Reading column 720px; list 800px; header/footer 1080px; fluid mobile gutters.
- Minimum control height 44px; text links in paragraphs retain normal inline flow.
- Navigation and state feedback use 150–200ms; reduced motion disables animation
  and smooth scrolling. Never animate the article body during typing.
- Outline icons use currentColor and consistent 1.7px strokes.

The first of three latest posts is featured using the surface token. Other posts
are editorial rows. No decorative gradients, stock images, giant icons, or panels
inside panels. Article images retain their full aspect ratio and include captions
when a Markdown image title is provided.

Primary navigation has three destinations: Beranda, Tulisan, Tentang. Weekly and
Monthly remain available inside the writing section and footer, with all original
routes preserved. Avoid repeated intro labels and author signatures above the
fold. The editor shows only bold, italic, section heading, link, image and a more
button; advanced formatting remains in a small dialog. Unavailable published
articles are not shown as a long disabled list before login.

Draft status must say where data lives: “Tersimpan di perangkat ini”. A GitHub
commit is not proof of a live Pages deployment; report those states separately.
