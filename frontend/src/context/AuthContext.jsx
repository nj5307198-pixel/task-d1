import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchMe } from "../lib/users.js";

const AuthContext = createContext(null);
const TOKEN_KEY = "devdeakin_token";
const USER_KEY = "devdeakin_user";

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

function readStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(readStoredToken);
  const [user, setUser] = useState(() => (readStoredToken() ? readStoredUser() : null));

  // Store the JWT (session) and the user details after a successful login
  const signIn = useCallback((newToken, newUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  // Clear the active JWT on logout
  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  // Update the stored user (e.g. after upgrading the plan)
  const updateUser = useCallback((newUser) => {
    localStorage.setItem(USER_KEY, JSON.stringify(newUser));
    setUser(newUser);
  }, []);

  // On first load, check the saved token is still valid and refresh the plan from Firestore.
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchMe(token)
      .then((fresh) => {
        if (!cancelled) updateUser(fresh);
      })
      .catch((err) => {
        // Expired or invalid token -> end the session. Network errors keep it.
        if (!cancelled && err.status === 401) signOut();
      });
    return () => {
      cancelled = true;
    };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isPaid: user?.plan === "paid",
      signIn,
      signOut,
      updateUser,
    }),
    [user, token, signIn, signOut, updateUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
