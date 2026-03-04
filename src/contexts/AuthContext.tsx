import React, { createContext, useContext, useState, useEffect } from 'react';

export interface User {
    id: string;
    email: string;
    name: string;
}

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (token: string, user: User) => void;
    logout: () => void;
    refreshUserData: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem('brink_auth_token'));
    const [isLoading, setIsLoading] = useState(true);

    const login = (newToken: string, userData: User) => {
        setToken(newToken);
        setUser(userData);
        localStorage.setItem('brink_auth_token', newToken);
    };

    const logout = () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem('brink_auth_token');
        window.location.href = '/';
    };

    const refreshUserData = async () => {
        if (!token) {
            setIsLoading(false);
            return;
        }

        try {
            const res = await fetch('http://localhost:3000/api/auth/me', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
            } else {
                logout(); // Invalid token
            }
        } catch (e) {
            console.error("Failed to fetch user profile", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Load user on startup if we have a token
    useEffect(() => {
        refreshUserData();
    }, [token]);

    return (
        <AuthContext.Provider value={{ user, token, login, logout, refreshUserData, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}
