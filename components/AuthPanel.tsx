import React, { useState } from 'react';
import { useLocalization } from '../context/LocalizationContext';
import { useAuth } from '../context/AuthContext';

export interface AuthPanelProps {
  /** 从 Supabase 拉取建筑并替换当前地图（有确认框） */
  onPullFromCloud?: () => void | Promise<void>;
  /** 把当前地图上已生成的建筑全部上传/更新到云端 */
  onPushAllToCloud?: () => void | Promise<void>;
  cloudBusy?: boolean;
}

/**
 * 侧栏底部：云端账号（邮箱）。未配置 VITE_SUPABASE_* 时显示提示，不阻断本地使用。
 */
export const AuthPanel: React.FC<AuthPanelProps> = ({
  onPullFromCloud,
  onPushAllToCloud,
  cloudBusy = false,
}) => {
  const { t } = useLocalization();
  const { configured, loading, user, signInWithEmail, signUpWithEmail, signOut } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  if (!configured) {
    return (
      <p
        className="m-0 text-center text-[11px] leading-snug opacity-80 px-1"
        style={{ color: '#332115', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
      >
        {t('authDisabledHint')}
      </p>
    );
  }

  if (loading) {
    return (
      <p className="m-0 text-center text-[12px]" style={{ color: '#332115' }}>
        {t('authLoading')}
      </p>
    );
  }

  if (user) {
    return (
      <div className="flex flex-col gap-2 items-stretch text-left w-full px-1">
        <p
          className="m-0 text-[11px] truncate opacity-90"
          style={{ color: '#332115', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
          title={user.email ?? ''}
        >
          {t('authSignedInAs')}
          <br />
          <span className="font-medium">{user.email}</span>
        </p>
        {(onPullFromCloud || onPushAllToCloud) && (
          <div className="flex flex-col gap-1.5">
            {onPullFromCloud && (
              <button
                type="button"
                disabled={cloudBusy}
                onClick={() => void onPullFromCloud()}
                className="rounded-lg border border-black/20 bg-white/90 py-1.5 text-[11px] text-[#332115] hover:bg-white cursor-pointer disabled:opacity-50"
                style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
              >
                {t('cloudPull')}
              </button>
            )}
            {onPushAllToCloud && (
              <button
                type="button"
                disabled={cloudBusy}
                onClick={() => void onPushAllToCloud()}
                className="rounded-lg border border-black/20 bg-white/90 py-1.5 text-[11px] text-[#332115] hover:bg-white cursor-pointer disabled:opacity-50"
                style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
              >
                {t('cloudPushAll')}
              </button>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => void signOut()}
          className="rounded-lg border border-black/20 bg-white/90 py-1.5 text-[12px] text-[#332115] hover:bg-white cursor-pointer"
          style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
        >
          {t('authSignOut')}
        </button>
      </div>
    );
  }

  const submit = async () => {
    setHint(null);
    setBusy(true);
    try {
      const fn = mode === 'signIn' ? signInWithEmail : signUpWithEmail;
      const r = await fn(email, password);
      if (!r.ok) {
        setHint(r.message);
        return;
      }
      if (mode === 'signUp') {
        setHint(t('authCheckEmail'));
        setPassword('');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 items-stretch w-full px-1">
      <div className="flex gap-1 rounded-lg bg-black/10 p-0.5">
        <button
          type="button"
          onClick={() => {
            setMode('signIn');
            setHint(null);
          }}
          className={`flex-1 rounded-md py-1 text-[11px] cursor-pointer border-0 ${
            mode === 'signIn' ? 'bg-white shadow-sm' : 'bg-transparent'
          }`}
          style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', color: '#332115' }}
        >
          {t('authSignIn')}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('signUp');
            setHint(null);
          }}
          className={`flex-1 rounded-md py-1 text-[11px] cursor-pointer border-0 ${
            mode === 'signUp' ? 'bg-white shadow-sm' : 'bg-transparent'
          }`}
          style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', color: '#332115' }}
        >
          {t('authSignUp')}
        </button>
      </div>
      <label className="sr-only" htmlFor="auth-email">
        Email
      </label>
      <input
        id="auth-email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t('authEmailPlaceholder')}
        className="w-full rounded-md border border-black/20 bg-white/95 px-2 py-1.5 text-[12px] text-[#332115] box-border"
        style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
      />
      <label className="sr-only" htmlFor="auth-password">
        Password
      </label>
      <input
        id="auth-password"
        type="password"
        autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={t('authPasswordPlaceholder')}
        className="w-full rounded-md border border-black/20 bg-white/95 px-2 py-1.5 text-[12px] text-[#332115] box-border"
        style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit();
        }}
      />
      {hint && (
        <p className="m-0 text-[11px] leading-snug text-[#5c4033]" style={{ fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}>
          {hint}
        </p>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => void submit()}
        className="rounded-lg border-0 py-2 text-[12px] font-semibold text-white cursor-pointer disabled:opacity-60"
        style={{ background: '#0053D4', fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif' }}
      >
        {busy ? '…' : mode === 'signIn' ? t('authSubmitSignIn') : t('authSubmitSignUp')}
      </button>
    </div>
  );
};
