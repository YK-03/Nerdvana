"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import { getAdditionalUserInfo, onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../lib/firebase";
import { ensureUserProfile } from "../utils/getOrCreateAvatarSeed";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);

    });

    return () => unsub();
  }, []);
  
  const login = async () => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("nerdvana-auth-intent", "signin");
    }

    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (getAdditionalUserInfo(result)?.isNewUser) {
        await ensureUserProfile(result.user);
      }
    } catch (error) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("nerdvana-auth-intent");
      }
      throw error;
    }
  };
  

  const logout = () => signOut(auth);

  return { user, loading, login, logout };
}
