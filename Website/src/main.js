// Theme management and persistence
function initTheme() {
  const toggleBtn = document.getElementById("theme-toggle-btn");
  const iconSpan = document.getElementById("theme-toggle-icon");
  const savedTheme = localStorage.getItem("sijil_theme") || "dark";

  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme, iconSpan);

  toggleBtn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("sijil_theme", next);
    updateThemeIcon(next, iconSpan);
  });
}

// Icon rendering helper for theme button
function updateThemeIcon(theme, iconSpan) {
  if (!iconSpan) return;
  if (theme === "dark") {
    iconSpan.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
  } else {
    iconSpan.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
  }
}

// Interactive month grid simulator based on Tunde Okoro in Acme ISP
function initMonthGridSimulator() {
  const container = document.getElementById("simulator-grid");
  const explanationTitle = document.getElementById("sim-exp-title");
  const explanationText = document.getElementById("sim-exp-desc");
  const btnCollect30 = document.getElementById("sim-btn-collect-30");
  const btnCollect60 = document.getElementById("sim-btn-collect-60");
  const btnSkipMonth = document.getElementById("sim-btn-skip");
  const btnReset = document.getElementById("sim-btn-reset");

  const initialMonths = [
    { name: "Jan", status: "paid", fee: "$30", label: "Paid ($30)" },
    { name: "Feb", status: "paid", fee: "$30", label: "Paid ($30)" },
    { name: "Mar", status: "paid", fee: "$30", label: "Paid ($30)" },
    { name: "Apr", status: "paid", fee: "$30", label: "Paid ($30)" },
    { name: "May", status: "overdue", fee: "$30", label: "Due Now ($30)" },
    { name: "Jun", status: "future", fee: "$30", label: "Upcoming" },
    { name: "Jul", status: "future", fee: "$30", label: "Upcoming" },
    { name: "Aug", status: "future", fee: "$30", label: "Upcoming" },
    { name: "Sep", status: "future", fee: "$30", label: "Upcoming" },
    { name: "Oct", status: "future", fee: "$30", label: "Upcoming" },
    { name: "Nov", status: "future", fee: "$30", label: "Upcoming" },
    { name: "Dec", status: "future", fee: "$30", label: "Upcoming" }
  ];

  let currentMonths = JSON.parse(JSON.stringify(initialMonths));

  function renderGrid() {
    container.innerHTML = "";
    currentMonths.forEach((m) => {
      const card = document.createElement("div");
      card.className = "month-card";

      let icon = "";
      if (m.status === "paid") icon = "✓ ";
      else if (m.status === "overdue") icon = "! ";
      else if (m.status === "skipped") icon = "⏸ ";
      else icon = "• ";

      card.innerHTML = `
        <div class="month-name">${m.name}</div>
        <div class="month-badge ${m.status}">${icon}${m.label}</div>
        <div class="month-fee">${m.fee}</div>
      `;
      container.appendChild(card);
    });
  }

  btnCollect30?.addEventListener("click", () => {
    currentMonths = currentMonths.map((m) => {
      if (m.name === "May") {
        return { ...m, status: "paid", label: "Paid ($30)" };
      }
      return m;
    });
    renderGrid();
    explanationTitle.textContent = "Receipt A-2104 Generated: May 2026 Cleared in Full ($30.00)";
    explanationText.textContent = "Sarah Kowalski recorded $30.00 cash from Tunde Okoro at door. May 2026 turned green immediately, the debt was cleared, and custody was logged to sarah.k.";
  });

  btnCollect60?.addEventListener("click", () => {
    currentMonths = currentMonths.map((m) => {
      if (m.name === "May" || m.name === "Jun") {
        return { ...m, status: "paid", label: "Paid ($30)" };
      }
      return m;
    });
    renderGrid();
    explanationTitle.textContent = "Waterfall Settled: May & June 2026 Paid ($60.00)";
    explanationText.textContent = "Sijil's oldest-first waterfall applied $30.00 to the current May invoice first, then automatically covered June in advance. Total collected updated to $180.";
  });

  btnSkipMonth?.addEventListener("click", () => {
    currentMonths = currentMonths.map((m) => {
      if (m.name === "Jul") {
        return { ...m, status: "skipped", label: "Skipped", fee: "Pause" };
      }
      return m;
    });
    renderGrid();
    explanationTitle.textContent = "Vacation Skip Logged: July Marked as Paused";
    explanationText.textContent = "Tunde requested a 1-month travel pause. July is marked Skipped on the grid without raising debt or skewing monthly revenue targets.";
  });

  btnReset?.addEventListener("click", () => {
    currentMonths = JSON.parse(JSON.stringify(initialMonths));
    renderGrid();
    explanationTitle.textContent = "Tunde Okoro's Live Profile (Acme ISP)";
    explanationText.textContent = "4 paid ($120 collected) · 1 unpaid (May 2026 · $30 due · 12 days into the month). Click an action above to test payment collection in Sijil.";
  });

  renderGrid();
}

