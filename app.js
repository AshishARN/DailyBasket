const PERSONAL_ITEMS_KEY = "daily-basket-personal-items";
const JOINED_ROOMS_KEY = "daily-basket-joined-rooms";
const PROFILE_NAME_KEY = "daily-basket-profile-name";

const FIREBASE_VERSION = "10.12.5";

/*
 * Replace these placeholder values with the configuration shown in:
 * Firebase Console → Project settings → Your apps → Web app
 */
const firebaseConfig = {
  apiKey: "AIzaSyBkCppLPqWNPbzBuvKGA_w-kAp48g5AbXc",
  authDomain: "daily-basket-v2.firebaseapp.com",
  projectId: "daily-basket-v2",
  storageBucket: "daily-basket-v2.firebasestorage.app",
  messagingSenderId: "153743551967",
  appId: "1:153743551967:web:a50efd5af9dde25f5b686a",
  measurementId: "G-N98Z92FL4P"
};

const homeScreen = document.getElementById("homeScreen");
const listScreen = document.getElementById("listScreen");
const profileNameInput = document.getElementById("profileName");
const joinedRoomsElement = document.getElementById("joinedRooms");
const noRoomsState = document.getElementById("noRoomsState");
const roomFormCard = document.getElementById("roomFormCard");
const createRoomForm = document.getElementById("createRoomForm");
const joinRoomForm = document.getElementById("joinRoomForm");
const cloudMessage = document.getElementById("cloudMessage");

const listTitle = document.getElementById("listTitle");
const listSubtitle = document.getElementById("listSubtitle");
const listTypeBadge = document.getElementById("listTypeBadge");
const roomShareCard = document.getElementById("roomShareCard");
const currentRoomCode = document.getElementById("currentRoomCode");
const syncStatus = document.getElementById("syncStatus");

const addItemForm = document.getElementById("addItemForm");
const itemInput = document.getElementById("itemInput");
const urgentItemInput = document.getElementById("urgentItemInput");
const itemFilterInputs = document.querySelectorAll(
  'input[name="itemFilter"]'
);
const activeList = document.getElementById("activeList");
const boughtList = document.getElementById("boughtList");
const emptyState = document.getElementById("emptyState");
const remainingCount = document.getElementById("remainingCount");
const boughtSection = document.getElementById("boughtSection");
const boughtCount = document.getElementById("boughtCount");
const boughtToggle = document.getElementById("boughtToggle");
const clearBoughtButton = document.getElementById("clearBoughtButton");
const installButton = document.getElementById("installButton");
const toast = document.getElementById("toast");

let currentMode = null;
let currentRoom = null;
let currentItems = [];
let currentItemFilter = "all";
let roomUnsubscribe = null;
let firebasePromise = null;
let deferredInstallPrompt = null;
let toastTimer = null;

function readJSON(key, fallback = []) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function getProfileName() {
  return profileNameInput.value.trim() || "Roommate";
}

function saveProfileName() {
  localStorage.setItem(PROFILE_NAME_KEY, profileNameInput.value.trim());
}

function formatDateTime(value) {
  if (!value) return "just now";

  let date;

  if (typeof value.toDate === "function") {
    date = value.toDate();
  } else {
    date = new Date(value);
  }

  if (Number.isNaN(date.getTime())) return "just now";

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
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

function showCloudMessage(message, isError = false) {
  cloudMessage.textContent = message;
  cloudMessage.classList.toggle("error", isError);
}

function setBusy(button, busy, busyText) {
  if (!button.dataset.originalText) {
    button.dataset.originalText = button.textContent;
  }

  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.originalText;
}

function setTodayLabel() {
  document.getElementById("todayLabel").textContent =
    new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long"
    }).format(new Date());
}

/* ---------- Firebase ---------- */

function isFirebaseConfigured() {
  return (
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("YOUR_") &&
    firebaseConfig.projectId &&
    !firebaseConfig.projectId.startsWith("YOUR_")
  );
}

