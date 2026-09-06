import type { User } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export const DEFAULT_AVATAR_SEED = "no-dp";
// Reuse the existing Deadpool placeholder already shown in the header.
export const DEFAULT_AVATAR = "/deadpool_dp.jpg";

interface UserProfileDoc {
  avatar?: unknown;
  avatarSeed?: unknown;
  displayName?: unknown;
  username?: unknown;
}

function resolveAvatar(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AVATAR;
  const trimmed = value.trim();
  return trimmed || DEFAULT_AVATAR;
}

function resolveUsername(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed || fallback;
}

export async function ensureUserProfile(user: User): Promise<{ avatar: string; username: string }> {
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const data = snapshot.data() as UserProfileDoc | undefined;
  const fallbackName = (user.displayName || "Explorer").trim() || "Explorer";

  if (!snapshot.exists()) {
    await setDoc(
      userRef,
      {
        displayName: fallbackName,
        username: fallbackName,
        avatar: DEFAULT_AVATAR,
        avatarSeed: DEFAULT_AVATAR_SEED
      },
      { merge: true }
    );
    return { avatar: DEFAULT_AVATAR, username: fallbackName };
  }

  const updates: Record<string, string> = {};
  const username = resolveUsername(data?.username, resolveUsername(data?.displayName, fallbackName));
  const avatar = resolveAvatar(data?.avatar);

  if (!data?.displayName || typeof data.displayName !== "string" || !data.displayName.trim()) {
    updates.displayName = fallbackName;
  }
  if (!data?.username || typeof data.username !== "string" || !data.username.trim()) {
    updates.username = username;
  }
  if (Object.keys(updates).length > 0) {
    await setDoc(userRef, updates, { merge: true });
    return {
      avatar: updates.avatar ?? avatar,
      username: updates.username ?? username
    };
  }

  return { avatar, username };
}

export async function getUserProfile(user: User): Promise<{ avatar: string; username: string }> {
  return ensureUserProfile(user);
}
