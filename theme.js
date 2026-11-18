/* ============================================================
   SECURITYTRANS — Gestor de tema (claro/oscuro)
   Persistencia en localStorage + prefers-color-scheme inicial
   ============================================================ */

(function () {
  const KEY = "securitytrans-theme";

  function sistema() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function aplicar(tema) {
    document.documentElement.setAttribute("data-theme", tema);
    try { localStorage.setItem(KEY, tema); } catch (e) { /* almacenamiento no disponible */ }
    // Emitir evento para que las gráficas se actualicen
    window.dispatchEvent(new CustomEvent("securitytrans:theme", { detail: { tema } }));
  }

  function inicial() {
    let guardado = null;
    try { guardado = localStorage.getItem(KEY); } catch (e) {}
    const tema = guardado || sistema();
    document.documentElement.setAttribute("data-theme", tema);
    return tema;
  }

  window.SecurityTransTheme = { aplicar, inicial, KEY };

  // Aplicar de inmediato (antes del DOMContentLoaded para evitar parpadeo)
  const temaInicial = inicial();
  document.documentElement.setAttribute("data-theme", temaInicial);

  // Vincular todos los botones con [data-theme-toggle]
  document.addEventListener("DOMContentLoaded", function () {
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        const actual = document.documentElement.getAttribute("data-theme");
        aplicar(actual === "dark" ? "light" : "dark");
        btn.setAttribute("aria-pressed", String(actual !== "dark"));
      });
      btn.setAttribute("aria-pressed", String(document.documentElement.getAttribute("data-theme") === "dark"));
      btn.textContent = document.documentElement.getAttribute("data-theme") === "dark"
        ? "Tema claro" : "Tema oscuro";
    });
  });
})();
