import React, { createContext, useState, useEffect, useContext } from 'react';
import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

function formatApiErrorDetail(detail) {
  if (detail == null) return 'Algo deu errado. Por favor, tente novamente.';
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(' ');
  if (detail && typeof detail.msg === 'string') return detail.msg;
  return String(detail);
}

// === INTERCEPTADOR MÁGICO DE SESSÃO ===
// Vigia todas as requisições. Se der erro 401, ele tenta renovar o token sozinho.
axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Se for erro de rede (sem response), não tenta refresh
    if (!error.response) {
      return Promise.reject(error);
    }
    
    if (
      error.response?.status === 401 && 
      !originalRequest._retry && 
      originalRequest.url !== `${API}/auth/login` && 
      originalRequest.url !== `${API}/auth/register` && 
      originalRequest.url !== `${API}/auth/refresh` &&
      originalRequest.url !== `${API}/auth/me`
    ) {
      originalRequest._retry = true;
      try {
        // Tenta renovar o token no backend usando o cookie de refresh
        await axios.post(`${API}/auth/refresh`, {}, { withCredentials: true });
        // Se der certo, repete a requisição original que havia falhado
        return axios(originalRequest);
      } catch (refreshError) {
        // Se o refresh token também expirou (após 7 dias inativos), desloga e manda pro login
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const { data } = await axios.get(`${API}/auth/me`, {
        withCredentials: true,
      });
      setUser(data);
    } catch (error) {
      setUser(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const { data } = await axios.post(
        `${API}/auth/login`,
        { email, password },
        { withCredentials: true }
      );
      setUser(data);
      return { success: true };
    } catch (e) {
      const error = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      return { success: false, error };
    }
  };

  const register = async (email, password, name) => {
    try {
      const { data } = await axios.post(
        `${API}/auth/register`,
        { email, password, name },
        { withCredentials: true }
      );
      setUser(data);
      return { success: true };
    } catch (e) {
      const error = formatApiErrorDetail(e.response?.data?.detail) || e.message;
      return { success: false, error };
    }
  };

  const logout = async () => {
    try {
      await axios.post(`${API}/auth/logout`, {}, { withCredentials: true });
      setUser(false);
      window.location.href = '/login';
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    user,
    loading,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
