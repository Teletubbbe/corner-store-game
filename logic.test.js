const test = require("node:test");
const assert = require("node:assert/strict");
const G = require("./logic.js");

test("new game starts with five empty shelves and a forecast", () => {
  const state = G.createInitialState(123);
  assert.equal(state.shelves.length, 5);
  assert.equal(state.cash, G.SETTINGS.startingCash);
  assert.ok(state.forecast.exactCustomers >= 7);
});

test("purchase deducts money and puts exact quantity on shelf", () => {
  const state = G.createInitialState(123);
  const result = G.buyForShelf(state, 0, "bread", 5);
  assert.equal(result.ok, true);
  assert.equal(G.shelfCount(state.shelves[0]), 5);
  assert.equal(state.cash, G.SETTINGS.startingCash - G.PRODUCTS.bread.buy * 5);
});

test("different product cannot be mixed on one shelf", () => {
  const state = G.createInitialState(123);
  G.buyForShelf(state, 0, "bread", 2);
  const result = G.buyForShelf(state, 0, "milk", 2);
  assert.equal(result.ok, false);
  assert.equal(state.shelves[0].productId, "bread");
});

test("warehouse stores one full shelf and can return it", () => {
  const state = G.createInitialState(123);
  G.buyForShelf(state, 0, "apples", 7);
  assert.equal(G.moveShelfToWarehouse(state, 0).ok, true);
  assert.equal(G.shelfCount(state.warehouse), 7);
  assert.equal(state.shelves[0].productId, null);
  assert.equal(G.moveWarehouseToShelf(state, 1).ok, true);
  assert.equal(G.shelfCount(state.shelves[1]), 7);
  assert.equal(state.warehouse, null);
});

test("customer buys available part of their basket", () => {
  const state = G.createInitialState(123);
  G.buyForShelf(state, 0, "bread", 1);
  const result = G.serveCustomer(state, { id: "x", profileId: "students", basket: ["bread", "chips"] });
  assert.deepEqual(result.bought, ["bread"]);
  assert.deepEqual(result.missed, ["chips"]);
  assert.equal(result.served, true);
  assert.equal(G.shelfCount(state.shelves[0]), 0);
});

test("perishables spoil after their shelf life", () => {
  const state = G.createInitialState(123);
  G.buyForShelf(state, 0, "ready", 3);
  state.shelves[0].batches[0].age = G.PRODUCTS.ready.shelfLife - 1;
  const report = G.finishDay(state, []);
  assert.equal(report.spoiled.ready, 3);
  assert.equal(state.shelves[0].productId, null);
});

test("same seed and day produce identical customer plan", () => {
  const a = G.createInitialState(777);
  const b = G.createInitialState(777);
  assert.deepEqual(G.generateDayCustomers(a), G.generateDayCustomers(b));
});

test("new shelf unlocks only after five completed days", () => {
  const state = G.createInitialState(123);
  state.cash = 20000;
  assert.equal(G.buyShelfUpgrade(state).ok, false);
  state.day = 6;
  assert.equal(G.buyShelfUpgrade(state).ok, true);
  assert.equal(state.shelves.length, 6);
});
