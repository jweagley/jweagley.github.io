// Shared, tiny site JS. No dependencies.

// 1) Mobile nav toggle
(function () {
  var toggle = document.querySelector(".nav-toggle");
  var links = document.getElementById("nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    // Close menu when a link is tapped (mobile)
    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A") links.classList.remove("open");
    });
  }
})();

// 2) Auto-fill the current year in the footer
(function () {
  var el = document.getElementById("year");
  if (el) el.textContent = new Date().getFullYear();
})();

// 3) Optional light/dark toggle (respects OS by default).
//    Add a button with id="theme-toggle" anywhere to enable it.
(function () {
  var KEY = "theme-preference";
  var btn = document.getElementById("theme-toggle");
  var saved = localStorage.getItem(KEY);
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  if (btn) {
    var sync = function () {
      var current =
        document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      btn.textContent = current === "dark" ? "☀︎" : "☾";
      btn.setAttribute("aria-label", "Switch to " + (current === "dark" ? "light" : "dark") + " mode");
    };
    sync();
    btn.addEventListener("click", function () {
      var current =
        document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem(KEY, next);
      sync();
    });
  }
})();