async function initializeFirebase() {
  if (firebasePromise) return firebasePromise;

  if (!navigator.onLine) {
    throw new Error("An internet connection is required to open a shared room.");
  }

  if (!isFirebaseConfigured()) {
    throw new Error("Firebase has not been configured yet.");
  }

  firebasePromise = (async () => {
    const [appModule, authModule, firestoreModule] = await Promise.all([
      import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`
      ),
      import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`
      ),
      import(
        `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-firestore.js`
      )
    ]);

    const app = appModule.initializeApp(firebaseConfig);
    const auth = authModule.getAuth(app);

    if (!auth.currentUser) {
      await authModule.signInAnonymously(auth);
    }

    const db = firestoreModule.getFirestore(app);

    return {
      db,
      auth,
      ...firestoreModule
    };
  })().catch((error) => {
    firebasePromise = null;
    throw error;
  });

  return firebasePromise;
}

/* ---------- Joined rooms ---------- */

function getJoinedRooms() {
  return readJSON(JOINED_ROOMS_KEY, []);
}

function saveJoinedRoom(room) {
  const rooms = getJoinedRooms();
  const existingIndex = rooms.findIndex((entry) => entry.code === room.code);

  if (existingIndex >= 0) {
    rooms[existingIndex] = room;
  } else {
    rooms.unshift(room);
  }

  writeJSON(JOINED_ROOMS_KEY, rooms);
  renderJoinedRooms();
}

function renderJoinedRooms() {
  const rooms = getJoinedRooms();
  joinedRoomsElement.innerHTML = "";
  noRoomsState.hidden = rooms.length > 0;

  rooms.forEach((room) => {
    const button = document.createElement("button");
    button.className = "joined-room";
    button.type = "button";

    const avatar = document.createElement("span");
    avatar.className = "room-avatar";
    avatar.textContent = room.name.charAt(0).toUpperCase();

    const details = document.createElement("span");
    details.className = "joined-room-details";

    const name = document.createElement("strong");
    name.textContent = room.name;

    const code = document.createElement("small");
    code.textContent = `Room code: ${formatRoomCode(room.code)}`;

    const arrow = document.createElement("span");
    arrow.className = "arrow";
    arrow.textContent = "›";

    details.append(name, code);
    button.append(avatar, details, arrow);

    button.addEventListener("click", () => openRoom(room));

    joinedRoomsElement.appendChild(button);
  });
}

/* ---------- Room codes ---------- */

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);

  return Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("");
}

function cleanRoomCode(code) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
}

function formatRoomCode(code) {
  const cleaned = cleanRoomCode(code);
  return `${cleaned.slice(0, 5)}-${cleaned.slice(5)}`;
}

/* ---------- Screen navigation ---------- */

function closeRoomSubscription() {
  if (roomUnsubscribe) {
    roomUnsubscribe();
    roomUnsubscribe = null;
  }
}

function showHome() {
  closeRoomSubscription();

  currentMode = null;
  currentRoom = null;
  currentItems = [];

  listScreen.hidden = true;
  homeScreen.hidden = false;
  renderJoinedRooms();
}

function resetItemFilter() {
  currentItemFilter = "all";

  const allFilter = document.querySelector(
    'input[name="itemFilter"][value="all"]'
  );

  if (allFilter) {
    allFilter.checked = true;
  }
}

function openPersonalList() {
  closeRoomSubscription();
  resetItemFilter();

  currentMode = "personal";
  currentRoom = null;
  currentItems = readJSON(PERSONAL_ITEMS_KEY, []);

  listTitle.textContent = "Personal list";
  listSubtitle.textContent = "Private and stored only on this device";
  listTypeBadge.textContent = "Offline";
  roomShareCard.hidden = true;
  syncStatus.hidden = true;

  homeScreen.hidden = true;
  listScreen.hidden = false;

  renderItems();
  itemInput.focus();
}

