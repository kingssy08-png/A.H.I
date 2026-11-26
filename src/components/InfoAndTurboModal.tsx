import { useEffect, useState } from 'react';
import type { User as FirebaseUser } from 'firebase/auth';
import {
  AlertTriangle,
  Check,
  Download,
  KeyRound,
  Loader2,
  Settings,
  ShieldAlert,
  Sparkles,
  Trash2,
  User as UserIcon,
  X,
} from 'lucide-react';
import type { AspectRatio } from '../types/studio';
import type { StudioPreferences } from '../utils/studioPreferences';

export interface AccountSettingsModalProps {
  isOpen: boolean;
  authUser: FirebaseUser | null;
  displayName: string;
  preferences: StudioPreferences;
  projectCount: number;
  onClose: () => void;
  onUpdateDisplayName: (nextName: string) => Promise<void>;
  onSendPasswordReset: () => Promise<string>;
  onUpdatePreferences: (next: StudioPreferences) => void;
  onDownloadAllProjects: () => Promise<number>;
  onDeleteAccount: () => Promise<void>;
}

const ASPECT_RATIO_OPTIONS: Array<{ value: AspectRatio; label: string; hint: string }> = [
  { value: '16:9', label: '16:9 YouTube', hint: 'Widescreen' },
  { value: '9:16', label: '9:16 TikTok/Reels', hint: 'Vertical' },
  { value: '1:1', label: '1:1 Square', hint: 'Social Feed' },
];

