const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

/**
 * Send push notification to all devices registered to a specific room
 *
 * @param {string} roomCode
 * @param {string} title
 * @param {string} body
 * @param {object} dataPayload
 * @param {string|null} excludeUid
 */
async function sendRoomUrgentNotification(roomCode, title, body, dataPayload = {}, excludeUid = null) {
  try {
    // 1. Fetch room name
    const roomSnapshot = await db.collection("rooms").doc(roomCode).get();
    const roomName = roomSnapshot.exists ? (roomSnapshot.data().name || "Shared room") : "Shared room";

    // 2. Fetch all registered FCM tokens for the room
    const tokensSnapshot = await db
      .collection("rooms")
      .doc(roomCode)
      .collection("fcmTokens")
      .get();

    if (tokensSnapshot.empty) {
      console.log(`[FCM] No registered devices found for room: ${roomCode}`);
      return;
    }

    const tokenEntries = [];
    tokensSnapshot.forEach((doc) => {
      const data = doc.data();
      if (data && data.token) {
        // Exclude the user who triggered the event so they don't get spammed by their own action
        if (!excludeUid || data.uid !== excludeUid) {
          tokenEntries.push({ id: doc.id, token: data.token });
        }
      }
    });

    if (tokenEntries.length === 0) {
      console.log(`[FCM] No recipient tokens remaining after sender exclusion in room: ${roomCode}`);
      return;
    }

    const registrationTokens = tokenEntries.map((entry) => entry.token);

    const message = {
      notification: {
        title,
        body
      },
      data: {
        roomCode,
        roomName,
        click_action: `/?room=${roomCode}`,
        ...dataPayload
      },
      tokens: registrationTokens
    };

    console.log(`[FCM] Dispatching notification to ${registrationTokens.length} devices in room "${roomName}" (${roomCode})`);

    const response = await messaging.sendEachForMulticast(message);
    console.log(`[FCM] Sent successfully: ${response.successCount}, Failed: ${response.failureCount}`);

    // Prune stale or unregistered tokens
    if (response.failureCount > 0) {
      const staleTokenDocIds = [];
      response.responses.forEach((resp, index) => {
        if (!resp.success) {
          const errorCode = resp.error?.code;
          if (
            errorCode === "messaging/invalid-registration-token" ||
            errorCode === "messaging/registration-token-not-registered"
          ) {
            staleTokenDocIds.push(tokenEntries[index].id);
          }
        }
      });

      if (staleTokenDocIds.length > 0) {
        console.log(`[FCM] Pruning ${staleTokenDocIds.length} obsolete token(s) from room ${roomCode}`);
        const batch = db.batch();
        staleTokenDocIds.forEach((docId) => {
          batch.delete(db.collection("rooms").doc(roomCode).collection("fcmTokens").doc(docId));
        });
        await batch.commit();
      }
    }
  } catch (error) {
    console.error(`[FCM] Error broadcasting notification for room ${roomCode}:`, error);
  }
}

/**
 * Triggered when a new grocery item is added to a room
 */
exports.onUrgentItemCreated = onDocumentCreated("rooms/{roomCode}/items/{itemId}", async (event) => {
  const snapshot = event.data;
  if (!snapshot) return;

  const item = snapshot.data();
  const roomCode = event.params.roomCode;
  const itemId = event.params.itemId;

  // Only notify if item is marked urgent
  if (item.urgent !== true) {
    return;
  }

  const creatorName = item.createdByName ? item.createdByName.trim() : "A roommate";
  const title = `🚨 Urgent item: ${item.name}`;
  const body = `${creatorName} added "${item.name}" as urgent to the shopping list.`;

  await sendRoomUrgentNotification(
    roomCode,
    title,
    body,
    {
      eventType: "urgent_added",
      itemId,
      itemName: String(item.name || "")
    },
    item.createdByUid || null
  );
});

/**
 * Triggered when a grocery item in a room is updated (e.g. marked as bought)
 */
exports.onUrgentItemBought = onDocumentUpdated("rooms/{roomCode}/items/{itemId}", async (event) => {
  const beforeData = event.data.before?.data();
  const afterData = event.data.after?.data();
  if (!beforeData || !afterData) return;

  const roomCode = event.params.roomCode;
  const itemId = event.params.itemId;

  // Trigger when an urgent item transitions from active to bought
  const wasBought = !beforeData.boughtAt && Boolean(afterData.boughtAt);
  const isUrgent = afterData.urgent === true;

  if (wasBought && isUrgent) {
    const buyerName = afterData.boughtByName ? afterData.boughtByName.trim() : "A roommate";
    const title = `✅ Urgent item bought: ${afterData.name}`;
    const body = `${buyerName} bought "${afterData.name}".`;

    await sendRoomUrgentNotification(
      roomCode,
      title,
      body,
      {
        eventType: "urgent_bought",
        itemId,
        itemName: String(afterData.name || "")
      },
      afterData.boughtByUid || null
    );
  }
});