async function openRoom(room) {
  closeRoomSubscription();
  resetItemFilter();

  currentMode = "room";
  currentRoom = room;
  currentItems = [];

  listTitle.textContent = room.name;
  listSubtitle.textContent = "Shared with your roommates";
  listTypeBadge.textContent = "Shared";
  currentRoomCode.textContent = formatRoomCode(room.code);
  roomShareCard.hidden = false;

  homeScreen.hidden = true;
  listScreen.hidden = false;

  syncStatus.hidden = false;
  syncStatus.textContent = "Connecting to room…";
  renderItems();

  try {
    const firebase = await initializeFirebase();
    const roomReference = firebase.doc(firebase.db, "rooms", room.code);
    const roomSnapshot = await firebase.getDoc(roomReference);

    if (!roomSnapshot.exists()) {
      throw new Error("This room no longer exists.");
    }

    const roomData = roomSnapshot.data();

    currentRoom = {
      code: room.code,
      name: roomData.name || room.name
    };

    listTitle.textContent = currentRoom.name;
    saveJoinedRoom(currentRoom);

    const itemsQuery = firebase.query(
      firebase.collection(firebase.db, "rooms", room.code, "items"),
      firebase.orderBy("createdAt", "desc")
    );

    roomUnsubscribe = firebase.onSnapshot(
      itemsQuery,
      (snapshot) => {
        currentItems = snapshot.docs.map((itemDocument) => ({
          id: itemDocument.id,
          ...itemDocument.data()
        }));

        syncStatus.textContent = navigator.onLine
          ? "Room is synchronized"
          : "Offline · showing the latest available data";

        renderItems();
      },
      (error) => {
        console.error(error);
        syncStatus.textContent = "Unable to synchronize this room";
        showToast("Could not synchronize the room");
      }
    );
  } catch (error) {
    console.error(error);
    syncStatus.textContent = error.message;
    showToast(error.message);
  }
}

/* ---------- Item rendering ---------- */

function renderItems() {
  const allActiveItems = currentItems.filter((item) => !item.boughtAt);

  const activeItems =
    currentItemFilter === "urgent"
      ? allActiveItems.filter((item) => item.urgent === true)
      : allActiveItems;

  const purchasedItems = currentItems
    .filter((item) => item.boughtAt)
    .sort((a, b) => getTimestamp(b.boughtAt) - getTimestamp(a.boughtAt));

  activeList.innerHTML = "";
  boughtList.innerHTML = "";

  activeItems.forEach((item) => {
    activeList.appendChild(createActiveItemElement(item));
  });

  purchasedItems.forEach((item) => {
    boughtList.appendChild(createBoughtItemElement(item));
  });

  emptyState.hidden = activeItems.length > 0;

  const emptyTitle = emptyState.querySelector("h3");
  const emptyMessage = emptyState.querySelector("p");

  if (currentItemFilter === "urgent") {
    remainingCount.textContent =
      activeItems.length === 1
        ? "1 urgent item"
        : `${activeItems.length} urgent items`;

    emptyTitle.textContent = "No urgent items";

    emptyMessage.textContent =
      allActiveItems.length > 0
        ? "Switch to All items to see the rest of your list."
        : "Nothing urgent right now.";
  } else {
    remainingCount.textContent =
      activeItems.length === 1
        ? "1 item left"
        : `${activeItems.length} items left`;

    emptyTitle.textContent = "Your basket is empty";
    emptyMessage.textContent = "Add your first grocery item above.";
  }

  boughtCount.textContent = purchasedItems.length;
  boughtSection.hidden = purchasedItems.length === 0;
  clearBoughtButton.hidden = purchasedItems.length === 0;
}

function getTimestamp(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  return new Date(value).getTime() || 0;
}

