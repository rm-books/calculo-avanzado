// Wraps the tex4ht pages in a template with sidebar, TOC and a link to the PDF,
// numbers equations like LaTeX and renders formulas with MathJax.
// Usage: node web/postprocess.js .work-html public calculo-avanzado.pdf build/main.aux
import { copyFileSync, cpSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRenderer, readMacros, FONTS_DIR } from "./mathjax.js";
import * as crossrefs from "./crossrefs.js";
import { unescapeHtml, escapeHtml } from "./crossrefs.js";

const [src, dst, pdf, aux] = process.argv.slice(2);
const TITLE = "Cálculo avanzado";

const toc = readFileSync(join(src, "mainli1.html"), "utf8");
const entries = [...toc.matchAll(
  /<span class='(chapterToc|sectionToc)'>([\d.]*) <a href='([^']+)'>([\s\S]*?)<\/a><\/span>/g)]
  .map(([, cls, num, href, t]) => ({ cls, num, href, t, page: href.split("#")[0] }));
// pages in reading order (without anchor)
const order = [...new Set(entries.map((e) => e.page))];
const titles = {}, chapterOf = {};
for (const { num, page, t } of entries) {
  titles[page] ??= `${num} ${t.replace(/<[^>]+>/g, "")}`.trim();
  if (num) chapterOf[page] ??= num.split(".")[0];
}

const numHtml = (num) => (num ? `<span class='num'>${num}</span> ` : "");

function sidebar(current) {
  const items = entries.map(({ cls, num, href, t, page }) => {
    const level = cls === "chapterToc" ? "chap" : "sec";
    const act = page === current ? " active" : "";
    return `<li class='${level}${act}'><a href='${href}'>${numHtml(num)}${t}</a></li>`;
  });
  return ["<ul>", ...items, "</ul>"].join("\n");
}

// Family of each environment, from the prefix of the id tex4ht generates. The
// prefix comes from the printed (Spanish) heading, e.g. «Definición 1.1» →
// definicion11. Lemmas, corollaries and propositions share the "theorem" family.
const FAMILIES = { definicion: "definition", ejemplo: "example", observacion: "remark", demostracion: "proof" };

function classifyEnvs(c) {
  return c.replace(/<div class='newtheorem'>(\s*(?:<!--[^>]*-->)?\s*)<p class='(\w+)' id='([a-z]+)/g,
    (_, space, cls, id) => `<div class='newtheorem thm-${FAMILIES[id.match(/^[a-z]+/)[0]] ?? "theorem"}'>`
      + `${space}<p class='${cls}' id='${id}`);
}

/** Adds the end-of-proof box (tex4ht doesn't translate \theoremsymbol). */
function markQed(c) {
  return c.replace(/(<div class='newtheorem thm-proof'>(?:(?!<div class='newtheorem)[\s\S])*?)(<\/p>\s*<\/div>)/g,
    (_, a, b) => a + "<span class='qed' aria-hidden='true'>■</span>" + b);
}

/** biblatex writes 3.ª as «3.» + a small a; replace it with the real character. */
function ordinals(c) {
  return c.replace(/(\d\.)<span class='ec-lmr-8'>([ao])<\/span>/g, (_, n, l) => n + { a: "ª", o: "º" }[l]);
}

function body(text) {
  const c = text.match(/<body[^>]*>([\s\S]*)<\/body>/)[1].replace(/<div class='crosslinks'>[\s\S]*?<\/div>/g, "");
  return ordinals(markQed(classifyEnvs(c)));
}

function pageToc(c) {
  const out = [...c.matchAll(/<h([2-5]) class='(?:\w+Head)' id='([^']+)'>([\s\S]*?)<\/h\1>/g)].map(([, n, i, t]) => {
    t = unescapeHtml(t.replace(/<a id=[^>]*><\/a>|<[^>]+>/g, "").replace(/\s+/g, " ")).trim();
    return `<li class='n${n}'><a href='#${i}'>${escapeHtml(t)}</a></li>`;
  });
  return out.length > 1 ? "<ul>" + out.join("\n") + "</ul>" : "";
}

function aside(c) {
  const t = pageToc(c);
  return t ? `<aside class="toc"><h4>En esta página</h4>${t}</aside>` : "";
}

// ------------------------------------------------------------ formulas
const mj = createRenderer({ macros: readMacros(new URL("../macros.tex", import.meta.url).pathname) });
const mjErrors = new Set(); // the error also shows up in the accessible MathML
const rendered = new Map();

function checkMj(html, where) {
  for (const m of html.matchAll(/data-mjx-error="([^"]*)"/g)) mjErrors.add(`${where}: ${m[1]}`);
  return html;
}

/** The page's previews with their formulas already rendered. */
function renderedPreviews(name) {
  const v = name in bodies ? crossrefs.pagePreviews(name, bodies) : {};
  for (const k in v) {
    if (!rendered.has(v[k])) rendered.set(v[k], checkMj(mj.fragment(v[k]), `${name} (preview ${k})`));
    v[k] = rendered.get(v[k]);
  }
  return v;
}

function template(name, c, pageTitle) {
  const i = order.indexOf(name);
  const link = (p, rel, text) => `<a rel='${rel}' href='${p}'>${text}</a>`;
  const prev = i > 0 ? link(order[i - 1], "prev", `← ${escapeHtml(titles[order[i - 1]])}`) : "<span></span>";
  let next = i >= 0 && i < order.length - 1 ? link(order[i + 1], "next", `${escapeHtml(titles[order[i + 1]])} →`) : "<span></span>";
  const cover = name === "index.html";
  if (cover && order.length) next = link(order[0], "next", `${escapeHtml(titles[order[0]])} →`);
  const data = JSON.stringify(renderedPreviews(name)).replaceAll("</", "<\\/");
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(pageTitle)} · ${TITLE}</title>
<link rel="stylesheet" href="https://ka-f.webawesome.com/webawesome@3.14.0/styles/themes/default.css">
<link rel="stylesheet" href="style.css">
<script type="module" src="https://ka-f.webawesome.com/webawesome@3.14.0/components/drawer/drawer.js"></script>
<script>try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}</script>
<link rel="stylesheet" href="mathjax/mathjax.css">
<script defer src="site.js"></script>
</head><body${cover ? " class='cover'" : ""}>
<header class="site-header">
  <button id="menu" aria-label="Índice">☰</button>
  <a class="title" href="index.html">${TITLE}</a>
  <span class="actions"><a href="${pdf}">PDF</a><button id="theme" aria-label="Cambiar tema">◐</button></span>
