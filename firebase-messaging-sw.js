// Firebase Cloud Messaging Background Service Worker
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js");

const firebaseConfig = {
  apiKey: "AIzaSyBkCppLPqWNPbzBuvKGA_w-kAp48g5AbXc",
  authDomain: "daily-basket-v2.firebaseapp.com",
  projectId: "daily-basket-v2",
  storageBucket: "daily-basket-v2.firebasestorage.app",
  messagingSenderId: "153743551967",
  appId: "1:153743551967:web:a50efd5af9dde25f5b686a",
  measurementId: "G-N98Z92FL4P"
};

firebase.initializeApp(firebaseConfig);

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log("[firebase-messaging-sw.js] Background push received:", payload);

  const title = payload.notification?.title || payload.data?.title || "Daily Basket";
  const body = payload.notification?.body || payload.data?.body || "An urgent grocery item was updated.";
  const roomCode = payload.data?.roomCode || "";

  const notificationOptions = {
    body,
    icon: "./icon.svg",
    badge: "./icon.svg",
    vibrate: [200, 100, 200],
    data: {
      roomCode,
      ...payload.data
    },
    actions: [
      {
        action: "open-room",
        title: "View Basket"
      }
    ]
  };

  return self.registration.showNotification(title, notificationOptions);
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const roomCode = event.notification.data?.roomCode;
  const targetUrl = roomCode ? `./?room=${roomCode}` : "./";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      // Focus if already open
      for (const client of clientList) {
        if ("focus" in client) {
          if (roomCode && client.url) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // Otherwise open a new window
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

