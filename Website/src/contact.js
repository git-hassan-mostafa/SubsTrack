import { currentScriptText, onLanguageChange } from "./i18n.js";

const SUPPORT_WHATSAPP_NUMBER = import.meta.env.VITE_SUPPORT_WHATSAPP_NUMBER;

function whatsAppUrl(message) {
  return `https://wa.me/${SUPPORT_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function openWhatsApp(message) {
  const url = whatsAppUrl(message);
  const opened = window.open(url, "_blank");
  if (opened) opened.opener = null;
  else window.location.assign(url);
}

function leadMessage(form) {
  const text = currentScriptText().contact;
  const value = (id) => form.querySelector(`#${id}`).value.trim();
  const lines = [
    text.greeting,
    `${text.name}: ${value("contact-name")}`,
    `${text.business}: ${value("contact-business")}`,
    `${text.type}: ${text.types[value("contact-type")]}`,
  ];
  if (value("contact-count")) lines.push(`${text.count}: ${value("contact-count")}`);
  if (value("contact-area")) lines.push(`${text.area}: ${value("contact-area")}`);
  return lines.join("\n");
}

function initContactModal() {
  const modal = document.getElementById("modal-contact");
  const form = document.getElementById("contact-form");
  let opener = null;

  const close = () => {
    modal.classList.remove("active");
    opener?.focus();
  };

  document.querySelectorAll("[data-open-modal='contact']").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      opener = button;
      if (button.dataset.contactCount) form.querySelector("#contact-count").value = button.dataset.contactCount;
      modal.classList.add("active");
      form.querySelector("input")?.focus();
    });
  });

  modal.querySelector(".modal-close-btn")?.addEventListener("click", close);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.classList.contains("active")) close();
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    openWhatsApp(leadMessage(form));
    close();
  });
}

function initWhatsAppLinks() {
  const links = document.querySelectorAll("[data-whatsapp-link]");
  const update = () => {
    const url = whatsAppUrl(currentScriptText().contact.question);
    links.forEach((link) => {
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
    });
  };
  update();
  onLanguageChange(update);
}

export function initContact() {
  initContactModal();
  initWhatsAppLinks();
}
