// Equation numbering and cross-reference previews.
//
// HTML pages are split by section, so MathJax can't number equations on its
// own with LaTeX's numbering (chapter.n). Here each row is numbered the way
// LaTeX does it (including \tag and subequations) and the number is written as
// an explicit \tag in the TeX that MathJax receives. The result is checked
// against the PDF's .aux: if it doesn't match, the build fails.
import { readFileSync } from "node:fs";

const NUMBERED_ENVS = ["equation", "align", "alignat", "flalign", "gather", "multline"];
// tex4ht wraps display math in a <div> (older versions) or a <span> (newer ones)
const MATH_ENV = /<(div|span) class='mathjax-env mathjax-(\w+)'>([\s\S]*?)<\/\1>/g;
const LABEL = /\\label\s*\{([^}]*)\}/g;
const TAG = /\\tag\s*(\*?)\s*\{([^}]*)\}/;

// ------------------------------------------------------------- utilities
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decodes the entities tex4ht writes (numeric and the basic named ones). */
export function unescapeHtml(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (e, c) =>
    c[0] !== "#" ? ENTITIES[c] ?? e
      : String.fromCodePoint(c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : Number(c.slice(1))));
}

/** Escapes text for HTML; with `quotes`, also for attributes. */
export function escapeHtml(s, quotes = true) {
  s = s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return quotes ? s.replaceAll('"', "&quot;").replaceAll("'", "&#x27;") : s;
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function plainText(h) {
  return unescapeHtml(h.replace(/<!--[\s\S]*?-->/g, "").replace(/<[^>]+>/g, "")).trim();
}

// ---------------------------------------------------------------- numbering
/** [[row, separator]] splitting only at top-level \\ (not those of nested
 *  aligned, cases, matrices...). */
function splitRows(body) {
  const rows = [];
  let depth = 0, start = 0, i = 0;
  while (i < body.length) {
    if (body.startsWith("\\\\", i)) {
      if (depth === 0) {
        const sep = body.slice(i).match(/^\\\\\*?(?:\s*\[[^\]]*\])?/)[0];
        rows.push([body.slice(start, i), sep]);
        start = i = i + sep.length;
        continue;
      }
      i += 2;
    } else if (body.startsWith("\\begin", i)) {
      depth++; i += 6;
    } else if (body.startsWith("\\end", i)) {
      depth--; i += 4;
    } else if (body[i] === "\\") {
      i += 2; // \{ \} and the like
    } else {
      depth += body[i] === "{" ? 1 : body[i] === "}" ? -1 : 0;
      i++;
    }
  }
  rows.push([body.slice(start), ""]);
  return rows;
}

