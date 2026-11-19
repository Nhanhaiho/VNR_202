"use strict";

{
  const storageKey = "vnr202-theme";
  const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
  const themeColor = document.querySelector('meta[name="theme-color"]');
  const root = document.documentElement;
  let preference = null;
  let button;
  let label;

  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "dark" || saved === "light") preference = saved;
  } catch {
    // Use the system theme when the browser blocks storage.
  }

  function applyTheme() {
    const theme = preference ?? (systemTheme.matches ? "dark" : "light");
    const dark = theme === "dark";
    root.dataset.theme = theme;
    themeColor.content = dark ? "#101622" : "#f5f7fb";
    if (button) {
      label.textContent = dark ? "Sáng" : "Tối";
      button.setAttribute("aria-label", dark ? "Chuyển sang giao diện sáng" : "Chuyển sang giao diện tối");
    }
  }

  applyTheme();
  systemTheme.addEventListener("change", applyTheme);
  window.addEventListener("storage", event => {
    if (event.key !== storageKey && event.key !== null) return;
    preference = event.newValue === "dark" || event.newValue === "light" ? event.newValue : null;
    applyTheme();
  });

  document.addEventListener("DOMContentLoaded", () => {
    button = document.querySelector("#theme-toggle");
    label = document.querySelector("#theme-label");
    applyTheme();
    button.hidden = false;
    button.addEventListener("click", () => {
      preference = root.dataset.theme === "dark" ? "light" : "dark";
      applyTheme();
      try {
        localStorage.setItem(storageKey, preference);
      } catch {
        // Keep the selection active in this tab.
      }
    });
  });
}
