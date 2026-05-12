const pages = document.querySelectorAll(".page");
const navMenu = document.getElementById("navMenu");
const menuToggle = document.getElementById("menuToggle");
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");

let posts = [];
let activeFilter = "all";

function showPage(pageId) {
  const targetPage = document.getElementById(pageId) ? pageId : "home";

  pages.forEach((page) => {
    page.classList.toggle("active", page.id === targetPage);
  });

  document.querySelectorAll(".nav-menu a").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === targetPage);
  });

  navMenu.classList.remove("open");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function setTheme(theme) {
  const isDark = theme === "dark";

  document.body.classList.toggle("dark", isDark);
  themeIcon.textContent = isDark ? "☀" : "☾";
  themeToggle.setAttribute("aria-label", isDark ? "Gunakan tema terang" : "Gunakan tema gelap");
  localStorage.setItem("theme", theme);
}

function sortPosts(postList) {
  return [...postList].sort((a, b) => new Date(b.date) - new Date(a.date));
}

function getCategorySlug(category) {
  const text = category.toLowerCase();

  if (text.includes("weekly")) return "weekly";
  if (text.includes("monthly")) return "monthly";
  return "personal";
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function shortDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short"
  });
}

function renderPostCard(post, index, options = {}) {
  const compactClass = options.compact ? " post-card-compact" : "";

  return `
    <article class="post-card${compactClass}">
      <div>
        <p class="post-meta">${formatDate(post.date)} / ${post.category}</p>
        <h3>
          <a href="#article-${index}" data-post-index="${index}">
            ${post.title}
          </a>
        </h3>
        <p>${post.excerpt}</p>
      </div>
      <a href="#article-${index}" class="read-more" data-post-index="${index}">
        Baca &rarr;
      </a>
    </article>
  `;
}