</header>
<div class="layout">
  ${cover ? "" : `<nav class="sidebar nav" id="sidebar">${sidebar(name)}</nav>`}
  <main><article>${c}</article>
    <nav class="pagination">${prev}${next}</nav></main>
  ${aside(c)}
</div>
${cover ? "" : `<wa-drawer id="drawer" label="${TITLE}" placement="start" light-dismiss><nav class="nav">${sidebar(name)}</nav></wa-drawer>`}
<div id="preview" role="tooltip" hidden></div>
<script type="application/json" id="previews">${data}</script>
</body></html>`;
}

function write(name, html) {
  writeFileSync(join(dst, name), checkMj(mj.page(html), name));
}

// ------------------------------------------------------------ build
mkdirSync(dst, { recursive: true });
const pages = readdirSync(src).filter((f) => /^main.*\.html$/.test(f) && !["main.html", "mainli1.html"].includes(f));
const raw = Object.fromEntries(pages.map((f) => [f, readFileSync(join(src, f), "utf8")]));
const bodies = Object.fromEntries(pages.map((f) => [f, body(raw[f])]));

const labels = crossrefs.numberEquations(bodies, order, chapterOf);
const errors = crossrefs.check(labels, crossrefs.readAux(aux));
if (errors.length) {
  console.error(["ERROR: HTML equation numbering doesn't match LaTeX:", ...errors].join("\n  "));
  process.exit(1);
}
crossrefs.rewriteRefs(bodies, labels);

for (const [name, t] of Object.entries(raw)) {
  const m = t.match(/<h\d class='\w+Head'[^>]*>([\s\S]*?)<\/h\d>/);
  const title = m ? m[1].replace(/<[^>]+>|\s+/g, " ").trim().replace(/\s+/g, " ") : name;
  write(name, template(name, bodies[name], unescapeHtml(title)));
}
for (const f of readdirSync(src).filter((f) => f.endsWith(".svg"))) copyFileSync(join(src, f), join(dst, f));

// Cover: same template as the rest, with the full table of contents as content
const cover = `<h2 class='cover-title'>${TITLE}</h2>
<h3 class='sectionHead'>Índice general</h3>
<nav class='nav nav-full'>${sidebar(null)}</nav>`;
write("index.html", template("index.html", cover, "Índice general"));

if (mjErrors.size) {
  console.error(["ERROR: formulas MathJax couldn't process:", ...mjErrors].join("\n  "));
  process.exit(1);
}
mkdirSync(join(dst, "mathjax"), { recursive: true });
writeFileSync(join(dst, "mathjax", "mathjax.css"), mj.css());
cpSync(FONTS_DIR, join(dst, "mathjax", "woff-v2"), { recursive: true });