/** Position of the last \end{...} (tex4ht writes «\end {align}» with a space). */
function envEnd(tex) {
  return [...tex.matchAll(/\\end\s*\{/g)].at(-1).index;
}

/** Puts \tag{n} on each numbered row and switches the environment to its
 *  starred version, so MathJax doesn't number on its own. The \labels stay on
 *  their rows: MathJax gives them an id (rowId) that anchors the references.
 *  Returns [tex, {label: n}]. */
function numberEnv(tex, next) {
  const m = tex.match(/^\s*\\begin\s*\{(\w+)\}((?:\s*\{\d+\})?)/);
  const [, name, arg] = m;
  const body = tex.slice(m[0].length, envEnd(tex));
  const rows = ["equation", "multline"].includes(name) ? [[body, ""]] : splitRows(body);
  const labels = {}, out = [];
  for (let [row, sep] of rows) {
    const lbls = [...row.matchAll(LABEL)].map((e) => e[1]);
    row = row.replace(LABEL, "");
    const t = row.match(TAG);
    let num = null;
    if (t) num = t[2];
    else if (!/\\(notag|nonumber)\b/.test(row) && row.trim()) { // LaTeX doesn't number an empty last row
      num = next();
      row = row.trimEnd() + ` \\tag{${num}}`;
    }
    if (num) {
      for (const l of lbls) labels[l] = num;
      row += lbls.map((l) => `\\label{${l}}`).join("");
    }
    out.push(row + sep);
  }
  return [`\\begin{${name}*}${arg}${out.join("")}\\end{${name}*}`, labels];
}

/** Numbers one environment on the page. Returns [tex, {label: number}, count]. */
function numberTex(tex, chap, count) {
  const m = tex.match(/^\s*\\begin\s*\{(\w+)\}/);
  if (!m || ![...NUMBERED_ENVS, "subequations"].includes(m[1])) return [tex, {}, count];
  const next = () => `${chap}.${++count}`;
  if (m[1] !== "subequations") return [...numberEnv(tex, next), count];
  // subequations: one number for the group and letters for its rows (3.4a, 3.4b...)
  const parent = next();
  const body = tex.slice(m[0].length, envEnd(tex));
  const inner = body.search(/\\begin\s*\{/);
  const labels = {};
  for (const e of body.slice(0, inner).matchAll(LABEL)) labels[e[1]] = parent;
  let letter = 0;
  const [numbered, lbls] = numberEnv(body.slice(inner).trim(),
    () => parent + String.fromCharCode(97 + letter++));
  return [numbered, { ...labels, ...lbls }, count];
}

/** Writes the numbers into each page's equations and returns {label: number}. */
export function numberEquations(bodies, order, chapterOf) {
  const labels = {}, count = {};
  for (const name of order) {
    const chap = chapterOf[name];
    if (chap === undefined || !(name in bodies)) continue;
    bodies[name] = bodies[name].replace(MATH_ENV, (_, tag, env, content) => {
      let tex, lbls;
      [tex, lbls, count[chap]] = numberTex(unescapeHtml(content), chap, count[chap] ?? 0);
      Object.assign(labels, lbls);
      return `<${tag} class='mathjax-env mathjax-${env}'>${escapeHtml(tex, false)}</${tag}>`;
    });
  }
  return labels;
}

/** Content of the {...} group starting at t[i]. */
function group(t, i) {
  let depth = 0;
  for (let j = i; j < t.length; j++) {
    depth += t[j] === "{" ? 1 : t[j] === "}" ? -1 : 0;
    if (depth === 0) return t.slice(i + 1, j);
  }
  return t.slice(i + 1);
}

/** {label: number} from LaTeX's .aux (the PDF's source of truth). */
export function readAux(path) {
  const text = readFileSync(path, "utf8");
  const aux = {};
  for (const m of text.matchAll(/\\newlabel\{([^}]*)\}(?=\{)/g)) {
    const num = group(group(text, m.index + m[0].length), 0); // {{3.1}{page}...}: the first group is the number
    aux[m[1]] = num.startsWith("{") ? group(num, 0) : num; // \tag{T} is written {T}
  }
  return aux;
}

/** Compares our equation numbering with the PDF's. */
export function check(labels, aux) {
  return Object.entries(labels)
    .filter(([l, num]) => l in aux && aux[l] !== num)
    .map(([l, num]) => `\\label{${l}}: LaTeX says ${aux[l]} and the HTML computes ${num}`);
}

/** Id MathJax gives the row with \label{l} (on its number cell). */
const rowId = (l) => "mjx-eqn:" + l.replace(/\s/g, "_");

/** {row id: environment content} for the labeled rows of a page. */
function labeledRows(c) {
  const out = {};
  for (const [, , , content] of c.matchAll(MATH_ENV))
    for (const [, l] of unescapeHtml(content).matchAll(LABEL)) out[rowId(l)] = content;
  return out;
}

/** tex4ht links all labels of an environment to one shared anchor and writes
 *  one number per environment: each reference is made to point at its row and
 *  show its number. */
export function rewriteRefs(bodies, labels) {
  const rows = Object.fromEntries(Object.entries(bodies).map(([n, c]) => [n, labeledRows(c)]));
  for (const name in bodies) {
    bodies[name] = bodies[name].replace(
      /<a href='([^'#]*)(#[^']*)?'>((?:(?!<\/a>|<a )[\s\S])*?)(?=<!-- tex4ht:ref: (\S+)\s*-->)/g,
      (all, page, anchor, _, l) => {
        if (!(l in labels)) return all;
        if (rowId(l) in (rows[page || name] ?? {})) anchor = "#" + rowId(l);
        return `<a href='${page}${anchor ?? ""}'>${labels[l]}`;
      });
  }
}

// ------------------------------------------------------------- previews
/** Index right after the closing tag that balances the opening at `start`. */
function closing(t, start, tag = "div") {
  let depth = 0;
  for (const m of t.slice(start).matchAll(new RegExp(`<${tag}\\b|</${tag}>`, "g"))) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return start + m.index + m[0].length;
  }
  return -1;
}

/** Strips ids, anchors and links, to avoid duplicate ids and nested links. */
function clean(h) {
  return h.replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<a [^>]*id='[^']*'[^>]*>\s*<\/a>/g, "")
    .replace(/<a [^>]*>([\s\S]*?)<\/a>/g, "$1")
    .replace(/\s+id='[^']*'/g, "")
    .trim();
}