function createActiveItemElement(item) {
  const template = document.getElementById("activeItemTemplate");
  const fragment = template.content.cloneNode(true);
  const groceryItem = fragment.querySelector(".grocery-item");
  const isUrgent = item.urgent === true;

  if (isUrgent) {
    groceryItem.classList.add("urgent-item");
  }

  fragment.querySelector(".item-name").textContent = item.name;

  const addedBy = item.createdByName
    ? ` by ${item.createdByName}`
    : "";

  const priorityLabel = isUrgent ? "Urgent · " : "";

  fragment.querySelector(".item-meta").textContent =
    `${priorityLabel}Added ${formatDateTime(item.createdAt)}${addedBy}`;

  fragment.querySelector(".buy-button").addEventListener("click", () => {
    markItemBought(item);
  });

  fragment.querySelector(".delete-button").addEventListener("click", () => {
    deleteItem(item);
  });

  return fragment;
}

function createBoughtItemElement(item) {
  const template = document.getElementById("boughtItemTemplate");
  const fragment = template.content.cloneNode(true);
  const groceryItem = fragment.querySelector(".grocery-item");
  const isUrgent = item.urgent === true;

  if (isUrgent) {
    groceryItem.classList.add("urgent-item");
  }

  fragment.querySelector(".item-name").textContent = item.name;

  const boughtBy = item.boughtByName
    ? ` by ${item.boughtByName}`
    : "";

  const priorityLabel = isUrgent ? "Urgent · " : "";

  fragment.querySelector(".item-meta").textContent =
    `${priorityLabel}Bought ${formatDateTime(item.boughtAt)}${boughtBy}`;

  fragment.querySelector(".undo-button").addEventListener("click", () => {
    undoBoughtItem(item);
  });

  return fragment;
}

/* ---------- Personal list operations ---------- */

function savePersonalItems() {
  writeJSON(PERSONAL_ITEMS_KEY, currentItems);
}

function addPersonalItem(name, urgent = false) {
  currentItems.unshift({
    id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    name,
    urgent: urgent === true,
    createdAt: new Date().toISOString(),
    createdByName: getProfileName(),
    boughtAt: null,
    boughtByName: null
  });

  savePersonalItems();
  renderItems();
}

function markPersonalItemBought(item) {
  item.boughtAt = new Date().toISOString();
  item.boughtByName = getProfileName();

  savePersonalItems();
  renderItems();
}

function undoPersonalItem(item) {
  item.boughtAt = null;
  item.boughtByName = null;

  savePersonalItems();
  renderItems();
}

function deletePersonalItem(item) {
  currentItems = currentItems.filter((entry) => entry.id !== item.id);
  savePersonalItems();
  renderItems();
}

/* ---------- Shared room operations ---------- */

async function addRoomItem(name, urgent = false) {
  const firebase = await initializeFirebase();

  await firebase.addDoc(
    firebase.collection(
      firebase.db,
      "rooms",
      currentRoom.code,
      "items"
    ),
    {
      name,
      urgent: urgent === true,
      createdAt: firebase.serverTimestamp(),
      createdByName: getProfileName(),
      createdByUid: firebase.auth.currentUser.uid,
      boughtAt: null,
      boughtByName: null,
      boughtByUid: null
    }
  );
}

async function markRoomItemBought(item) {
  const firebase = await initializeFirebase();

  await firebase.updateDoc(
    firebase.doc(
      firebase.db,
      "rooms",
      currentRoom.code,
      "items",
      item.id
    ),
    {
      boughtAt: firebase.serverTimestamp(),
      boughtByName: getProfileName(),
      boughtByUid: firebase.auth.currentUser.uid
    }
  );
}

async function undoRoomItem(item) {
  const firebase = await initializeFirebase();

  await firebase.updateDoc(
    firebase.doc(
      firebase.db,
      "rooms",
      currentRoom.code,
      "items",
      item.id
    ),
    {
      boughtAt: null,
      boughtByName: null,
      boughtByUid: null
    }
  );
}

async function deleteRoomItem(item) {
  const firebase = await initializeFirebase();

  await firebase.deleteDoc(
    firebase.doc(
      firebase.db,
      "rooms",
      currentRoom.code,
      "items",
      item.id
    )
  );
}

/* ---------- Generic item actions ---------- */

