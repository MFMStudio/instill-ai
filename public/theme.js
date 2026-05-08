/* Instill AI — theme toggle. Included on every page. */
function toggleTheme() {
  var current = document.documentElement.getAttribute('data-theme') || 'light';
  var next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('instill-theme', next);
  var btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = next === 'dark' ? '☀' : '☾';
}

(function () {
  var saved = localStorage.getItem('instill-theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', function () {
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = saved === 'dark' ? '☀' : '☾';
  });
})();
