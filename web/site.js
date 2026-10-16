(function () {
  var r = document.documentElement;
  function save(t) { try { localStorage.setItem('theme', t); } catch (e) {} }
  var b = document.getElementById('theme');
  if (b) b.addEventListener('click', function () {
    var dark = r.dataset.theme ? r.dataset.theme === 'dark'
      : matchMedia('(prefers-color-scheme: dark)').matches;
    r.dataset.theme = dark ? 'light' : 'dark';
    save(r.dataset.theme);
  });
  var m = document.getElementById('menu'), s = document.getElementById('sidebar'),
      d = document.getElementById('drawer');
  // With Web Awesome loaded the wa-drawer (modal) opens; without it (e.g. offline)
  // fall back to the old collapsible sidebar.
  if (m) m.addEventListener('click', function () {
    if (d && customElements.get('wa-drawer')) d.open = true;
    else if (s) s.classList.toggle('open');
  });
  if (d) d.addEventListener('click', function (e) {
    if (e.target.closest && e.target.closest('a')) d.open = false;
  });
  var a = document.querySelector('.sidebar .active');
  if (a && a.scrollIntoView) a.scrollIntoView({ block: 'center' });
})();

// Cross-reference previews: each target's content is embedded in the page
// (#previews), generated at build time by web/crossrefs.js (formulas already rendered).
(function () {
  var data, pop = document.getElementById('preview'), art = document.querySelector('article');
  try { data = JSON.parse(document.getElementById('previews').textContent); } catch (e) { return; }
  if (!pop || !art || matchMedia('(hover: none)').matches) return;
  var link = null, tShow, tHide;

  function place() {
    if (!link) return;
    var r = link.getBoundingClientRect(), h = pop.offsetHeight, w = pop.offsetWidth;
    var below = window.innerHeight - r.bottom, above = r.top;
    var y = (below >= h + 12 || below >= above) ? r.bottom + 6 : r.top - h - 6;
    pop.style.top = Math.max(8, Math.min(y, window.innerHeight - h - 8)) + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  }
  function show(a) {
    var v = data[a.getAttribute('href')];
    if (!v) return;
    link = a;
    pop.innerHTML = v;
    pop.hidden = false;
    pop.scrollTop = 0;
    place();
  }
  function hide() { pop.hidden = true; link = null; }
  function schedule(a) {
    clearTimeout(tHide); clearTimeout(tShow);
    if (link === a) return;
    tShow = setTimeout(function () { show(a); }, 250);
  }
  function release() {
    clearTimeout(tShow); clearTimeout(tHide);
    tHide = setTimeout(hide, 200);
  }
  function target(e) {
    var a = e.target.closest && e.target.closest('a[href]');
    return a && art.contains(a) && data[a.getAttribute('href')] ? a : null;
  }
  art.addEventListener('mouseover', function (e) { var a = target(e); if (a) schedule(a); });
  art.addEventListener('mouseout', function (e) { if (target(e)) release(); });
  art.addEventListener('focusin', function (e) { var a = target(e); if (a) { clearTimeout(tHide); show(a); } });
  art.addEventListener('focusout', function (e) { if (target(e)) release(); });
  pop.addEventListener('mouseenter', function () { clearTimeout(tHide); });
  pop.addEventListener('mouseleave', release);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, { passive: true });
})();
