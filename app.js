(function () {
  "use strict";

  const G = window.StoreGame;
  const STORAGE_KEY = "corner-store-game-v2";
  const money = value => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
  const el = id => document.getElementById(id);

  let state = loadState();
  let selectedShelf = null;
  let selectedProduct = null;
  let targetQty = 0;
  let speed = 1;
  let toastTimer = null;

  const ui = {
    store: el("storeScene"), forecast: el("forecastPanel"), toggleForecast: el("toggleForecast"),
    day: el("dayValue"), cash: el("cashValue"), weather: el("weatherValue"), event: el("eventValue"),
    eventTip: el("eventTip"), customers: el("customersValue"), shelves: el("shelves"),
    warehouse: el("warehouseContent"), warehouseCard: el("warehouseCard"), visitorList: el("visitorList"),
    activeCustomer: el("activeCustomer"), register: el("registerDisplay"), status: el("statusText"),
    start: el("startDayButton"), speed: el("speedButton"), survey: el("surveyButton"), upgrades: el("upgradesButton"),
    reset: el("resetButton"), drawer: el("purchaseDrawer"), drawerBody: el("drawerBody"),
    drawerTitle: el("drawerTitle"), drawerBackdrop: el("drawerBackdrop"), closeDrawer: el("closeDrawer"),
    modalLayer: el("modalLayer"), modalCard: el("modalCard"), toast: el("toast")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === 2 && Array.isArray(saved.shelves)) {
        saved.running = false;
        return saved;
      }
    } catch (_) {}
    return G.createInitialState();
  }

  function saveState() {
    if (!state.running) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function productItems(product, count) {
    const visible = Math.min(count, 36);
    let html = Array.from({ length: visible }, (_, index) =>
      `<span class="product-item" style="--i:${index}" aria-hidden="true">${product.icon}</span>`
    ).join("");
    if (count > visible) html += `<span class="overflow-count">+${count - visible}</span>`;
    return html;
  }

  function render() {
    const weather = G.WEATHERS.find(item => item.id === state.forecast.weatherId);
    const event = G.EVENTS.find(item => item.id === state.forecast.eventId);
    ui.day.textContent = state.day;
    ui.cash.textContent = money(state.cash);
    ui.cash.classList.toggle("danger", state.cash < 0);
    ui.weather.textContent = weather.name;
    ui.event.textContent = event.name;
    ui.eventTip.textContent = event.tip;
    ui.customers.textContent = `${state.forecast.expectedMin}–${state.forecast.expectedMax} человек`;
    ui.start.disabled = state.running || state.cash < 0;
    ui.survey.disabled = state.running || state.surveyDay === state.day || state.cash < G.SETTINGS.surveyCost;
    ui.survey.textContent = state.surveyDay === state.day ? "📋 Опрос куплен" : `📋 Опрос · ${money(G.SETTINGS.surveyCost)}`;
    ui.upgrades.disabled = state.running;
    renderShelves();
    renderWarehouse();
    if (selectedShelf !== null && ui.drawer.classList.contains("open")) renderDrawer();
    saveState();
  }

  function renderShelves() {
    ui.shelves.innerHTML = state.shelves.map((shelf, index) => {
      const product = shelf.productId ? G.PRODUCTS[shelf.productId] : null;
      const count = G.shelfCount(shelf);
      const life = G.daysLeft(shelf);
      return `<button class="shelf ${product ? "stocked" : "empty"}" type="button" data-shelf="${index}" ${state.running ? "disabled" : ""}>
        <span class="shelf-number">ПОЛКА ${index + 1}</span>
        <span class="shelf-action">＋</span>
        <span class="shelf-label">${product ? `${product.icon} ${product.name}` : "Свободная полка"}</span>
        <span class="shelf-life">${product ? `Хватит ещё на ${life} дн.` : "Нажмите, чтобы поставить товар"}</span>
        <span class="product-grid">${product ? productItems(product, count) : "<i class='empty-crate'></i>"}</span>
        <span class="shelf-count">${product ? `${count} шт.` : ""}</span>
      </button>`;
    }).join("");

    ui.shelves.querySelectorAll("[data-shelf]").forEach(button => {
      button.addEventListener("click", () => openDrawer(Number(button.dataset.shelf)));
    });
  }

  function renderWarehouse() {
    if (!state.warehouse) {
      ui.warehouse.innerHTML = `<span class="warehouse-empty">📦</span><small>Свободно</small>`;
      ui.warehouseCard.classList.remove("occupied");
      return;
    }
    const product = G.PRODUCTS[state.warehouse.productId];
    const count = G.shelfCount(state.warehouse);
    ui.warehouse.innerHTML = `<b>${product.icon} ${product.name}</b><small>${count} шт. · ${G.daysLeft(state.warehouse)} дн.</small>`;
    ui.warehouseCard.classList.add("occupied");
  }

  function openDrawer(index) {
    if (state.running) return;
    selectedShelf = index;
    const shelf = state.shelves[index];
    selectedProduct = shelf.productId;
    targetQty = G.shelfCount(shelf);
    ui.drawer.classList.add("open");
    ui.drawerBackdrop.classList.add("show");
    ui.drawer.setAttribute("aria-hidden", "false");
    renderDrawer();
  }

  function closeDrawer() {
    ui.drawer.classList.remove("open");
    ui.drawerBackdrop.classList.remove("show");
    ui.drawer.setAttribute("aria-hidden", "true");
  }

  function renderDrawer() {
    const shelf = state.shelves[selectedShelf];
    const current = G.shelfCount(shelf);
    ui.drawerTitle.textContent = `Полка ${selectedShelf + 1}`;
    if (!selectedProduct) {
      const warehouseAction = state.warehouse
        ? `<button class="drawer-secondary full" id="returnWarehouse" type="button">↩ Вернуть со склада: ${G.PRODUCTS[state.warehouse.productId].icon} ${G.PRODUCTS[state.warehouse.productId].name}</button>` : "";
      ui.drawerBody.innerHTML = `<p class="drawer-hint">Выберите, какой товар поставить на эту полку.</p>
        ${warehouseAction}<div class="product-picker">${Object.values(G.PRODUCTS).map(product => `
          <button class="product-choice" type="button" data-product="${product.id}">
            <span>${product.icon}</span><b>${product.name}</b><small>Закупка ${money(product.buy)}<br>Продажа ${money(product.sell)}</small>
          </button>`).join("")}</div>`;
      ui.drawerBody.querySelectorAll("[data-product]").forEach(button => button.addEventListener("click", () => {
        selectedProduct = button.dataset.product;
        targetQty = 0;
        renderDrawer();
      }));
      const returnButton = el("returnWarehouse");
      if (returnButton) returnButton.addEventListener("click", () => {
        const result = G.moveWarehouseToShelf(state, selectedShelf);
        if (!result.ok) return showToast(result.error);
        selectedProduct = state.shelves[selectedShelf].productId;
        targetQty = G.shelfCount(state.shelves[selectedShelf]);
        render();
      });
      return;
    }

    const product = G.PRODUCTS[selectedProduct];
    const addQty = Math.max(0, targetQty - current);
    const cost = addQty * product.buy;
    ui.drawerBody.innerHTML = `<button class="back-product" id="backProduct" type="button" ${shelf.productId ? "disabled" : ""}>← Другой товар</button>
      <div class="selected-product"><span>${product.icon}</span><div><h3>${product.name}</h3><p>Закупка ${money(product.buy)} · продажа ${money(product.sell)}<br>Срок годности: ${product.shelfLife} дней</p></div></div>
      <div class="target-box">
        <span>Будет на полке</span>
        <div class="stepper"><button id="minusOne" type="button">−</button><strong id="targetValue">${targetQty}</strong><button id="plusOne" type="button">+</button></div>
        <div class="quick-add"><button data-add="5" type="button">+5</button><button data-add="10" type="button">+10</button><button data-add="20" type="button">+20</button></div>
        <small>Остаток с прошлого дня: ${current} шт.</small>
      </div>
      <div class="purchase-total"><span>Докупить ${addQty} шт.</span><strong>${money(cost)}</strong></div>
      <button class="drawer-primary" id="buyButton" type="button" ${addQty < 1 || cost > state.cash ? "disabled" : ""}>Поставить на полку</button>
      ${shelf.productId ? `<div class="danger-actions"><button id="moveWarehouse" type="button" ${state.warehouse ? "disabled" : ""}>📦 Убрать на склад</button><button id="discardShelf" type="button">🗑 Списать всё</button></div>` : ""}`;

    el("backProduct").addEventListener("click", () => { selectedProduct = null; targetQty = 0; renderDrawer(); });
    el("minusOne").addEventListener("click", () => { targetQty = Math.max(current, targetQty - 1); renderDrawer(); });
    el("plusOne").addEventListener("click", () => { targetQty += 1; renderDrawer(); });
    ui.drawerBody.querySelectorAll("[data-add]").forEach(button => button.addEventListener("click", () => { targetQty += Number(button.dataset.add); renderDrawer(); }));
    el("buyButton").addEventListener("click", () => {
      const result = G.buyForShelf(state, selectedShelf, selectedProduct, targetQty - current);
      if (!result.ok) return showToast(result.error);
      showToast(`Закупка: −${money(result.cost)}`);
      closeDrawer();
      render();
    });
    const move = el("moveWarehouse");
    if (move) move.addEventListener("click", () => {
      const result = G.moveShelfToWarehouse(state, selectedShelf);
      if (!result.ok) return showToast(result.error);
      selectedProduct = null; targetQty = 0; render(); renderDrawer();
    });
    const discard = el("discardShelf");
    if (discard) discard.addEventListener("click", () => showConfirm(
      `Списать ${current} шт. товара «${product.name}»? Деньги не возвращаются.`,
      () => { G.discardShelf(state, selectedShelf); selectedProduct = null; targetQty = 0; hideModal(); render(); renderDrawer(); }
    ));
  }

  function showToast(text) {
    clearTimeout(toastTimer);
    ui.toast.textContent = text;
    ui.toast.classList.add("show");
    toastTimer = setTimeout(() => ui.toast.classList.remove("show"), 2600);
  }

  function showModal(html) {
    ui.modalCard.innerHTML = html;
    ui.modalLayer.classList.remove("hidden");
  }

  function hideModal() {
    ui.modalLayer.classList.add("hidden");
    ui.modalCard.innerHTML = "";
  }

  function showConfirm(message, action) {
    showModal(`<span class="modal-icon">⚠️</span><h2>Подтверждение</h2><p>${message}</p><div class="modal-actions"><button class="modal-secondary" id="cancelModal">Отмена</button><button class="modal-primary danger-button" id="confirmModal">Продолжить</button></div>`);
    el("cancelModal").addEventListener("click", hideModal);
    el("confirmModal").addEventListener("click", action);
  }

  function survey() {
    const result = G.buySurvey(state);
    if (!result.ok) return showToast(result.error);
    render();
    showModal(`<span class="modal-icon">📋</span><span class="eyebrow">СОЦИОЛОГИЧЕСКИЙ ОПРОС</span><h2>Что любят жители района</h2><div class="survey-results">${result.profiles.map(id => {
      const profile = G.PROFILES[id];
      return `<div><strong>${profile.icon} ${profile.name}</strong><p>${profile.preferences.slice(0, 3).map(productId => `${G.PRODUCTS[productId].icon} ${G.PRODUCTS[productId].name}`).join(" · ")}</p></div>`;
    }).join("")}</div><p class="fine-print">Корзины меняются каждый день — это самые частые, но не гарантированные покупки.</p><button class="modal-primary" id="closeModal">Понятно</button>`);
    el("closeModal").addEventListener("click", hideModal);
  }

  function upgrades() {
    const unlocked = state.day >= G.SETTINGS.shelfUnlockDay;
    const bought = state.upgradedShelf;
    showModal(`<span class="modal-icon">🔧</span><span class="eyebrow">УЛУЧШЕНИЯ МАГАЗИНА</span><h2>Развивайте торговую точку</h2>
      <div class="upgrade-card ${unlocked ? "available" : "locked"}"><span class="upgrade-art">🗄️</span><div><h3>Новая полка</h3><p>Ещё один вид товара одновременно. ${unlocked ? "Доступно для покупки." : "Откроется после пяти завершённых дней."}</p></div><strong>${bought ? "Куплено" : money(G.SETTINGS.shelfUpgradeCost)}</strong></div>
      <div class="modal-actions"><button class="modal-secondary" id="closeModal">Закрыть</button><button class="modal-primary" id="buyUpgrade" ${!unlocked || bought || state.cash < G.SETTINGS.shelfUpgradeCost ? "disabled" : ""}>${bought ? "Уже установлена" : "Купить полку"}</button></div>`);
    el("closeModal").addEventListener("click", hideModal);
    el("buyUpgrade").addEventListener("click", () => {
      const result = G.buyShelfUpgrade(state);
      if (!result.ok) return showToast(result.error);
      hideModal(); render(); showToast("В магазине появилась новая полка!");
    });
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms / speed)); }

  async function animateCustomer(customer, position) {
    const profile = G.PROFILES[customer.profileId];
    ui.activeCustomer.innerHTML = `<div class="walking-person"><span>${profile.icon}</span><i></i><i></i><b>${profile.name}</b></div>`;
    ui.activeCustomer.className = "active-customer walking";
    await sleep(1500);
    ui.activeCustomer.className = "active-customer shopping";
    await sleep(900);
    const result = G.serveCustomer(state, customer);
    renderShelves();
    ui.register.textContent = result.served ? money(result.revenue) : "Не купил";
    ui.activeCustomer.className = `active-customer checkout ${result.served ? "happy" : "sad"}`;
    await sleep(800);
    addVisitorToLog(result, position);
    ui.activeCustomer.className = "active-customer leaving";
    await sleep(550);
    ui.activeCustomer.innerHTML = "";
    return result;
  }

  function addVisitorToLog(result, position) {
    if (position === 0) ui.visitorList.innerHTML = "";
    const profile = G.PROFILES[result.profileId];
    const card = document.createElement("div");
    card.className = `visitor-chip ${result.served ? "served" : "lost"}`;
    const boughtText = result.bought.length ? result.bought.map(id => G.PRODUCTS[id].name).join(", ") : "ничего";
    const missedText = result.missed.length ? ` Не нашёл: ${result.missed.map(id => G.PRODUCTS[id].name).join(", ")}.` : "";
    card.title = `${profile.name}. Купил: ${boughtText}.${missedText}`;
    card.innerHTML = `<span>${profile.icon}</span><i>${result.served ? "✓" : "×"}</i>`;
    ui.visitorList.appendChild(card);
  }

  async function startDay() {
    if (state.running) return;
    const stock = state.shelves.reduce((sum, shelf) => sum + G.shelfCount(shelf), 0);
    if (!stock) return showToast("Сначала поставьте хотя бы один товар на полку");
    closeDrawer();
    state.running = true;
    speed = 1;
    ui.speed.textContent = "⏩ Ускорить ×3";
    ui.speed.classList.remove("hidden");
    ui.start.disabled = true;
    ui.survey.disabled = true;
    ui.upgrades.disabled = true;
    ui.visitorList.innerHTML = `<span class="empty-visitors">Первые покупатели уже идут…</span>`;
    ui.status.textContent = "Магазин открыт — покупатели приходят по одному";
    const customers = G.generateDayCustomers(state);
    const results = [];
    for (let index = 0; index < customers.length; index += 1) {
      ui.status.textContent = `Покупатель ${index + 1} из ${customers.length}`;
      results.push(await animateCustomer(customers[index], index));
      if (state.cash < -100000) break;
    }
    ui.activeCustomer.innerHTML = "";
    ui.register.textContent = "Закрыто";
    ui.speed.classList.add("hidden");
    const report = G.finishDay(state, results);
    render();
    ui.status.textContent = "День завершён. Изучите итоги и подготовьтесь к завтра.";
    showDayReport(report);
  }

  function rowsForMap(map) {
    const entries = Object.entries(map);
    if (!entries.length) return `<p class="empty-report">Нет</p>`;
    return entries.map(([id, qty]) => `<div class="report-product"><span>${G.PRODUCTS[id].icon} ${G.PRODUCTS[id].name}</span><strong>${qty} шт.</strong></div>`).join("");
  }

  function showDayReport(report) {
    const bankrupt = report.cash < 0;
    showModal(`<span class="modal-icon">${bankrupt ? "💸" : "🌙"}</span><span class="eyebrow">ИТОГИ ДНЯ ${report.day}</span><h2>${bankrupt ? "Касса опустела" : "Магазин закрыт"}</h2>
      <div class="report-grid"><div><span>Пришло</span><strong>${report.visitors}</strong></div><div><span>Обслужено</span><strong>${report.served}</strong></div><div><span>Ушли без покупки</span><strong>${report.lost}</strong></div><div><span>Часть корзины не нашли</span><strong>${report.partial}</strong></div></div>
      <div class="finance-lines"><div><span>Выручка</span><b class="positive">+${money(report.revenue)}</b></div><div><span>Ежедневные расходы</span><b>−${money(report.expense)}</b></div><div class="finance-total"><span>Результат дня</span><b class="${report.result >= 0 ? "positive" : "negative"}">${report.result >= 0 ? "+" : ""}${money(report.result)}</b></div></div>
      <div class="report-columns"><section><h3>Продано</h3>${rowsForMap(report.sold)}</section><section><h3>Испортилось</h3>${rowsForMap(report.spoiled)}</section></div>
      <p class="cash-after">В кассе: <strong>${money(report.cash)}</strong></p>
      ${bankrupt ? `<p class="bankrupt-note">Вы банкрот. Начните новую партию и закупайте осторожнее.</p><button class="modal-primary" id="restartFromReport">Новая игра</button>` : `<button class="modal-primary" id="closeModal">Перейти к утру ${state.day}</button>`}`);
    if (bankrupt) el("restartFromReport").addEventListener("click", resetGame);
    else el("closeModal").addEventListener("click", hideModal);
  }

  function resetGame() {
    state = G.createInitialState();
    selectedShelf = null;
    selectedProduct = null;
    localStorage.removeItem(STORAGE_KEY);
    hideModal(); closeDrawer();
    ui.visitorList.innerHTML = `<span class="empty-visitors">Магазин ещё закрыт</span>`;
    ui.status.textContent = "Подготовьте полки и откройте магазин";
    ui.register.textContent = "0 ₽";
    render();
  }

  ui.closeDrawer.addEventListener("click", closeDrawer);
  ui.drawerBackdrop.addEventListener("click", closeDrawer);
  ui.start.addEventListener("click", startDay);
  ui.survey.addEventListener("click", survey);
  ui.upgrades.addEventListener("click", upgrades);
  ui.speed.addEventListener("click", () => {
    speed = speed === 1 ? 3 : 1;
    ui.speed.textContent = speed === 1 ? "⏩ Ускорить ×3" : "▶ Обычная скорость";
  });
  ui.reset.addEventListener("click", () => showConfirm("Начать новую партию? Текущий прогресс будет удалён.", resetGame));
  ui.toggleForecast.addEventListener("click", () => {
    ui.forecast.classList.toggle("collapsed");
    ui.toggleForecast.textContent = ui.forecast.classList.contains("collapsed") ? "⌄" : "⌃";
    ui.toggleForecast.setAttribute("aria-label", ui.forecast.classList.contains("collapsed") ? "Развернуть сведения" : "Свернуть сведения");
  });
  ui.warehouseCard.addEventListener("click", () => {
    if (!state.warehouse || state.running) return;
    const emptyIndex = state.shelves.findIndex(shelf => !shelf.productId);
    if (emptyIndex === -1) return showToast("Нужна свободная полка, чтобы вернуть товар со склада");
    openDrawer(emptyIndex);
  });

  render();
})();