// Real-time ROI and revenue recovery calculator with app defaults
function initRoiCalculator() {
  const subsSlider = document.getElementById("slider-subscribers");
  const feeSlider = document.getElementById("slider-fee");
  const leakSlider = document.getElementById("slider-leakage");

  const valSubs = document.getElementById("val-subscribers");
  const valFee = document.getElementById("val-fee");
  const valLeak = document.getElementById("val-leakage");

  const resAnnual = document.getElementById("calc-res-annual");
  const resRecovered = document.getElementById("calc-res-recovered");
  const resHours = document.getElementById("calc-res-hours");

  function recalculate() {
    const subs = parseInt(subsSlider.value, 10);
    const fee = parseInt(feeSlider.value, 10);
    const leakPct = parseInt(leakSlider.value, 10);

    valSubs.textContent = subs.toLocaleString();
    valFee.textContent = `$${fee}/mo`;
    valLeak.textContent = `${leakPct}%`;

    const monthlyRevenue = subs * fee;
    const annualRevenue = monthlyRevenue * 12;
    const annualLeakage = annualRevenue * (leakPct / 100);
    const recovered = Math.round(annualLeakage * 0.78);
    const hoursSaved = Math.round(subs * 0.08);

    resAnnual.textContent = `$${annualRevenue.toLocaleString()}`;
    resRecovered.textContent = `+$${recovered.toLocaleString()}/yr`;
    resHours.textContent = `${hoursSaved} hrs/mo`;
  }

  subsSlider?.addEventListener("input", recalculate);
  feeSlider?.addEventListener("input", recalculate);
  leakSlider?.addEventListener("input", recalculate);

  recalculate();
}

// Industry solution tab switching
function initSolutionsTabs() {
  const tabs = document.querySelectorAll(".tab-btn[data-target]");
  const panels = document.querySelectorAll(".solution-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const targetId = tab.getAttribute("data-target");

      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add("active");
    });
  });
}

// App tour screenshot tabs
function initTourTabs() {
  const tabs = document.querySelectorAll(".tour-tab-btn[data-tour]");
  const panels = document.querySelectorAll(".tour-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tourId = tab.getAttribute("data-tour");

      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));

      tab.classList.add("active");
      const targetPanel = document.getElementById(tourId);
      if (targetPanel) targetPanel.classList.add("active");
    });
  });
}