export function AccountSettingsModal({
  isOpen,
  authUser,
  displayName,
  preferences,
  projectCount,
  onClose,
  onUpdateDisplayName,
  onSendPasswordReset,
  onUpdatePreferences,
  onDownloadAllProjects,
  onDeleteAccount,
}: AccountSettingsModalProps) {
  const [nameInput, setNameInput] = useState(displayName);
  const [savingName, setSavingName] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);

  const [sendingReset, setSendingReset] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const [backingUp, setBackingUp] = useState(false);
  const [backupCount, setBackupCount] = useState<number | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNameInput(displayName);
      setNameSaved(false);
      setResetMessage(null);
      setBackupCount(null);
      setShowDeleteConfirm(false);
      setDeleteConfirmText('');
      setErrorMsg(null);
    }
  }, [isOpen, displayName]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !deletingAccount) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, deletingAccount, onClose]);

  if (!isOpen) return null;

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = nameInput.trim();
    if (!cleaned) return;
    setSavingName(true);
    setErrorMsg(null);
    setNameSaved(false);
    try {
      await onUpdateDisplayName(cleaned);
      setNameSaved(true);
      window.setTimeout(() => setNameSaved(false), 2400);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update display name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleResetPassword = async () => {
    setSendingReset(true);
    setErrorMsg(null);
    setResetMessage(null);
    try {
      const targetEmail = await onSendPasswordReset();
      setResetMessage(`Password reset email sent to ${targetEmail}.`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not send password reset email.');
    } finally {
      setSendingReset(false);
    }
  };

  const handleBackupAll = async () => {
    setBackingUp(true);
    setErrorMsg(null);
    try {
      const count = await onDownloadAllProjects();
      setBackupCount(count);
      window.setTimeout(() => setBackupCount(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not export backup.');
    } finally {
      setBackingUp(false);
    }
  };

  const handleConfirmDeleteAccount = async () => {
    if (deleteConfirmText.trim() !== 'DELETE') return;
    setDeletingAccount(true);
    setErrorMsg(null);
    try {
      await onDeleteAccount();
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Could not delete account. Please sign out, sign back in, and try again.'
      );
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#07090E]/80 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !deletingAccount) onClose();
      }}
    >
      <div className="w-full max-w-lg bg-[rgba(17,22,33,0.9)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_28px_72px_rgba(0,0,0,0.78)] rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 flex items-center justify-center">
              <Settings className="w-4 h-4 text-[#2DD4BF]" />
            </span>
            <div>
              <h2
                id="account-settings-title"
                className="text-sm font-display font-semibold text-[#F8FAFC]"
              >
                Account Settings
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                Profile, studio preferences &amp; project backups
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={deletingAccount}
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 cursor-pointer disabled:opacity-40"
            aria-label="Close account settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-5 max-h-[82vh] overflow-y-auto text-xs">
          {errorMsg && (
            <div className="rounded-xl bg-red-950/50 border border-red-500/40 px-3.5 py-2.5 text-red-200 leading-relaxed">
              {errorMsg}
            </div>
          )}

          {/* 1. Account & Profile Section */}
          <section className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 font-display font-semibold text-[#F8FAFC]">
                <UserIcon className="w-3.5 h-3.5 text-[#2DD4BF]" />
                <span>Account &amp; Profile</span>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2DD4BF]">
                <Sparkles className="w-3 h-3" />
                Free Unlimited Member
              </span>
            </div>

            <form onSubmit={(e) => void handleSaveName(e)} className="space-y-1.5">
              <label
                htmlFor="settings-display-name"
                className="block text-[11px] font-medium text-[#94A3B8]"
              >
                Display Name
              </label>
              <div className="flex gap-2">
                <input
                  id="settings-display-name"
                  type="text"
                  maxLength={80}
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder="Your creator name"
                  className="flex-1 bg-[rgba(17,22,33,0.9)] border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingName || !nameInput.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-45 text-[#07090E] font-bold cursor-pointer transition-colors shrink-0"
                >
                  {savingName ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : nameSaved ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Saved
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </form>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-white/10">
              <div>
                <div className="text-[11px] text-[#64748B]">Email Address</div>
                <div className="text-xs text-[#F8FAFC] font-medium truncate mt-0.5">
                  {authUser?.email || 'Signed-in Creator'}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#64748B]">Account Status</div>
                <div className="text-xs text-[#34D399] font-semibold mt-0.5">
                  Free Unlimited Member
                </div>
              </div>
            </div>

            {authUser?.email ? (
              <div className="pt-1 space-y-2">
                <button
                  type="button"
                  disabled={sendingReset}
                  onClick={() => void handleResetPassword()}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/10 hover:border-[#2DD4BF]/45 text-xs font-medium text-[#F8FAFC] disabled:opacity-45 cursor-pointer transition-colors"
                >
                  {sendingReset ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2DD4BF]" />
                  ) : (
                    <KeyRound className="w-3.5 h-3.5 text-[#2DD4BF]" />
                  )}
                  Send Password Reset Email
                </button>
                {resetMessage && (
                  <p className="text-[11px] text-[#34D399]">{resetMessage}</p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-[#64748B]">
                Sign in with an email account to sync across devices or manage password recovery.
              </p>
            )}
          </section>

          {/* 2. Preferences & Data Backup */}
          <section className="bg-[#07090E]/75 border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="font-display font-semibold text-[#F8FAFC]">
              Preferences &amp; Data Backup
            </div>

            {/* Startup Intro Animation Toggle */}
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-medium text-[#F8FAFC]">
                  Play &ldquo;Kingssy&rdquo; Intro Animation on Startup
                </div>
                <div className="text-[11px] text-[#94A3B8]">
                  Show the calligraphy signature reveal when opening A.H.I
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={preferences.playStartupIntro}
                onClick={() =>
                  onUpdatePreferences({
                    ...preferences,
                    playStartupIntro: !preferences.playStartupIntro,
                  })
                }
                className="inline-flex items-center gap-2 shrink-0 cursor-pointer"
              >
                <span
                  className={`relative inline-flex items-center w-9 h-5 rounded-full border transition-all duration-300 ${
                    preferences.playStartupIntro
                      ? 'bg-[#2DD4BF]/25 border-[#2DD4BF]/80 shadow-[0_0_12px_rgba(45,212,191,0.35)]'
                      : 'bg-white/[0.08] border-white/15'
                  }`}
                >
                  <span
                    className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                      preferences.playStartupIntro
                        ? 'translate-x-[18px] bg-[#2DD4BF] shadow-[0_0_8px_rgba(45,212,191,0.85)]'
                        : 'translate-x-[2px] bg-[#94A3B8]'
                    }`}
                  />
                </span>
                <span className="text-[11px] font-semibold text-[#94A3B8] w-6 text-right">
                  {preferences.playStartupIntro ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {/* Default Video Aspect Ratio */}
            <div className="space-y-2 pt-2 border-t border-white/10">
              <div className="text-xs font-medium text-[#F8FAFC]">
                Default Video Aspect Ratio
              </div>
              <div className="grid grid-cols-3 gap-2">
                {ASPECT_RATIO_OPTIONS.map((opt) => {
                  const active = preferences.defaultAspectRatio === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() =>
                        onUpdatePreferences({
                          ...preferences,
                          defaultAspectRatio: opt.value,
                        })
                      }
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/65 text-[#F8FAFC]'
                          : 'bg-[rgba(17,22,33,0.9)] border-white/10 hover:border-white/25 text-[#94A3B8]'
                      }`}
                    >
                      <div className="text-[11px] font-semibold">{opt.label}</div>
                      <div className="text-[10px] opacity-75 mt-0.5">{opt.hint}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Backup All Projects */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <button
                type="button"
                disabled={backingUp}
                onClick={() => void handleBackupAll()}
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white/[0.06] hover:bg-white/[0.11] border border-white/15 hover:border-[#2DD4BF]/50 text-xs font-semibold text-[#F8FAFC] cursor-pointer transition-all"
              >
                {backingUp ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#2DD4BF]" />
                ) : backupCount !== null ? (
                  <Check className="w-4 h-4 text-[#34D399]" />
                ) : (
                  <Download className="w-4 h-4 text-[#2DD4BF]" />
                )}
                {backupCount !== null
                  ? `Backed up ${backupCount} project${backupCount === 1 ? '' : 's'} (.ahi)`
                  : `Download All My Projects (.ahi Backup · ${projectCount})`}
              </button>
              <p className="text-[11px] text-[#64748B]">
                Saves your local projects, cast characters, and Show Bible into one portable{' '}
                <code className="text-[#94A3B8]">.ahi</code> file anytime.
              </p>
            </div>
          </section>

          {/* 3. Danger Zone — Delete Account */}
          <section className="bg-red-950/20 border border-red-500/25 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-red-300 font-display font-semibold">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>Danger Zone</span>
            </div>

            {!authUser ? (
              <p className="text-[11px] text-[#94A3B8]">
                Sign in to manage or permanently delete your account.
              </p>
            ) : !showDeleteConfirm ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] text-[#94A3B8] max-w-xs">
                  Permanently remove your account and all saved cloud projects.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-xs font-semibold text-red-200 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Account
                </button>
              </div>
            ) : (
              <div className="space-y-3 pt-1">
                <div className="flex items-start gap-2 rounded-xl bg-red-950/40 border border-red-500/35 p-3 text-[11px] text-red-200 leading-relaxed">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span>
                    Type <strong className="text-white font-mono">DELETE</strong> to permanently
                    remove your account and all saved cloud projects.
                  </span>
                </div>
                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Type DELETE to confirm"
                  disabled={deletingAccount}
                  className="w-full bg-[#07090E]/90 border border-red-500/40 focus:border-red-400 rounded-xl px-3 py-2 text-xs font-mono text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={deletingAccount}
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteConfirmText('');
                    }}
                    className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={deletingAccount || deleteConfirmText.trim() !== 'DELETE'}
                    onClick={() => void handleConfirmDeleteAccount()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-red-500 hover:bg-red-400 disabled:opacity-40 text-white font-bold cursor-pointer transition-colors"
                  >
                    {deletingAccount ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Deleting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="w-3.5 h-3.5" />
                        Permanently Delete Account
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
