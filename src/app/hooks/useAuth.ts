"use client";

import { useEffect, useState } from "react";
import type { User } from "firebase/auth";
import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "firebase/auth";
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

  const loginWithEmail = async (email: string, password: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("nerdvana-auth-intent", "signin");
    }

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("nerdvana-auth-intent");
      }
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    if (typeof window !== "undefined") {
      window.sessionStorage.setItem("nerdvana-auth-intent", "signin");
    }

    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await ensureUserProfile(result.user);
    } catch (error) {
      if (typeof window !== "undefined") {
        window.sessionStorage.removeItem("nerdvana-auth-intent");
      }
      throw error;
    }
  };
  

  const logout = () => signOut(auth);

  return { user, loading, login, loginWithEmail, signUp, logout };
}
