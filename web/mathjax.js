// Renders formulas at build time with MathJax (CHTML output), so the browser
// doesn't have to load MathJax. All pages share one stylesheet
// (mathjax/mathjax.css) and the fonts are served from the site itself.
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { mathjax } = require("mathjax-full/js/mathjax.js");
const { TeX } = require("mathjax-full/js/input/tex.js");
const { CHTML } = require("mathjax-full/js/output/chtml.js");
const { liteAdaptor } = require("mathjax-full/js/adaptors/liteAdaptor.js");
const { RegisterHTMLHandler } = require("mathjax-full/js/handlers/html.js");
const { AssistiveMmlHandler } = require("mathjax-full/js/a11y/assistive-mml.js");
const { CommandMap } = require("mathjax-full/js/input/tex/SymbolMap.js");
const { Configuration } = require("mathjax-full/js/input/tex/Configuration.js");
const BaseMethods = require("mathjax-full/js/input/tex/base/BaseMethods.js").default;
require("mathjax-full/js/input/tex/base/BaseConfiguration.js");
require("mathjax-full/js/input/tex/ams/AmsConfiguration.js");
require("mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js");
require("mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js");

export const FONTS_DIR = require.resolve("mathjax-full/es5/output/chtml/fonts/woff-v2/MathJax_Main-Regular.woff")
  .replace(/\/[^/]+$/, "");

// Operators that babel (spanish) defines in the PDF. They're registered like
// MathJax's \lim, \sin... (NamedOp/NamedFn), not as macros: with \operatorname
// the space after an operator with a subscript is lost.
const sp = " "; // the \, babel puts in lím sup, arc sen...
const OPERATORS = { // limits below in display
  lim: "lím", limsup: "lím" + sp + "sup", liminf: "lím" + sp + "inf",
  max: "máx", min: "mín", inf: "ínf",
};
const FUNCTIONS = {
  sen: "sen", tg: "tg", arcsen: "arc" + sp + "sen", arccos: "arc" + sp + "cos",
  arctg: "arc" + sp + "tg", cotg: "cotg", cosec: "cosec", senh: "senh", tgh: "tgh",
};
const BABEL_MACROS = {
  bmod: "\\mathbin{\\operatorname{mód}}",
  pmod: ["\\pod{\\operatorname{mód}\\mkern6mu #1}", 1],
  mod: ["\\mkern18mu\\operatorname{mód}\\,\\,#1", 1],
};
const map = {};
for (const [k, v] of Object.entries(OPERATORS)) map[k] = ["NamedOp", v];
for (const [k, v] of Object.entries(FUNCTIONS)) map[k] = ["NamedFn", v];
new CommandMap("es-operators", map, BaseMethods);
Configuration.create("es-operators", { handler: { macro: ["es-operators"] } });

// ------------------------------------------------------------ macros.tex
/** Content of the {...} group starting at t[i] and position after it closes. */
function group(t, i) {
  let depth = 0;
  for (let j = i; j < t.length; j++) {
    if (t[j] === "\\") { j++; continue; } // \{ \} \\
    if (t[j] === "{") depth++;
    else if (t[j] === "}" && --depth === 0) return [t.slice(i + 1, j), j + 1];
  }
  throw new Error(`unclosed braces in macros.tex: ${t.slice(i, i + 40)}`);
}

/** Translates \newcommand, \renewcommand and \DeclareMathOperator to MathJax's format. */
export function readMacros(path) {
  const t = readFileSync(path, "utf8").replace(/(?<!\\)%.*/g, "");
  const macros = {};
  for (const m of t.matchAll(/\\(newcommand|renewcommand|DeclareMathOperator)(\*?)\s*/g)) {
    let i = m.index + m[0].length, name;
    if (t[i] === "{") [name, i] = group(t, i);
    else { name = t.slice(i).match(/^\\[A-Za-z]+/)[0]; i += name.length; } // \newcommand\R{...}
    const n = t.slice(i).match(/^\s*\[(\d)\]\s*/);
    if (n) i += n[0].length;
    const [body] = group(t, t.indexOf("{", i));
    const key = name.trim().replace(/^\\/, "");
    if (m[1] === "DeclareMathOperator") macros[key] = `\\operatorname${m[2]}{${body}}`;
    else macros[key] = n ? [body, Number(n[1])] : body;
  }
  return macros;
}

// ------------------------------------------------------------ rendering
/**
 * Creates a renderer that shares input and output across pages, so that
 * css() returns the stylesheet with everything used on the site.
 * `fonts` is the fonts URL relative to the stylesheet.
 */
export function createRenderer({ macros = {}, fonts = "woff-v2" } = {}) {
  const adaptor = liteAdaptor();
  AssistiveMmlHandler(RegisterHTMLHandler(adaptor));
  const tex = new TeX({
    packages: ["base", "ams", "newcommand", "configmacros", "es-operators"],
    macros: { ...macros, ...BABEL_MACROS }, // babel wins, as in the PDF
    tags: "ams", // numbers arrive as explicit \tag
  });
  // In the browser MathJax scales formulas to match the x-height of the text
  // font; in Node it can't measure it. 1.191 is the factor it computed for
  // --font (web/style.css) with system-ui on macOS; since the font depends on
  // the reader's system, it's an approximation.
  const chtml = new CHTML({ fontURL: fonts, matchFontHeight: false, scale: 1.191 });
  let last = null;

  function render(html) {
    const doc = mathjax.document(html, { InputJax: tex, OutputJax: chtml });
    doc.render();
    // the stylesheet goes in a shared file, not on every page
    const style = adaptor.elementById(adaptor.head(doc.document), "MJX-CHTML-styles");
    if (style) adaptor.remove(style);
    last = doc;
    return doc;
  }

  return {
    /** Full HTML page with formulas rendered. */
    page(html) {
      const doc = render(html);
      return adaptor.doctype(doc.document) + "\n" + adaptor.outerHTML(adaptor.root(doc.document));
    },
    /** HTML fragment (e.g. a preview) with formulas rendered. */
    fragment(html) {
      const doc = render(`<!DOCTYPE html><html><head></head><body>${html}</body></html>`);
      return adaptor.innerHTML(adaptor.body(doc.document));
    },
    /** Stylesheet with the fonts and glyphs used in everything rendered. */
    css() {
      return last ? adaptor.textContent(chtml.styleSheet(last)) : "";
    },
  };
}
