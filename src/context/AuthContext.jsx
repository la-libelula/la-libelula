import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        console.log("AuthContext: Starting effect");
        // Check active sessions and sets the user
        const setData = async () => {
            try {
                console.log("AuthContext: Fetching session...");
                const { data, error } = await supabase.auth.getSession();
                if (error) throw error;
                const session = data?.session;
                setSession(session);
                setUser(session?.user || null);
                console.log("AuthContext: Session loaded", !!session);
            } catch (err) {
                console.error("AuthContext: Error in setData", err);
            } finally {
                setLoading(false);
            }
        };

        setData();

        // Listen for changes on auth state
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log("AuthContext: Auth state change event:", _event);
            setSession(session);
            setUser(session?.user || null);
            setLoading(false);
        });

        const subscription = data?.subscription;

        return () => {
            subscription?.unsubscribe();
        };
    }, []);

    const signUp = async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        return data;
    };

    const signIn = async (email, password) => {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        return data;
    };

    const signOut = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
    };

    const updatePassword = async (newPassword) => {
        const { data, error } = await supabase.auth.updateUser({
            password: newPassword
        });
        if (error) throw error;
        return data;
    };

    const resetPassword = async (email) => {
        const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth?reset=true`,
        });
        if (error) throw error;
        return data;
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                session,
                loading,
                signUp,
                signIn,
                signOut,
                updatePassword,
                resetPassword
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
