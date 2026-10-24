import { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // null = checking

  useEffect(() => {
    let unmounted = false;
    const timer = setTimeout(() => {
      if (!unmounted) setUser((prev) => (prev === null ? false : prev));
    }, 4000);

    api
      .get("/auth/me")
      .then((r) => {
        if (!unmounted) setUser(r.data);
      })
      .catch(() => {
        if (!unmounted) setUser(false);
      })
      .finally(() => {
        clearTimeout(timer);
      });

    return () => {
      unmounted = true;
      clearTimeout(timer);
    };
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    if (data.token) localStorage.setItem("token", data.token);
    setUser(data);
    return data;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {}
    localStorage.removeItem("token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