/** For the popup: environment without numbers or labels (the number goes in the title). */
function unnumbered(env) {
  env = unescapeHtml(env).replace(LABEL, "").replace(new RegExp(TAG.source, "g"), "");
  env = env.replace(new RegExp(`\\\\(begin|end)\\s*\\{(${NUMBERED_ENVS.join("|")})\\}`, "g"), "\\$1{$2*}");
  return escapeHtml(env, false);
}

/** Preview of an equation: the environment without numbers, with the referenced one in the title. */
function equationPreview(linkText, content) {
  const num = /^\(.*\)$/.test(linkText) ? linkText : `(${linkText})`; // \tag*{(…)} already has them
  return `<div class='pv-label'>Ecuación ${escapeHtml(num)}</div>`
    + `<div class='mathjax-env'>${unnumbered(content)}</div>`;
}

function fragment(t, id, linkText) {
  // 0. equation row (MathJax sets the id when rendering)
  if (id.startsWith("mjx-eqn:")) {
    const content = labeledRows(t)[id];
    return content ? equationPreview(linkText, content) : null;
  }
  const pos = t.search(new RegExp(`id='${escapeRe(id)}'`));
  if (pos < 0) return null;
  // 1. equation: empty anchor right after the math block
  const anchorStart = t.lastIndexOf("<a ", pos);
  const before = t.slice(0, anchorStart).replace(/(?:\s|<p[^>]*>|<!--[\s\S]*?-->)*$/, ""); // sometimes the anchor is inside a <p>
  const tag = before.match(/<\/(div|span)>$/)?.[1];
  if (tag) {
    const j = before.lastIndexOf(`<${tag} class='mathjax-env`);
    if (j >= 0 && closing(before, j, tag) === before.length) {
      const env = new RegExp(MATH_ENV.source, "y");
      env.lastIndex = j;
      return equationPreview(linkText, env.exec(before)[3]);
    }
  }
  // 2. theorem-like environment
  let i = t.lastIndexOf("<div class='newtheorem", pos);
  if (i >= 0) {
    const end = closing(t, i);
    if (end > pos) return clean(t.slice(i, end));
  }
  // 3. figure
  i = t.lastIndexOf("<figure", pos);
  if (i >= 0) {
    const end = t.indexOf("</figure>", i);
    if (end > pos) return clean(t.slice(i, end + "</figure>".length));
  }
  // 4. bibliography entry
  const b = t.match(new RegExp(`<dt class='thebibliography' id='${escapeRe(id)}'>([\\s\\S]*?)</dt>\\s*<dd[^>]*>([\\s\\S]*?)</dd>`));
  if (b) return `<div class='pv-cite'><strong>${plainText(b[1])}</strong> ${clean(b[2])}</div>`;
  // 5. section heading: title and first paragraph
  const s = t.match(new RegExp(`<h(\\d) class='\\w+Head' id='${escapeRe(id)}'>([\\s\\S]*?)</h\\1>(?:\\s|<!--[\\s\\S]*?-->)*(<p [^>]*>[\\s\\S]*?</p>)?`));
  if (s) return `<div class='pv-section'><strong>${plainText(s[2])}</strong></div>` + clean(s[3] ?? "");
  return null;
}

/** {href as it appears on the page: preview html}. */
export function pagePreviews(name, bodies) {
  const out = {};
  // the chapter page's mini table of contents gets no previews
  const text = bodies[name].replace(/<span class='\w+Toc'>[\s\S]*?<\/span>/g, "");
  for (const m of text.matchAll(/<a href='([^']+)'>([\s\S]*?)<\/a>/g)) {
    const href = m[1];
    const [p, id] = href.split(/#(.*)/s);
    const page = p || name;
    if (!id || !(page in bodies) || href in out) continue;
    const f = fragment(bodies[page], id, plainText(m[2]));
    if (f) out[href] = f;
  }
  return out;
}
