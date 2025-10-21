import { createContext, useState, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
//The error message " 'ReactNode' is a type and must be imported using a type-only import when 'verbatimModuleSyntax' is enabled.ts(1484)" indicates that your TypeScript configuration has verbatimModuleSyntax set to true, which requires you to explicitly mark imports that are solely used for type annotations. 
//To resolve this, you need to modify your import statement for ReactNode to use import type

interface AuthContextType {
  token: string | null;
  isLoggedIn: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [token, setToken] = useState<string | null>(null);

  // Check localStorage for a token on initial load
  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    if (storedToken) {
      setToken(storedToken);
    }
  }, []);

  const isLoggedIn = !!token;

  const login = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem('token', newToken);
  };

  const logout = () => {
    setToken(null);
    localStorage.removeItem('token');
  };

  return (
    <AuthContext.Provider value={{ token, isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the AuthContext
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};