function renderPostList(elementId, postList, emptyMessage, options = {}) {
  const target = document.getElementById(elementId);

  if (!target) return;

  if (!postList.length) {
    target.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  target.innerHTML = postList
    .map((post) => renderPostCard(post, posts.indexOf(post), options))
    .join("");
}

function renderLatestPosts() {
  renderPostList(
    "latestPosts",
    sortPosts(posts).slice(0, 3),
    "Belum ada tulisan yang bisa ditampilkan.",
    { compact: true }
  );
}

function renderCategoryPosts() {
  const weeklyPosts = sortPosts(posts).filter((post) => getCategorySlug(post.category) === "weekly");
  const monthlyPosts = sortPosts(posts).filter((post) => getCategorySlug(post.category) === "monthly");

  renderPostList("weeklyPosts", weeklyPosts, "Belum ada Weekly Notes di folder posts.");
  renderPostList("monthlyPosts", monthlyPosts, "Belum ada Monthly Essays di folder posts.");
}

function groupPostsByMonth(postList) {
  return postList.reduce((groups, post) => {
    const date = new Date(`${post.date}T00:00:00`);
    const month = date.toLocaleDateString("id-ID", {
      month: "long",
      year: "numeric"
    });

    if (!groups[month]) groups[month] = [];
    groups[month].push(post);
    return groups;
  }, {});
}

function renderArchive() {
  const archiveList = document.getElementById("archiveList");

  if (!archiveList) return;

  const visiblePosts = sortPosts(posts).filter((post) => {
    return activeFilter === "all" || getCategorySlug(post.category) === activeFilter;
  });

  if (!visiblePosts.length) {
    archiveList.innerHTML = "<p class=\"empty-state\">Belum ada tulisan untuk kategori ini.</p>";
    return;
  }

  const groups = groupPostsByMonth(visiblePosts);

  archiveList.innerHTML = Object.entries(groups)
    .map(([month, monthPosts]) => {
      return `
        <div class="archive-group">
          <h2>${month}</h2>
          <ul>
            ${monthPosts
              .map((post) => {
                const index = posts.indexOf(post);

                return `
                  <li>
                    <span>${shortDate(post.date)}</span>
                    <a href="#article-${index}" data-post-index="${index}">${post.title}</a>
                    <small>${post.category}</small>
                  </li>
                `;
              })
              .join("")}
          </ul>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  renderLatestPosts();
  renderCategoryPosts();
  renderArchive();
}

function removeLeadingMarkdownTitle(markdown) {
  return markdown.replace(/^\uFEFF?(\s*\r?\n)*#\s+.+(?:\r?\n|$)/, "");
}

function isAbsoluteOrSpecialUrl(value) {
  return /^(?:[a-z][a-z\d+.-]*:|#|\/)/i.test(value);
}

function resolveArticleAssets(articleContent, postFile) {
  const lastSlash = postFile.lastIndexOf("/");
  const postDirectory = lastSlash >= 0 ? postFile.slice(0, lastSlash + 1) : "";
  const baseUrl = new URL(postDirectory, window.location.href);

  articleContent.querySelectorAll("img").forEach((image) => {
    const source = image.getAttribute("src");

    if (source && !isAbsoluteOrSpecialUrl(source)) {
      image.src = new URL(source, baseUrl).href;
    }
  });

  articleContent.querySelectorAll("a").forEach((link) => {
    const href = link.getAttribute("href");

    if (href && !isAbsoluteOrSpecialUrl(href)) {
      link.href = new URL(href, baseUrl).href;
    }
  });

  const blockquotes = articleContent.querySelectorAll("blockquote");
  const closingQuote = blockquotes[blockquotes.length - 1];

  if (closingQuote) {
    closingQuote.classList.add("closing-quote");

    if (closingQuote.nextElementSibling?.tagName === "HR") {
      closingQuote.nextElementSibling.classList.add("after-closing-quote");
    }
  }
}

async function loadArticle(index) {
  const articleContent = document.getElementById("articleContent");
  const post = posts[index];

  if (!articleContent || !post) return;

  try {
    const response = await fetch(post.file);

    if (!response.ok) {
      throw new Error(`Artikel tidak ditemukan: ${post.file}`);
    }

    const markdown = removeLeadingMarkdownTitle(await response.text());
    const html = marked.parse(markdown);

    articleContent.innerHTML = `
      <a href="#home" class="back-link" data-page="home">&larr; Kembali ke Home</a>
      <p class="eyebrow">${post.category}</p>
      <h1>${post.title}</h1>
      <p class="article-meta">${formatDate(post.date)} / Ruang Tulis</p>
      ${html}
    `;

    resolveArticleAssets(articleContent, post.file);
    showPage("article");
  } catch (error) {
    articleContent.innerHTML = `
      <a href="#home" class="back-link" data-page="home">&larr; Kembali ke Home</a>
      <p class="empty-state">Artikel gagal dimuat. Periksa kembali nama file di posts.json.</p>
    `;
    showPage("article");
    console.error("Gagal memuat artikel:", error);
  }
}

function handleHash() {
  const hash = window.location.hash.replace("#", "");

  if (hash.startsWith("article-")) {
    const index = Number(hash.replace("article-", ""));
    loadArticle(index);
    return;
  }

  showPage(hash || "home");
}

async function loadPosts() {
  try {
    const response = await fetch("posts.json");

    if (!response.ok) {
      throw new Error("posts.json tidak ditemukan");
    }

    posts = sortPosts(await response.json());
    renderAll();
    handleHash();
  } catch (error) {
    document.querySelectorAll(".empty-state").forEach((item) => {
      item.textContent = "Daftar tulisan gagal dimuat.";
    });
    console.error("Gagal memuat posts.json:", error);
  }
}

document.addEventListener("click", (event) => {
  const postLink = event.target.closest("[data-post-index]");
  const pageLink = event.target.closest("[data-page]");

  if (postLink) {
    event.preventDefault();
    const index = Number(postLink.dataset.postIndex);
    history.pushState(null, "", `#article-${index}`);
    loadArticle(index);
    return;
  }

  if (pageLink) {
    event.preventDefault();
    const pageId = pageLink.dataset.page;
    history.pushState(null, "", `#${pageId}`);
    showPage(pageId);
  }
});

document.getElementById("archiveFilter").addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");

  if (!button) return;

  activeFilter = button.dataset.filter;

  document.querySelectorAll(".filter-btn").forEach((filterButton) => {
    filterButton.classList.toggle("active", filterButton === button);
  });

  renderArchive();
});

menuToggle.addEventListener("click", () => {
  navMenu.classList.toggle("open");
});

themeToggle.addEventListener("click", () => {
  const isDark = document.body.classList.contains("dark");
  setTheme(isDark ? "light" : "dark");
});

window.addEventListener("popstate", handleHash);

document.addEventListener("DOMContentLoaded", () => {
  const savedTheme = localStorage.getItem("theme");
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  setTheme(savedTheme || (prefersDark ? "dark" : "light"));
  loadPosts();
});
