(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.StoreGame = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const PRODUCTS = {
    bread:   { id: "bread", name: "Хлеб", icon: "🥖", buy: 24, sell: 45, shelfLife: 5 },
    milk:    { id: "milk", name: "Молоко", icon: "🥛", buy: 42, sell: 72, shelfLife: 5 },
    apples:  { id: "apples", name: "Яблоки", icon: "🍎", buy: 20, sell: 48, shelfLife: 8 },
    ready:   { id: "ready", name: "Готовая еда", icon: "🍱", buy: 85, sell: 145, shelfLife: 4 },
    energy:  { id: "energy", name: "Энергетики", icon: "🥤", buy: 65, sell: 120, shelfLife: 10 },
    eggs:    { id: "eggs", name: "Яйца", icon: "🥚", buy: 55, sell: 92, shelfLife: 8 },
    chicken: { id: "chicken", name: "Курица", icon: "🍗", buy: 115, sell: 190, shelfLife: 5 },
    chips:   { id: "chips", name: "Чипсы", icon: "🍟", buy: 45, sell: 90, shelfLife: 14 }
  };

  const PROFILES = {
    students: { name: "Студенты", icon: "🧑‍🎓", weight: 25, min: 1, max: 3, preferences: ["energy", "chips", "ready", "bread", "apples"] },
    families: { name: "Семьи", icon: "👩‍👧", weight: 32, min: 2, max: 5, preferences: ["milk", "eggs", "apples", "chicken", "bread"] },
    workers:  { name: "Офисные сотрудники", icon: "🧑‍💼", weight: 28, min: 1, max: 3, preferences: ["ready", "energy", "bread", "chicken", "apples"] },
    seniors:  { name: "Пенсионеры", icon: "🧓", weight: 15, min: 1, max: 4, preferences: ["bread", "milk", "apples", "eggs", "chicken"] }
  };

  const WEATHERS = [
    { id: "mild", name: "🌤️ Тепло", factor: 1.05, boosts: { apples: 1.2, energy: 1.1 } },
    { id: "rain", name: "🌧️ Дождь", factor: 0.78, boosts: { ready: 1.25, milk: 1.1 } },
    { id: "cold", name: "❄️ Холодно", factor: 0.9, boosts: { bread: 1.25, chicken: 1.2, milk: 1.1 } },
    { id: "hot", name: "☀️ Жарко", factor: 1.15, boosts: { energy: 1.5, apples: 1.25, milk: 0.8 } },
    { id: "cloudy", name: "☁️ Облачно", factor: 1, boosts: {} }
  ];

  const EVENTS = [
    { id: "none", name: "Обычный день", factor: 1, tip: "Ничего необычного: спрос определяют район и погода.", boosts: {} },
    { id: "match", name: "⚽ Матч вечером", factor: 1.35, tip: "Больше молодых покупателей. Чаще ищут снеки и энергетики.", boosts: { chips: 1.7, energy: 1.5, ready: 1.2 }, profile: "students" },
    { id: "fair", name: "🎈 Районная ярмарка", factor: 1.75, tip: "Сильный поток семей. Растёт спрос на еду, яблоки и напитки.", boosts: { apples: 1.45, ready: 1.35, milk: 1.2 }, profile: "families" },
    { id: "payday", name: "💳 День зарплаты", factor: 1.25, tip: "Покупателей больше, корзины немного крупнее обычного.", boosts: { chicken: 1.35, ready: 1.2 }, basketBonus: 1 },
    { id: "roadwork", name: "🚧 Ремонт дороги", factor: 0.58, tip: "До магазина сложнее дойти: поток покупателей заметно ниже.", boosts: {} },
    { id: "college", name: "🎓 Праздник колледжа", factor: 1.55, tip: "Рядом много студентов. Хорошо продаются готовая еда, чипсы и энергетики.", boosts: { ready: 1.55, chips: 1.5, energy: 1.65 }, profile: "students" }
  ];

  const SETTINGS = {
    startingCash: 4500,
    dailyExpense: 420,
    surveyCost: 450,
    shelfUpgradeCost: 7000,
    shelfUnlockDay: 6,
    startingShelves: 5,
    maxShelves: 6
  };

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function integer(rng, min, max) {
    return Math.floor(rng() * (max - min + 1)) + min;
  }

  function weightedPick(rng, entries) {
    const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
    let cursor = rng() * total;
    for (const entry of entries) {
      cursor -= entry.weight;
      if (cursor <= 0) return entry.value;
    }
    return entries[entries.length - 1].value;
  }

  function emptyShelf(index) {
    return { id: `shelf-${index + 1}`, productId: null, batches: [] };
  }

  function createInitialState(seed) {
    const baseSeed = Number.isFinite(seed) ? seed : Date.now() % 2147483647;
    const state = {
      version: 2,
      seed: baseSeed,
      day: 1,
      cash: SETTINGS.startingCash,
      shelves: Array.from({ length: SETTINGS.startingShelves }, (_, index) => emptyShelf(index)),
      warehouse: null,
      upgradedShelf: false,
      surveyDay: null,
      surveyProfiles: [],
      running: false,
      history: [],
      forecast: null
    };
    state.forecast = createForecast(state);
    return state;
  }

  function createForecast(state) {
    const rng = mulberry32(state.seed + state.day * 7919);
    const weather = WEATHERS[integer(rng, 0, WEATHERS.length - 1)];
    const eventRoll = rng();
    let event;
    if (eventRoll < 0.44) event = EVENTS[0];
    else event = EVENTS[integer(rng, 1, EVENTS.length - 1)];
    const base = integer(rng, 14, 25);
    const exactCustomers = Math.max(7, Math.round(base * weather.factor * event.factor + integer(rng, -3, 3)));
    const spread = exactCustomers > 30 ? 5 : 3;
    return {
      weatherId: weather.id,
      eventId: event.id,
      exactCustomers,
      expectedMin: Math.max(5, exactCustomers - spread),
      expectedMax: exactCustomers + spread
    };
  }

  function shelfCount(shelf) {
    return (shelf && shelf.batches || []).reduce((sum, batch) => sum + batch.qty, 0);
  }

  function totalInventory(state, productId) {
    let total = 0;
    for (const shelf of state.shelves) if (shelf.productId === productId) total += shelfCount(shelf);
    if (state.warehouse && state.warehouse.productId === productId) total += shelfCount(state.warehouse);
    return total;
  }

  function buyForShelf(state, shelfIndex, productId, quantity) {
    const shelf = state.shelves[shelfIndex];
    const product = PRODUCTS[productId];
    const qty = Math.max(0, Math.floor(quantity));
    if (!shelf || !product || qty < 1) return { ok: false, error: "Некорректная закупка" };
    if (state.running) return { ok: false, error: "Во время дня закупка закрыта" };
    if (shelf.productId && shelf.productId !== productId) return { ok: false, error: "На полке уже другой товар" };
    const cost = product.buy * qty;
    if (cost > state.cash) return { ok: false, error: "Не хватает денег" };
    shelf.productId = productId;
    const fresh = shelf.batches.find(batch => batch.age === 0);
    if (fresh) fresh.qty += qty;
    else shelf.batches.push({ qty, age: 0 });
    state.cash -= cost;
    return { ok: true, cost };
  }

  function moveShelfToWarehouse(state, shelfIndex) {
    const shelf = state.shelves[shelfIndex];
    if (!shelf || !shelf.productId || shelfCount(shelf) === 0) return { ok: false, error: "Полка пустая" };
    if (state.warehouse) return { ok: false, error: "Склад уже занят" };
    if (state.running) return { ok: false, error: "Дождитесь закрытия магазина" };
    state.warehouse = { productId: shelf.productId, batches: shelf.batches.map(batch => ({ ...batch })) };
    shelf.productId = null;
    shelf.batches = [];
    return { ok: true };
  }

  function moveWarehouseToShelf(state, shelfIndex) {
    const shelf = state.shelves[shelfIndex];
    if (!state.warehouse) return { ok: false, error: "Склад пуст" };
    if (!shelf || shelf.productId || shelfCount(shelf)) return { ok: false, error: "Освободите полку" };
    if (state.running) return { ok: false, error: "Дождитесь закрытия магазина" };
    shelf.productId = state.warehouse.productId;
    shelf.batches = state.warehouse.batches.map(batch => ({ ...batch }));
    state.warehouse = null;
    return { ok: true };
  }

  function discardShelf(state, shelfIndex) {
    const shelf = state.shelves[shelfIndex];
    if (!shelf || !shelf.productId) return { ok: false, error: "Полка уже пустая" };
    if (state.running) return { ok: false, error: "Дождитесь закрытия магазина" };
    const discarded = shelfCount(shelf);
    const productId = shelf.productId;
    shelf.productId = null;
    shelf.batches = [];
    return { ok: true, discarded, productId };
  }

  function takeOne(state, productId) {
    const shelf = state.shelves.find(item => item.productId === productId && shelfCount(item) > 0);
    if (!shelf) return false;
    shelf.batches.sort((a, b) => b.age - a.age);
    shelf.batches[0].qty -= 1;
    shelf.batches = shelf.batches.filter(batch => batch.qty > 0);
    if (!shelf.batches.length) {
      shelf.productId = null;
    }
    return true;
  }

  function profileWeights(event) {
    return Object.entries(PROFILES).map(([id, profile]) => ({
      value: id,
      weight: profile.weight * (event.profile === id ? 1.8 : 1)
    }));
  }

  function generateBasket(rng, profile, weather, event) {
    const wanted = [];
    const size = Math.min(profile.max + (event.basketBonus || 0), integer(rng, profile.min, profile.max) + (event.basketBonus || 0));
    const candidates = profile.preferences.map((productId, rank) => {
      const boost = (weather.boosts[productId] || 1) * (event.boosts[productId] || 1);
      return { value: productId, weight: Math.max(0.25, (6 - rank) * boost) };
    });
    while (wanted.length < size && wanted.length < candidates.length) {
      const available = candidates.filter(item => !wanted.includes(item.value));
      wanted.push(weightedPick(rng, available));
    }
    return wanted;
  }

  function generateDayCustomers(state) {
    const forecast = state.forecast || createForecast(state);
    const rng = mulberry32(state.seed + state.day * 104729 + 17);
    const weather = WEATHERS.find(item => item.id === forecast.weatherId);
    const event = EVENTS.find(item => item.id === forecast.eventId);
    const weights = profileWeights(event);
    return Array.from({ length: forecast.exactCustomers }, (_, index) => {
      const profileId = weightedPick(rng, weights);
      const profile = PROFILES[profileId];
      return {
        id: `${state.day}-${index + 1}`,
        profileId,
        icon: profile.icon,
        basket: generateBasket(rng, profile, weather, event)
      };
    });
  }

  function serveCustomer(state, customer) {
    const bought = [];
    const missed = [];
    let revenue = 0;
    for (const productId of customer.basket) {
      if (takeOne(state, productId)) {
        bought.push(productId);
        revenue += PRODUCTS[productId].sell;
      } else missed.push(productId);
    }
    const served = bought.length > 0;
    return { ...customer, bought, missed, served, revenue };
  }

  function ageAndSpoil(state) {
    const spoiled = {};
    const locations = [...state.shelves, state.warehouse].filter(Boolean);
    for (const location of locations) {
      if (!location.productId) continue;
      const product = PRODUCTS[location.productId];
      for (const batch of location.batches) batch.age += 1;
      const expired = location.batches.filter(batch => batch.age >= product.shelfLife);
      const qty = expired.reduce((sum, batch) => sum + batch.qty, 0);
      if (qty) spoiled[location.productId] = (spoiled[location.productId] || 0) + qty;
      location.batches = location.batches.filter(batch => batch.age < product.shelfLife);
      if (!location.batches.length) location.productId = null;
    }
    if (state.warehouse && !state.warehouse.productId) state.warehouse = null;
    return spoiled;
  }

  function finishDay(state, results) {
    const revenue = results.reduce((sum, result) => sum + result.revenue, 0);
    const sold = {};
    results.forEach(result => result.bought.forEach(id => { sold[id] = (sold[id] || 0) + 1; }));
    state.cash += revenue - SETTINGS.dailyExpense;
    const spoiled = ageAndSpoil(state);
    const report = {
      day: state.day,
      visitors: results.length,
      served: results.filter(result => result.served).length,
      lost: results.filter(result => !result.served).length,
      partial: results.filter(result => result.served && result.missed.length).length,
      revenue,
      expense: SETTINGS.dailyExpense,
      result: revenue - SETTINGS.dailyExpense,
      sold,
      spoiled,
      cash: state.cash
    };
    state.history.push(report);
    state.day += 1;
    state.running = false;
    state.surveyDay = null;
    state.surveyProfiles = [];
    state.forecast = createForecast(state);
    return report;
  }

  function buySurvey(state) {
    if (state.running) return { ok: false, error: "Опрос доступен только утром" };
    if (state.surveyDay === state.day) return { ok: false, error: "Опрос на сегодня уже куплен" };
    if (state.cash < SETTINGS.surveyCost) return { ok: false, error: "Не хватает денег" };
    const rng = mulberry32(state.seed + state.day * 65537 + 91);
    const ids = Object.keys(PROFILES);
    const first = ids.splice(integer(rng, 0, ids.length - 1), 1)[0];
    const second = ids.splice(integer(rng, 0, ids.length - 1), 1)[0];
    state.cash -= SETTINGS.surveyCost;
    state.surveyDay = state.day;
    state.surveyProfiles = [first, second];
    return { ok: true, profiles: state.surveyProfiles };
  }

  function buyShelfUpgrade(state) {
    if (state.upgradedShelf) return { ok: false, error: "Дополнительная полка уже куплена" };
    if (state.day < SETTINGS.shelfUnlockDay) return { ok: false, error: "Станет доступно после пяти завершённых дней" };
    if (state.cash < SETTINGS.shelfUpgradeCost) return { ok: false, error: "Не хватает денег" };
    state.cash -= SETTINGS.shelfUpgradeCost;
    state.upgradedShelf = true;
    state.shelves.push(emptyShelf(state.shelves.length));
    return { ok: true };
  }

  function daysLeft(location) {
    if (!location || !location.productId || !location.batches.length) return null;
    const oldest = Math.max(...location.batches.map(batch => batch.age));
    return Math.max(0, PRODUCTS[location.productId].shelfLife - oldest);
  }

  return {
    PRODUCTS, PROFILES, WEATHERS, EVENTS, SETTINGS,
    createInitialState, createForecast, generateDayCustomers, serveCustomer, finishDay,
    shelfCount, totalInventory, buyForShelf, moveShelfToWarehouse, moveWarehouseToShelf,
    discardShelf, buySurvey, buyShelfUpgrade, daysLeft, mulberry32
  };
});
