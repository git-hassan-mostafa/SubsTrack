import { initLanguage } from "./i18n.js";
import { initContact } from "./contact.js";
import { initSimulator } from "./simulator.js";
import { initPricing } from "./pricing.js";
import { saveSetting } from "./storage.js";

const SUN_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
const MOON_ICON = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

function initTheme() {
  const root = document.documentElement;
  const icon = document.getElementById("theme-toggle-icon");
  const showIcon = () => {
    icon.innerHTML = root.getAttribute("data-theme") === "dark" ? SUN_ICON : MOON_ICON;
  };
  showIcon();
  document.getElementById("theme-toggle-btn").addEventListener("click", () => {
    const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    showIcon();
    saveSetting("sijil_theme", next);
  });
}

function showSolutionTab(targetId) {
  document.querySelectorAll(".tab-btn[data-target]").forEach((tab) => {
    const active = tab.dataset.target === targetId;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".solution-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === targetId);
  });
}

function initSolutionTabs() {
  document.querySelectorAll(".tab-btn[data-target]").forEach((tab) => {
    tab.addEventListener("click", () => showSolutionTab(tab.dataset.target));
  });
  document.querySelectorAll("[data-show-tab]").forEach((link) => {
    link.addEventListener("click", () => showSolutionTab(link.dataset.showTab));
  });
}

function initFaq() {
  const items = document.querySelectorAll(".faq-item");
  items.forEach((item) => {
    const button = item.querySelector(".faq-question-btn");
    button.addEventListener("click", () => {
      const opening = !item.classList.contains("active");
      items.forEach((other) => {
        other.classList.remove("active");
        other.querySelector(".faq-question-btn").setAttribute("aria-expanded", "false");
      });
      item.classList.toggle("active", opening);
      button.setAttribute("aria-expanded", String(opening));
    });
  });
}

function initMobileMenu() {
  const button = document.getElementById("mobile-menu-toggle");
  const links = document.getElementById("nav-links");
  const setOpen = (open) => {
    links.classList.toggle("open", open);
    button.setAttribute("aria-expanded", String(open));
  };
  button.addEventListener("click", () => setOpen(!links.classList.contains("open")));
  links.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
}

document.addEventListener("DOMContentLoaded", () => {
  initLanguage();
  initTheme();
  initSolutionTabs();
  initFaq();
  initMobileMenu();
  initContact();
  initSimulator();
  initPricing();
});
