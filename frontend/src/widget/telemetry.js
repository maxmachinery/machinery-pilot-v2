import { getOrCreateUserId, getOrCreateSessionId } from './identity.js';

const BACKEND_URL = import.meta.env.DEV
  ? 'http://localhost:3002'
  : window.location.origin;

export async function logEvent(eventType, eventData = null) {
  try {
    await fetch(`${BACKEND_URL}/api/telemetry/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: getOrCreateUserId(),
        sessionId: getOrCreateSessionId(),
        eventType,
        eventData,
        pageHostname: window.location.hostname,
        pageUrl: window.location.href,
      }),
    });
  } catch (e) {
    // never break user flow
  }
}
