"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type UserRole = "user" | "pharmacist" | "admin" | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  role: UserRole;
  isPharmacist: boolean;
  isAdmin: boolean;
}

function extractRole(user: User | null): UserRole {
  if (!user) return null;
  const appMeta = user.app_metadata || {};
  const userMeta = user.user_metadata || {};
  const role = appMeta.role || userMeta.role;
  if (role === "pharmacist") return "pharmacist";
  if (role === "admin") return "admin";
  return "user";
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  isLoading: true,
  role: null,
  isPharmacist: false,
  isAdmin: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const role = extractRole(user);
  const isPharmacist = role === "pharmacist";
  const isAdmin = role === "admin";

  return (
    <AuthContext.Provider value={{ user, session, isLoading, role, isPharmacist, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
