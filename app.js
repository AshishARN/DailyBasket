const STORAGE_KEY = "daily-basket-items";

const addForm = document.getElementById("addForm");
const itemInput = document.getElementById("itemInput");
const activeList = document.getElementById("activeList");
const purchasedList = document.getElementById("purchasedList");
const emptyState = document.getElementById("emptyState");
const remainingCount = document.getElementById("remainingCount");
const purchasedCount = document.getElementById("purchasedCount");
const purchasedToggle = document.getElementById("purchasedToggle");
const clearBoughtButton = document.getElementById("clearBoughtButton");
const toast = document.getElementById("toast");
const installButton = document.getElementById("installButton");

let deferredInstallPrompt = null;
let toastTimer;

function getItems() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveItems(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

function formatDateTime(dateString) {
  const date = new Date(dateString);

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}

function showToast(message) {
  clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add("show");

  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
  }, 2400);
}

function createActiveItem(item) {
  const template = document.getElementById("activeItemTemplate");
  const node = template.content.cloneNode(true);

  node.querySelector(".item-name").textContent = item.name;
  node.querySelector(".item-time").textContent =
    `Added ${formatDateTime(item.createdAt)}`;

  node.querySelector(".buy-button").addEventListener("click", () => {
    markBought(item.id);
  });

  node.querySelector(".delete-button").addEventListener("click", () => {
    deleteItem(item.id);
  });

  return node;
}

function createPurchasedItem(item) {
  const template = document.getElementById("purchasedItemTemplate");
  const node = template.content.cloneNode(true);

  node.querySelector(".item-name").textContent = item.name;
  node.querySelector(".item-time").textContent =
    `Bought ${formatDateTime(item.boughtAt)}`;

  node.querySelector(".undo-button").addEventListener("click", () => {
    undoBought(item.id);
  });

  return node;
}

function render() {
  const items = getItems();
  const activeItems = items
    .filter((item) => !item.boughtAt)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const boughtItems = items
    .filter((item) => item.boughtAt)
    .sort((a, b) => new Date(b.boughtAt) - new Date(a.boughtAt));

  activeList.innerHTML = "";
  purchasedList.innerHTML = "";

  activeItems.forEach((item) => activeList.appendChild(createActiveItem(item)));
  boughtItems.forEach((item) => purchasedList.appendChild(createPurchasedItem(item)));

  emptyState.hidden = activeItems.length !== 0;
  remainingCount.textContent =
    activeItems.length === 1 ? "1 item left" : `${activeItems.length} items left`;

  purchasedCount.textContent = boughtItems.length;
  clearBoughtButton.hidden = boughtItems.length === 0;
}

function addItem(name) {
  const items = getItems();

  items.push({
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    name,
    createdAt: new Date().toISOString(),
    boughtAt: null
  });

  saveItems(items);
  render();
  showToast(`${name} added to your basket`);
}

function markBought(id) {
  const items = getItems();
  const item = items.find((current) => current.id === id);

  if (!item) return;

  item.boughtAt = new Date().toISOString();
  saveItems(items);
  render();
  showToast(`${item.name} marked as bought`);
}

function undoBought(id) {
  const items = getItems();
  const item = items.find((current) => current.id === id);

  if (!item) return;

  item.boughtAt = null;
  saveItems(items);
  render();
  showToast(`${item.name} moved back to your list`);
}

function deleteItem(id) {
  const item = getItems().find((current) => current.id === id);

  if (!item) return;

  const confirmed = window.confirm(`Delete "${item.name}" from your list?`);
  if (!confirmed) return;

  saveItems(getItems().filter((current) => current.id !== id));
  render();
  showToast("Item deleted");
}

addForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const name = itemInput.value.trim();
  if (!name) return;

  addItem(name);
  itemInput.value = "";
  itemInput.focus();
});

purchasedToggle.addEventListener("click", () => {
  const expanded = purchasedToggle.getAttribute("aria-expanded") === "true";
  purchasedToggle.setAttribute("aria-expanded", String(!expanded));
  purchasedList.hidden = expanded;
});

clearBoughtButton.addEventListener("click", () => {
  const boughtItems = getItems().filter((item) => item.boughtAt);

  if (!boughtItems.length) return;

  const confirmed = window.confirm("Clear all bought items permanently?");
  if (!confirmed) return;

  saveItems(getItems().filter((item) => !item.boughtAt));
  render();
  showToast("Bought items cleared");
});

function setTodayLabel() {
  const today = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long"
  }).format(new Date());

  document.getElementById("todayLabel").textContent = today;
}

/* PWA installation support */
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;

  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;

  deferredInstallPrompt = null;
  installButton.hidden = true;
});

window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  showToast("Daily Basket installed successfully");
});

/* Offline support */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js");
  });
}

setTodayLabel();
render();