#!/usr/bin/env bash
# Builds the PDF and HTML (tex4ht) and leaves the site ready in public/.
set -euo pipefail
cd "$(dirname "$0")"

rm -rf public .work-html
mkdir -p public .work-html

# --- PDF ---
latexmk -interaction=nonstopmode -halt-on-error main.tex
cp build/main.pdf public/calculo-avanzado.pdf

# --- HTML ---
[ -d node_modules ] || npm ci
cp main.tex preamble.tex colors.tex macros.tex references.bib .work-html/
cp -r chapters .work-html/
cp web/main.cfg .work-html/
(
  cd .work-html
  # biber needs a first pass to generate main.bcf/main.bbl
  pdflatex -interaction=nonstopmode -halt-on-error main.tex >/dev/null
  biber main >/dev/null
  make4ht -u -c main.cfg main.tex "mathjax"
)
node web/postprocess.js .work-html public calculo-avanzado.pdf build/main.aux
cp web/style.css web/site.js public/
touch public/.nojekyll

# --- Checks: unresolved references or citations ---
if grep -E "Warning.*(undefined|Empty bibliography)|Citation.*undefined" .work-html/main.log; then
  echo "ERROR: unresolved references or citations in the HTML" >&2; exit 1
fi
if grep -E "undefined|Warning" build/main.log | grep -v "^$" >/dev/null; then
  grep -E "Warning" build/main.log >&2; echo "ERROR: warnings in the PDF" >&2; exit 1
fi
echo "OK -> public/"
