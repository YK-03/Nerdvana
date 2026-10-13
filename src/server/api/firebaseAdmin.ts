/**
 * firebaseAdmin.ts
 *
 * Server-side Firebase Admin SDK initializer for Vercel serverless functions.
 *
 * Credential strategy (in priority order):
 *  1. FIREBASE_SERVICE_ACCOUNT_JSON — full service-account JSON as a string
 *  2. FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY — individual fields
 *
 * The Admin SDK bypasses Firestore security rules entirely.
 * Writes from this module do NOT require loosening security rules for
 * unauthenticated frontend access.
 *
 * getAdminDb() is idempotent — safe to call on every request.
 */

import { getApps, initializeApp, cert } from "firebase-admin/app";
import type { App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { Firestore } from "firebase-admin/firestore";

let _adminApp: App | null = null;
let _adminDb: Firestore | null = null;

function buildAdminApp(): App {
  // 1. Full JSON blob — preferred; easiest to configure in Vercel dashboard
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    let parsed: object;
    try {
      parsed = JSON.parse(serviceAccountJson);
    } catch {
      throw new Error(
        "[firebaseAdmin] FIREBASE_SERVICE_ACCOUNT_JSON is set but failed JSON.parse"
      );
    }
    return initializeApp({ credential: cert(parsed as any) }, "nerdvana-admin");
  }

  // 2. Individual credential fields
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  // Vercel escapes newlines in env var values; restore them for the PEM key
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "[firebaseAdmin] Missing Firebase Admin credentials. " +
        "Set FIREBASE_SERVICE_ACCOUNT_JSON, or all three of " +
        "FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY."
    );
  }

  return initializeApp(
    { credential: cert({ projectId, clientEmail, privateKey }) },
    "nerdvana-admin"
  );
}

/**
 * Returns the singleton Admin Firestore instance.
 * Idempotent across warm serverless invocations.
 */
export function getAdminDb(): Firestore {
  if (_adminDb) return _adminDb;

  // Check if our named app already exists (sibling import race on warm start)
  const existingApps = getApps();
  const existingApp = existingApps.find((a) => a.name === "nerdvana-admin");
  _adminApp = existingApp ?? buildAdminApp();
  _adminDb = getFirestore(_adminApp);
  return _adminDb;
}