async function markItemBought(item) {
  try {
    if (currentMode === "personal") {
      markPersonalItemBought(item);
    } else {
      await markRoomItemBought(item);
    }

    showToast(`${item.name} marked as bought`);
  } catch (error) {
    console.error(error);
    showToast("Unable to update the item");
  }
}

async function undoBoughtItem(item) {
  try {
    if (currentMode === "personal") {
      undoPersonalItem(item);
    } else {
      await undoRoomItem(item);
    }

    showToast(`${item.name} moved back to the list`);
  } catch (error) {
    console.error(error);
    showToast("Unable to update the item");
  }
}

async function deleteItem(item) {
  const confirmed = window.confirm(`Delete "${item.name}" permanently?`);
  if (!confirmed) return;

  try {
    if (currentMode === "personal") {
      deletePersonalItem(item);
    } else {
      await deleteRoomItem(item);
    }

    showToast("Item deleted");
  } catch (error) {
    console.error(error);
    showToast("Unable to delete the item");
  }
}

/* ---------- Create and join rooms ---------- */

async function createRoom(name) {
  const firebase = await initializeFirebase();

  let roomCode;
  let roomReference;
  let roomSnapshot;

  do {
    roomCode = generateRoomCode();
    roomReference = firebase.doc(firebase.db, "rooms", roomCode);
    roomSnapshot = await firebase.getDoc(roomReference);
  } while (roomSnapshot.exists());

  await firebase.setDoc(roomReference, {
    name,
    createdAt: firebase.serverTimestamp(),
    createdByUid: firebase.auth.currentUser.uid
  });

  const room = {
    code: roomCode,
    name
  };

  saveJoinedRoom(room);
  return room;
}

async function joinRoom(code) {
  const firebase = await initializeFirebase();
  const roomReference = firebase.doc(firebase.db, "rooms", code);
  const roomSnapshot = await firebase.getDoc(roomReference);

  if (!roomSnapshot.exists()) {
    throw new Error("Room not found. Check the room code and try again.");
  }

  const room = {
    code,
    name: roomSnapshot.data().name || "Shared room"
  };

  saveJoinedRoom(room);
  return room;
}

/* ---------- Event listeners ---------- */

profileNameInput.value = localStorage.getItem(PROFILE_NAME_KEY) || "";

profileNameInput.addEventListener("input", saveProfileName);

document
  .getElementById("openPersonalButton")
  .addEventListener("click", openPersonalList);

document.getElementById("backButton").addEventListener("click", showHome);

document
  .getElementById("showCreateRoomButton")
  .addEventListener("click", () => {
    roomFormCard.hidden = false;
    createRoomForm.hidden = false;
    joinRoomForm.hidden = true;
    showCloudMessage("Creating and using a shared room requires internet.");
    document.getElementById("roomNameInput").focus();
  });

document
  .getElementById("showJoinRoomButton")
  .addEventListener("click", () => {
    roomFormCard.hidden = false;
    createRoomForm.hidden = true;
    joinRoomForm.hidden = false;
    showCloudMessage("Enter the code shared by your roommate.");
    document.getElementById("roomCodeInput").focus();
  });

document.querySelectorAll(".close-form-button").forEach((button) => {
  button.addEventListener("click", () => {
    roomFormCard.hidden = true;
    createRoomForm.hidden = true;
    joinRoomForm.hidden = true;
    showCloudMessage("");
  });
});

document.getElementById("createForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const input = document.getElementById("roomNameInput");
  const submitButton = event.submitter;
  const name = input.value.trim();

  if (!name) return;

  setBusy(submitButton, true, "Creating…");
  showCloudMessage("Creating your room…");

  try {
    const room = await createRoom(name);

    input.value = "";
    roomFormCard.hidden = true;

    showToast(`Room created: ${formatRoomCode(room.code)}`);
    await openRoom(room);
  } catch (error) {
    console.error(error);
    showCloudMessage(error.message || "Unable to create the room.", true);
  } finally {
    setBusy(submitButton, false);
  }
});

