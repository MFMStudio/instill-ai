/* Instill AI — public-page auth detection. Swaps topbar actions and expands nav when logged in. */
(function () {
  if (window.location.pathname === '/login') return;

  fetch('/api/me', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me) return;

      /* ── Top-actions swap ── */
      var actions = document.getElementById('topbar-actions');
      if (actions) {
        var themeBtn = document.getElementById('theme-toggle');
        actions.innerHTML = '';
        if (themeBtn) actions.appendChild(themeBtn);

        var status = document.createElement('span');
        status.className = 'status';
        status.innerHTML = '<span class="dot"></span>Connected';
        actions.appendChild(status);

        var out = document.createElement('button');
        out.type = 'button';
        out.className = 'btn btn-ghost btn-sm';
        out.textContent = 'Sign out';
        out.addEventListener('click', function () {
          fetch('/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .then(function () { window.location.href = '/login'; });
        });
        actions.appendChild(out);
      }

      /* ── Nav expansion: append Dashboard, Setup, Admin (if admin) ── */
      var nav = document.querySelector('nav.nav');
      if (nav) {
        var dash = document.createElement('a');
        dash.href = '/dashboard';
        dash.textContent = 'Dashboard';
        nav.appendChild(dash);

        var setup = document.createElement('a');
        setup.href = '/setup';
        setup.textContent = 'Setup';
        nav.appendChild(setup);

        if (me.isAdmin) {
          var admin = document.createElement('a');
          admin.href = '/admin';
          admin.textContent = 'Admin';
          nav.appendChild(admin);
        }
      }
    })
    .catch(function () {});
})();
