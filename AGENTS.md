<!-- LTeX: language=en-US -->
# AGENTS.md

## Language convention

Source is in English; content is in Spanish.

- **English**: everything developers see. That includes file and directory names, LaTeX environment and macro names, `\label` keys, code identifiers, CSS classes and custom properties, code comments, build/CI log messages and step names. Write `\begin{lemma}`, not `\begin{lema}`.
- **Spanish**: everything readers of the book or website see. That includes the book's text, theorem headings (`\newtheorem{lemma}[theorem]{Lema}`), web UI strings and `aria-label`s (`"Cambiar tema"`), and the `Ecuación (n)` preview label.

Theorem-like environments (defined in `preamble.tex`): `theorem`, `lemma`, `proposition`, `corollary`, `definition`, `example`, `remark`, `proof`.

Gotcha: `web/postprocess.js` styles theorem boxes using the ids tex4ht generates. Those ids come from the **printed heading** (`Definición 1.1` → `definicion11`), not from the environment name. So the keys of `FAMILIES` are Spanish on purpose. They map to the English `.thm-*` classes in `web/style.css`. If you change a heading, update its key.

## Commits

Messages follow [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`…), in English. A husky `commit-msg` hook runs commitlint locally (installed by `npm install`), and the `Commitlint` workflow checks it again in CI.
