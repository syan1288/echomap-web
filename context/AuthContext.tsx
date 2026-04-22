import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User, AuthError } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../lib/supabaseClient';

export type AuthResult = { ok: true } | { ok: false; message: string };

type AuthContextValue = {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errMessage(err: AuthError | null): string {
  if (!err) return 'Unknown error';
  if (err.message === 'Invalid login credentials') return '邮箱或密码不正确';
  if (err.message.includes('Email not confirmed')) return '请先点击邮件中的确认链接';
  return err.message;
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    void supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!cancelled) {
        setSession(s);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: '未配置 Supabase' };
    const trimmed = email.trim();
    if (!trimmed || !password) return { ok: false, message: '请填写邮箱和密码' };
    const { error } = await supabase.auth.signInWithPassword({ email: trimmed, password });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const signUpWithEmail = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    if (!supabase) return { ok: false, message: '未配置 Supabase' };
    const trimmed = email.trim();
    if (!trimmed || !password) return { ok: false, message: '请填写邮箱和密码' };
    if (password.length < 6) return { ok: false, message: '密码至少 6 位' };
    const { error } = await supabase.auth.signUp({ email: trimmed, password });
    if (error) return { ok: false, message: errMessage(error) };
    return { ok: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured,
      loading,
      session,
      user: session?.user ?? null,
      signInWithEmail,
      signUpWithEmail,
      signOut,
    }),
    [loading, session, signInWithEmail, signUpWithEmail, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
