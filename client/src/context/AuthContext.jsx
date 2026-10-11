import React, { createContext, useContext, useState, useEffect } from 'react';
import { api } from '../services/api';

const AuthContext = createContext(null);

const DEMO_CREDENTIALS = {
  donor: { email: 'marco@grandhyatt.org', password: 'donor123' },
  recipient: { email: 'contact@gracehope.org', password: 'shelter123' },
  delivery: { email: 'vikram@shareaplate.org', password: 'rider123' },
  delivery_agent: { email: 'vikram@shareaplate.org', password: 'rider123' },
  admin: { email: 'ops@shareaplate.org', password: 'admin123' },
};

export const AuthProvider = ({ children }) => {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const serverUser = await api.getMe();
        if (serverUser) {
          setCurrentUser(serverUser);
          setLoading(false);
          return;
        }
      } catch {
        // Fall back to local storage
      }
      const user = api.getCurrentUser();
      setCurrentUser(user);
      setLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email, password, extraData = {}) => {
    const res = await api.login(email, password);
    const updatedUser = {
      ...extraData,
      ...res.user,
      role: res.user?.role || extraData.role || 'donor',
    };
    localStorage.setItem('sap_current_user_v1', JSON.stringify(updatedUser));
    setCurrentUser(updatedUser);
    return updatedUser;
  };

  // Genuine Google OAuth 2.0 Login via server-side token validation
  const loginWithGoogle = async (credential, targetRole = 'donor', portalVerificationData = {}) => {
    const res = await api.loginWithGoogle(credential, targetRole, portalVerificationData);
    setCurrentUser(res.user);
    return res.user;
  };

  const register = async (userData) => {
    const res = await api.register(userData);
    setCurrentUser(res.user);
    return res.user;
  };

  const logout = async () => {
    await api.logoutSession();
    localStorage.removeItem('sap_current_user_v1');
    const allUsers = api.getAllUsers();
    setCurrentUser(allUsers[0]);
  };

  // Switch role seamlessly with live backend synchronization and mock fallback
  const switchRole = async (targetRole) => {
    const normalizedTarget = targetRole === 'delivery_agent' ? 'delivery' : targetRole;
    const creds = DEMO_CREDENTIALS[normalizedTarget];

    if (creds) {
      try {
        const res = await api.login(creds.email, creds.password);
        if (res?.user) {
          const userWithRole = {
            ...res.user,
            role: res.user.role || normalizedTarget,
          };
          localStorage.setItem('sap_current_user_v1', JSON.stringify(userWithRole));
          setCurrentUser(userWithRole);
          return userWithRole;
        }
      } catch (err) {
        console.warn('Backend switchRole authentication fallback:', err);
      }
    }

    const allUsers = api.getAllUsers();
    const match = allUsers.find(
      (u) =>
        u.role === targetRole ||
        (normalizedTarget === 'delivery' && (u.role === 'delivery' || u.role === 'delivery_agent'))
    );
    if (match) {
      const switched = api.switchUser(match.id);
      setCurrentUser(switched);
      return switched;
    }
  };

  const allUsers = api.getAllUsers();
  const rawRole = currentUser?.role || 'donor';
  const role = rawRole === 'delivery_agent' ? 'delivery' : rawRole;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role,
        loading,
        login,
        loginWithGoogle,
        register,
        logout,
        switchRole,
        allUsers,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