// Dynamic customer count pricing slider and billing toggle
function initPricingCalculator() {
  const track = document.getElementById("pricing-toggle-track");
  const monthlyLabel = document.getElementById("label-monthly");
  const annualLabel = document.getElementById("label-annual");

  const slider = document.getElementById("pricing-customer-slider");
  const sliderVal = document.getElementById("pricing-slider-val");
  const dynamicTotal = document.getElementById("pricing-dynamic-total");
  const dynamicRate = document.getElementById("pricing-dynamic-rate");
  const dynamicPeriod = document.getElementById("pricing-dynamic-period");
  const dynamicSavings = document.getElementById("pricing-dynamic-savings");
  const dynamicCta = document.getElementById("pricing-dynamic-cta");
  const presetBtns = document.querySelectorAll(".pricing-preset-btn");

  const starterPrice = document.getElementById("price-starter");
  const growthPrice = document.getElementById("price-growth");
  const enterprisePrice = document.getElementById("price-enterprise");
  const tierPeriods = document.querySelectorAll(".pricing-tier-period");

  let isAnnual = false;
  let customerCount = slider ? parseInt(slider.value, 10) || 184 : 184;

  function update() {
    if (sliderVal) sliderVal.textContent = customerCount.toLocaleString();

    if (customerCount <= 30) {
      if (dynamicTotal) dynamicTotal.textContent = "0";
      if (dynamicRate) dynamicRate.textContent = "Free Forever";
      if (dynamicPeriod) dynamicPeriod.textContent = "/ forever";
      if (dynamicSavings) {
        dynamicSavings.textContent = "Start free and stay free forever · 100% free for up to 30 active customers";
        dynamicSavings.style.display = "block";
      }
      if (dynamicCta) dynamicCta.textContent = "Start Free Forever";
    } else {
      const rate = isAnnual ? 0.12 : 0.15;
      const monthlyCost = customerCount * rate;
      const formattedCost = monthlyCost % 1 === 0 ? monthlyCost.toFixed(0) : monthlyCost.toFixed(2);

      if (dynamicTotal) dynamicTotal.textContent = formattedCost;
      if (dynamicRate) dynamicRate.textContent = isAnnual ? "$0.12" : "$0.15";
      if (dynamicPeriod) dynamicPeriod.textContent = isAnnual ? "/ mo (billed annually)" : "/ month";

      if (dynamicSavings) {
        if (isAnnual) {
          const annualSavings = (customerCount * 0.03 * 12).toFixed(2);
          dynamicSavings.textContent = `Saves $${annualSavings}/year with 20% annual discount`;
          dynamicSavings.style.display = "block";
        } else {
          dynamicSavings.style.display = "none";
        }
      }
      if (dynamicCta) dynamicCta.textContent = "Start Free & Scale";
    }

    if (starterPrice) starterPrice.textContent = "0";
    if (tierPeriods[0]) tierPeriods[0].textContent = "/ forever";

    if (isAnnual) {
      track?.classList.add("annual");
      if (growthPrice) growthPrice.textContent = "60";
      if (enterprisePrice) enterprisePrice.textContent = "120";
      if (tierPeriods[1]) tierPeriods[1].textContent = "/ month, billed annually";
      if (tierPeriods[2]) tierPeriods[2].textContent = "/ month, billed annually";
    } else {
      track?.classList.remove("annual");
      if (growthPrice) growthPrice.textContent = "75";
      if (enterprisePrice) enterprisePrice.textContent = "150";
      if (tierPeriods[1]) tierPeriods[1].textContent = "/ month";
      if (tierPeriods[2]) tierPeriods[2].textContent = "/ month";
    }

    presetBtns.forEach((btn) => {
      const btnVal = parseInt(btn.getAttribute("data-customers"), 10);
      btn.classList.toggle("active", btnVal === customerCount);
    });
  }

  slider?.addEventListener("input", (e) => {
    customerCount = parseInt(e.target.value, 10) || 10;
    update();
  });

  presetBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = parseInt(btn.getAttribute("data-customers"), 10);
      if (val !== undefined && !isNaN(val)) {
        customerCount = val;
        if (slider) slider.value = val;
        update();
      }
    });
  });

  track?.addEventListener("click", () => {
    isAnnual = !isAnnual;
    update();
  });

  monthlyLabel?.addEventListener("click", () => {
    isAnnual = false;
    update();
  });

  annualLabel?.addEventListener("click", () => {
    isAnnual = true;
    update();
  });

  update();
}

// FAQ accordion disclosure
function initFaqAccordion() {
  const items = document.querySelectorAll(".faq-item");

  items.forEach((item) => {
    const btn = item.querySelector(".faq-question-btn");
    btn?.addEventListener("click", () => {
      const isActive = item.classList.contains("active");
      items.forEach((i) => i.classList.remove("active"));
      if (!isActive) item.classList.add("active");
    });
  });
}

// Modal handling for demo and trial forms
function initModals() {
  const demoModal = document.getElementById("modal-demo");
  const closeBtns = document.querySelectorAll(".modal-close-btn");
  const openDemoBtns = document.querySelectorAll("[data-open-modal='demo']");
  const demoForm = document.getElementById("demo-form");
  const demoSuccess = document.getElementById("demo-success");

  openDemoBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      demoModal.classList.add("active");
    });
  });

  closeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      demoModal.classList.remove("active");
      if (demoSuccess) demoSuccess.style.display = "none";
      if (demoForm) demoForm.style.display = "flex";
    });
  });

  demoModal?.addEventListener("click", (e) => {
    if (e.target === demoModal) {
      demoModal.classList.remove("active");
      if (demoSuccess) demoSuccess.style.display = "none";
      if (demoForm) demoForm.style.display = "flex";
    }
  });

  demoForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    demoForm.style.display = "none";
    demoSuccess.style.display = "block";
  });
}

// Mobile navigation drawer toggle
function initMobileMenu() {
  const btn = document.getElementById("mobile-menu-toggle");
  const links = document.getElementById("nav-links");

  btn?.addEventListener("click", () => {
    links.classList.toggle("open");
  });
}

// Main page initialization
document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initMonthGridSimulator();
  initRoiCalculator();
  initSolutionsTabs();
  initTourTabs();
  initPricingCalculator();
  initFaqAccordion();
  initModals();
  initMobileMenu();
});
