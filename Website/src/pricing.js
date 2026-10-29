import { currentScriptText, onLanguageChange } from "./i18n.js";

const FREE_SUBSCRIBERS = 20;
const CENTS_PER_SUBSCRIBER = 15;
const PACKAGE_PRICES_USD = {
  300: import.meta.env.VITE_PACKAGE_300_USD,
  500: import.meta.env.VITE_PACKAGE_500_USD,
  1000: import.meta.env.VITE_PACKAGE_1000_USD,
};

// Above the free 20, every subscriber is billed, not only the ones past 20.
function monthlyCents(count) {
  return count <= FREE_SUBSCRIBERS ? 0 : count * CENTS_PER_SUBSCRIBER;
}

function dollars(cents) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function packageDollars(price) {
  return `$${Number(price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function perSubscriber(price, size) {
  return (Number(price) / Number(size)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function renderPackages(text) {
  document.querySelectorAll("[data-package-amount]").forEach((amount) => {
    const size = amount.dataset.packageAmount;
    const price = PACKAGE_PRICES_USD[size];
    amount.textContent = price ? packageDollars(price) : text.askPrice;
    amount.classList.toggle("ask", !price);
    document.querySelector(`[data-package-from="${size}"]`).hidden = !price;
    document.querySelector(`[data-package-period="${size}"]`).textContent = price ? text.perMonth : "";
    document.querySelector(`[data-package-per="${size}"]`).textContent = price ? text.perSubscriber(perSubscriber(price, size)) : "";
  });
}

export function initPricing() {
  const slider = document.getElementById("pricing-customer-slider");
  if (!slider) return;
  const countValue = document.getElementById("pricing-slider-val");
  const total = document.getElementById("pricing-total");
  const period = document.getElementById("pricing-period");
  const detail = document.getElementById("pricing-detail");
  const presets = document.querySelectorAll(".pricing-preset-btn");
  let count = Number(slider.value);

  const render = () => {
    const text = currentScriptText().pricing;
    const cents = monthlyCents(count);
    const countText = count.toLocaleString("en-US");
    countValue.textContent = countText;
    total.textContent = cents === 0 ? text.free : dollars(cents);
    period.textContent = cents === 0 ? "" : text.perMonth;
    detail.textContent = cents === 0 ? text.freeDetail : text.paidDetail(countText);
    presets.forEach((preset) => preset.classList.toggle("active", Number(preset.dataset.customers) === count));
    renderPackages(text);
  };

  slider.addEventListener("input", () => {
    count = Number(slider.value);
    render();
  });

  presets.forEach((preset) => {
    preset.addEventListener("click", () => {
      count = Number(preset.dataset.customers);
      slider.value = String(count);
      render();
    });
  });

  render();
  onLanguageChange(render);
}