document.getElementById("joinForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const input = document.getElementById("roomCodeInput");
  const submitButton = event.submitter;
  const code = cleanRoomCode(input.value);

  if (code.length !== 10) {
    showCloudMessage("Please enter a valid 10-character room code.", true);
    return;
  }

  setBusy(submitButton, true, "Joining…");
  showCloudMessage("Looking for the room…");

  try {
    const room = await joinRoom(code);

    input.value = "";
    roomFormCard.hidden = true;

    showToast(`Joined ${room.name}`);
    await openRoom(room);
  } catch (error) {
    console.error(error);
    showCloudMessage(error.message || "Unable to join the room.", true);
  } finally {
    setBusy(submitButton, false);
  }
});

document.getElementById("roomCodeInput").addEventListener("input", (event) => {
  const code = cleanRoomCode(event.target.value);
  event.target.value = formatRoomCode(code);
});

addItemForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const name = itemInput.value.trim();
  const urgent = urgentItemInput.checked;
  const button = event.submitter;

  if (!name) return;

  setBusy(button, true, "Adding…");

  try {
    if (currentMode === "personal") {
      addPersonalItem(name, urgent);
    } else if (currentMode === "room") {
      await addRoomItem(name, urgent);
    }

    itemInput.value = "";
    urgentItemInput.checked = false;
    itemInput.focus();

    showToast(
      urgent
        ? `${name} added as urgent`
        : `${name} added`
    );
  } catch (error) {
    console.error(error);
    showToast("Unable to add the item");
  } finally {
    setBusy(button, false);
  }
});

boughtToggle.addEventListener("click", () => {
  const expanded = boughtToggle.getAttribute("aria-expanded") === "true";

  boughtToggle.setAttribute("aria-expanded", String(!expanded));
  boughtList.hidden = expanded;
  clearBoughtButton.hidden = expanded || currentItems.every((item) => !item.boughtAt);
});

clearBoughtButton.addEventListener("click", async () => {
  const boughtItems = currentItems.filter((item) => item.boughtAt);

  if (!boughtItems.length) return;

  const confirmed = window.confirm(
    `Permanently delete ${boughtItems.length} bought item(s)?`
  );

  if (!confirmed) return;

  try {
    if (currentMode === "personal") {
      currentItems = currentItems.filter((item) => !item.boughtAt);
      savePersonalItems();
      renderItems();
    } else {
      const firebase = await initializeFirebase();
      const batch = firebase.writeBatch(firebase.db);

      boughtItems.forEach((item) => {
        batch.delete(
          firebase.doc(
            firebase.db,
            "rooms",
            currentRoom.code,
            "items",
            item.id
          )
        );
      });

      await batch.commit();
    }

    showToast("Bought items cleared");
  } catch (error) {
    console.error(error);
    showToast("Unable to clear bought items");
  }
});

document
  .getElementById("copyRoomCodeButton")
  .addEventListener("click", async () => {
    if (!currentRoom) return;

    const formattedCode = formatRoomCode(currentRoom.code);

    try {
      await navigator.clipboard.writeText(formattedCode);
      showToast("Room code copied");
    } catch {
      window.prompt("Copy this room code:", formattedCode);
    }
  });

window.addEventListener("online", () => {
  if (currentMode === "room") {
    syncStatus.textContent = "Internet restored · synchronizing…";
  }
});

window.addEventListener("offline", () => {
  if (currentMode === "room") {
    syncStatus.textContent = "Offline · shared updates are unavailable";
  }
});

itemFilterInputs.forEach((input) => {
  input.addEventListener("change", () => {
    if (!input.checked) return;

    currentItemFilter = input.value;
    renderItems();
  });
});

/* ---------- PWA installation ---------- */

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
  showToast("Daily Basket installed");
});

/* ---------- Service worker ---------- */

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .catch(console.error);
  });
}

setTodayLabel();
renderJoinedRooms();
