(function () {
  "use strict";

  const G = window.StoreGame;
  const STORAGE_KEY = "corner-store-game-v2";
  const money = value => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
  const el = id => document.getElementById(id);

  let state = loadState();
  let selectedShelf = null;
  let selectedFridgeProduct = null;
  let selectedProduct = null;
  let speed = 1;
  let toastTimer = null;
  let audioContext = null;
  let musicTimer = null;
  let soundEnabled = true;

  const ui = {
    store: el("storeScene"), storeSign: el("storeSign"), forecast: el("forecastPanel"), toggleForecast: el("toggleForecast"),
    day: el("dayValue"), cash: el("cashValue"), weather: el("weatherValue"), event: el("eventValue"),
    eventTip: el("eventTip"), customers: el("customersValue"), shelves: el("shelves"),
    warehouse: el("warehouseContent"), warehouseCard: el("warehouseCard"), fridge: el("fridgeCard"), fridgeSlots: el("fridgeSlots"), visitorList: el("visitorList"),
    activeCustomer: el("activeCustomer"), cashier: el("cashierCharacter"), register: el("registerDisplay"), status: el("statusText"),
    start: el("startDayButton"), speed: el("speedButton"), survey: el("surveyButton"), upgrades: el("upgradesButton"),
    reset: el("resetButton"), drawer: el("purchaseDrawer"), drawerBody: el("drawerBody"),
    drawerTitle: el("drawerTitle"), drawerBackdrop: el("drawerBackdrop"), closeDrawer: el("closeDrawer"),
    modalLayer: el("modalLayer"), modalCard: el("modalCard"), toast: el("toast"), sound: el("soundButton")
  };

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (saved && saved.version === 2 && Array.isArray(saved.shelves)) {
        saved.running = false;
        saved.fridgeUnlocked = Boolean(saved.fridgeUnlocked);
        saved.signUnlocked = Boolean(saved.signUnlocked);
        if (!saved.fridge) {
          saved.fridge = Object.fromEntries(G.CHILLED_PRODUCTS.map(id => [id, { id: `fridge-${id}`, productId: id, batches: [], refrigerated: true }]));
        }
        return saved;
      }
    } catch (_) {}
    return G.createInitialState();
  }

  function saveState() {
    if (!state.running) localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function productItems(product, count) {
    const visible = Math.min(count, 60);
    let html = Array.from({ length: visible }, (_, index) =>
      `<span class="product-item" style="--i:${index}" aria-hidden="true">${product.icon}</span>`
    ).join("");
    return html;
  }

  function ensureAudio() {
    if (!soundEnabled) return null;
    if (!audioContext) audioContext = new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === "suspended") audioContext.resume();
    if (!musicTimer) startMusic();
    return audioContext;
  }

  function tone(frequency, duration = .12, volume = .035, type = "sine", delay = 0) {
    const context = ensureAudio();
    if (!context) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime + delay;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .015);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  function startMusic() {
    if (!soundEnabled || musicTimer) return;
    const notes = [196, 247, 294, 247, 220, 262, 330, 262];
    let note = 0;
    const play = () => { if (soundEnabled) tone(notes[note++ % notes.length], .75, .007, "sine"); };
    musicTimer = setInterval(play, 1450);
    play();
  }

  function stopMusic() {
    clearInterval(musicTimer);
    musicTimer = null;
  }

  const sounds = {
    stock() { tone(540, .09, .025, "triangle"); tone(720, .11, .018, "triangle", .07); },
    register() { tone(880, .08, .04, "square"); tone(1180, .18, .028, "sine", .09); },
    sad() { tone(310, .18, .03, "triangle"); tone(220, .3, .026, "triangle", .16); },
    open() { [392, 523, 659].forEach((value, index) => tone(value, .2, .025, "triangle", index * .11)); },
    close() { [523, 392, 262].forEach((value, index) => tone(value, .24, .025, "triangle", index * .14)); }
  };

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
    ui.store.classList.toggle("has-sign", state.signUnlocked);
    ui.storeSign.textContent = state.signUnlocked ? "У МАРИНЫ · СВЕЖИЕ ПРОДУКТЫ" : "ПРОДУКТЫ · 24 ЧАСА";
    renderShelves();
    renderWarehouse();
    renderFridge();
    if ((selectedShelf !== null || selectedFridgeProduct) && ui.drawer.classList.contains("open")) renderDrawer();
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

  function renderFridge() {
    ui.fridge.classList.toggle("hidden", !state.fridgeUnlocked);
    if (!state.fridgeUnlocked) return;
    ui.fridgeSlots.innerHTML = G.CHILLED_PRODUCTS.map(id => {
      const product = G.PRODUCTS[id];
      const location = state.fridge[id];
      const count = G.shelfCount(location);
      return `<button class="fridge-slot" data-fridge="${id}" type="button" ${state.running ? "disabled" : ""}>
        <span>${product.icon}</span><b>${product.name}</b><small>${count} шт.<br>${count ? `${G.daysLeft(location)} дн.` : "Нажмите для закупки"}</small>
      </button>`;
    }).join("");
    ui.fridgeSlots.querySelectorAll("[data-fridge]").forEach(button => button.addEventListener("click", () => openFridgeDrawer(button.dataset.fridge)));
  }

  function openDrawer(index) {
    if (state.running) return;
    selectedShelf = index;
    selectedFridgeProduct = null;
    const shelf = state.shelves[index];
    selectedProduct = shelf.productId;
    ui.drawer.classList.add("open");
    ui.drawerBackdrop.classList.add("show");
    ui.drawer.setAttribute("aria-hidden", "false");
    renderDrawer();
  }

  function openFridgeDrawer(productId) {
    if (state.running || !state.fridgeUnlocked) return;
    selectedShelf = null;
    selectedFridgeProduct = productId;
    selectedProduct = productId;
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
    if (selectedFridgeProduct) {
      const product = G.PRODUCTS[selectedFridgeProduct];
      const location = state.fridge[selectedFridgeProduct];
      const current = G.shelfCount(location);
      ui.drawerTitle.textContent = "Холодильник";
      ui.drawerBody.innerHTML = `<p class="drawer-hint">Товар хранится вдвое дольше. Нажимайте на продукт, чтобы добавлять его по одной штуке.</p>
        <button class="tap-product" id="buyFridgeOne" type="button" ${state.cash < product.buy ? "disabled" : ""}><span>${product.icon}</span><b>${product.name}</b><small>+1 за ${money(product.buy)}</small></button>
        <div class="stock-summary"><span>Сейчас в холодильнике</span><strong>${current} шт.</strong><small>Срок хранения: ${product.shelfLife * 2} дней</small></div>
        <button class="drawer-secondary" id="removeFridgeOne" type="button" ${current < 1 ? "disabled" : ""}>− Убрать 1 товар</button>`;
      el("buyFridgeOne").addEventListener("click", () => {
        const result = G.buyForFridge(state, selectedFridgeProduct, 1);
        if (!result.ok) return showToast(result.error);
        sounds.stock(); render();
      });
      el("removeFridgeOne").addEventListener("click", () => {
        const result = G.removeOneFromFridge(state, selectedFridgeProduct);
        if (!result.ok) return showToast(result.error);
        render();
      });
      return;
    }

    const shelf = state.shelves[selectedShelf];
    const current = G.shelfCount(shelf);
    ui.drawerTitle.textContent = `Полка ${selectedShelf + 1}`;
    if (!selectedProduct) {
      const warehouseAction = state.warehouse
        ? `<button class="drawer-secondary full" id="returnWarehouse" type="button">↩ Вернуть со склада: ${G.PRODUCTS[state.warehouse.productId].icon} ${G.PRODUCTS[state.warehouse.productId].name}</button>` : "";
      ui.drawerBody.innerHTML = `<p class="drawer-hint">Выберите, какой товар поставить на эту полку.</p>
        ${warehouseAction}<div class="product-picker">${Object.values(G.PRODUCTS).map(product => `
          <button class="product-choice" type="button" data-product="${product.id}" ${state.cash < product.buy ? "disabled" : ""}>
            <span>${product.icon}</span><b>${product.name}</b><small>Нажмите: +1 за ${money(product.buy)}<br>Продажа ${money(product.sell)}</small>
          </button>`).join("")}</div>`;
      ui.drawerBody.querySelectorAll("[data-product]").forEach(button => button.addEventListener("click", () => {
        const productId = button.dataset.product;
        const result = G.buyForShelf(state, selectedShelf, productId, 1);
        if (!result.ok) return showToast(result.error);
        selectedProduct = productId;
        sounds.stock();
        render();
      }));
      const returnButton = el("returnWarehouse");
      if (returnButton) returnButton.addEventListener("click", () => {
        const result = G.moveWarehouseToShelf(state, selectedShelf);
        if (!result.ok) return showToast(result.error);
        selectedProduct = state.shelves[selectedShelf].productId;
        render();
      });
      return;
    }

    const product = G.PRODUCTS[selectedProduct];
    ui.drawerBody.innerHTML = `<p class="drawer-hint">Нажимайте на продукт, чтобы сразу добавлять по одной штуке на полку.</p>
      <button class="tap-product" id="buyOne" type="button" ${state.cash < product.buy ? "disabled" : ""}><span>${product.icon}</span><b>${product.name}</b><small>+1 за ${money(product.buy)}</small></button>
      <div class="stock-summary"><span>Остаток на полке</span><strong>${current} шт.</strong><small>Продажа ${money(product.sell)} · срок ${product.shelfLife} дней</small></div>
      <button class="drawer-secondary" id="removeOne" type="button">− Убрать 1 товар</button>
      <div class="danger-actions"><button id="moveWarehouse" type="button" ${state.warehouse ? "disabled" : ""}>📦 Убрать на склад</button><button id="discardShelf" type="button">🗑 Списать всё</button></div>`;

    el("buyOne").addEventListener("click", () => {
      const result = G.buyForShelf(state, selectedShelf, selectedProduct, 1);
      if (!result.ok) return showToast(result.error);
      sounds.stock();
      render();
    });
    el("removeOne").addEventListener("click", () => {
      const result = G.removeOneFromShelf(state, selectedShelf);
      if (!result.ok) return showToast(result.error);
      selectedProduct = state.shelves[selectedShelf].productId;
      render();
    });
    const move = el("moveWarehouse");
    if (move) move.addEventListener("click", () => {
      const result = G.moveShelfToWarehouse(state, selectedShelf);
      if (!result.ok) return showToast(result.error);
      selectedProduct = null; render(); renderDrawer();
    });
    const discard = el("discardShelf");
    if (discard) discard.addEventListener("click", () => showConfirm(
      `Списать ${current} шт. товара «${product.name}»? Деньги не возвращаются.`,
      () => { G.discardShelf(state, selectedShelf); selectedProduct = null; hideModal(); render(); renderDrawer(); }
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
    const items = [
      { id: "fridge", icon: "❄️", title: "Холодильник", text: "Три отделения: молоко, яйца и готовая еда хранятся вдвое дольше.", day: G.SETTINGS.fridgeUnlockDay, cost: G.SETTINGS.fridgeUpgradeCost, bought: state.fridgeUnlocked },
      { id: "sign", icon: "💡", title: "Яркая вывеска", text: "Привлекает примерно на 25% больше покупателей каждый день.", day: G.SETTINGS.signUnlockDay, cost: G.SETTINGS.signUpgradeCost, bought: state.signUnlocked },
      { id: "shelf", icon: "🗄️", title: "Новая полка", text: "Позволяет одновременно продавать ещё один вид товара.", day: G.SETTINGS.shelfUnlockDay, cost: G.SETTINGS.shelfUpgradeCost, bought: state.upgradedShelf }
    ];
    showModal(`<span class="modal-icon">🔧</span><span class="eyebrow">УЛУЧШЕНИЯ МАГАЗИНА</span><h2>Развивайте торговую точку</h2>
      <div class="upgrade-list">${items.map(item => {
        const unlocked = state.day >= item.day;
        return `<div class="upgrade-card ${unlocked ? "available" : "locked"}"><span class="upgrade-art">${item.icon}</span><div><h3>${item.title}</h3><p>${item.text} ${unlocked ? "" : `Откроется с дня ${item.day}.`}</p></div><button class="upgrade-buy" data-upgrade="${item.id}" ${!unlocked || item.bought || state.cash < item.cost ? "disabled" : ""}>${item.bought ? "Куплено" : money(item.cost)}</button></div>`;
      }).join("")}</div>
      <div class="modal-actions"><button class="modal-secondary" id="closeModal">Закрыть</button></div>`);
    el("closeModal").addEventListener("click", hideModal);
    ui.modalCard.querySelectorAll("[data-upgrade]").forEach(button => button.addEventListener("click", () => {
      const actions = { fridge: G.buyFridgeUpgrade, sign: G.buySignUpgrade, shelf: G.buyShelfUpgrade };
      const result = actions[button.dataset.upgrade](state);
      if (!result.ok) return showToast(result.error);
      sounds.stock();
      hideModal(); render();
      showToast(button.dataset.upgrade === "fridge" ? "Холодильник установлен!" : button.dataset.upgrade === "sign" ? "Новая вывеска уже привлекает покупателей!" : "В магазине появилась новая полка!");
    }));
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms / speed)); }

  async function animateCustomer(customer, position) {
    const profile = G.PROFILES[customer.profileId];
    const wishes = customer.basket.map(id => G.PRODUCTS[id].icon).join(" ");
    ui.activeCustomer.innerHTML = `<div class="wish-bubble"><small>Ищу</small><span>${wishes}</span></div>
      <div class="walking-person ${customer.profileId}">
        <b class="character-name">${profile.name}</b>
        <div class="character-head"><span>${profile.icon}</span></div>
        <div class="character-body"></div>
        <i class="character-arm left"></i><i class="character-arm right"></i>
        <i class="character-leg left"></i><i class="character-leg right"></i>
      </div>`;
    ui.activeCustomer.className = "active-customer";
    await sleep(60);
    ui.activeCustomer.className = "active-customer entering";
    await sleep(1850);
    ui.activeCustomer.className = "active-customer shopping";
    await sleep(1150);
    const result = G.serveCustomer(state, customer);
    renderShelves();
    renderFridge();
    ui.register.textContent = result.served ? money(result.revenue) : "Не купил";
    if (result.served) {
      ui.activeCustomer.className = "active-customer checkout happy";
      await sleep(1150);
      ui.cashier.classList.add("selling");
      sounds.register();
      await sleep(950);
      ui.cashier.classList.remove("selling");
    } else {
      ui.activeCustomer.className = "active-customer shopping sad";
      sounds.sad();
      await sleep(750);
    }
    addVisitorToLog(result, position);
    ui.activeCustomer.className = "active-customer leaving";
    await sleep(850);
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
    const stock = Object.keys(G.PRODUCTS).reduce((sum, id) => sum + G.totalInventory(state, id), 0);
    if (!stock) return showToast("Сначала поставьте хотя бы один товар на полку");
    closeDrawer();
    ensureAudio();
    sounds.open();
    ui.store.classList.remove("night");
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
    ui.store.classList.add("night");
    sounds.close();
    ui.status.textContent = "День завершён. Изучите итоги и подготовьтесь к завтра.";
    await sleep(650);
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
    else el("closeModal").addEventListener("click", () => { hideModal(); ui.store.classList.remove("night"); });
  }

  function resetGame() {
    state = G.createInitialState();
    selectedShelf = null;
    selectedFridgeProduct = null;
    selectedProduct = null;
    localStorage.removeItem(STORAGE_KEY);
    hideModal(); closeDrawer();
    ui.visitorList.innerHTML = `<span class="empty-visitors">Магазин ещё закрыт</span>`;
    ui.status.textContent = "Подготовьте полки и откройте магазин";
    ui.register.textContent = "0 ₽";
    ui.store.classList.remove("night");
    render();
  }

  ui.closeDrawer.addEventListener("click", closeDrawer);
  ui.drawerBackdrop.addEventListener("click", closeDrawer);
  ui.start.addEventListener("click", startDay);
  ui.survey.addEventListener("click", survey);
  ui.upgrades.addEventListener("click", upgrades);
  ui.sound.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    if (soundEnabled) {
      ui.sound.textContent = "🔊 Музыка";
      ensureAudio();
      sounds.stock();
    } else {
      ui.sound.textContent = "🔇 Без звука";
      stopMusic();
      if (audioContext && audioContext.state === "running") audioContext.suspend();
    }
  });
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
