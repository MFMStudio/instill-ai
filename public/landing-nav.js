/**
 * Collapsible primary nav for .landing-nav (marketing + login top bar).
 */
(function () {
  function closeAllMenus() {
    document.querySelectorAll(".landing-nav.nav-menu-open").forEach(function (nav) {
      nav.classList.remove("nav-menu-open");
      var b = nav.querySelector(".nav-menu-toggle");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }

  document.querySelectorAll(".nav-menu-toggle").forEach(function (btn) {
    var nav = btn.closest(".landing-nav");
    if (!nav) return;
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = nav.classList.contains("nav-menu-open");
      closeAllMenus();
      if (!open) {
        nav.classList.add("nav-menu-open");
        btn.setAttribute("aria-expanded", "true");
      }
    });
  });

  document.addEventListener("click", function (e) {
    if (e.target.closest(".nav-menu-toggle")) return;
    if (e.target.closest("#marketing-nav-links")) return;
    closeAllMenus();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAllMenus();
  });
})();
