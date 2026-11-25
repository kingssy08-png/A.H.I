import { useEffect, useState } from 'react';
import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import {
  CheckCircle2,
  Cloud,
  Download,
  Eye,
  EyeOff,
  HardDrive,
  Loader2,
  LogOut,
  Mail,
  RefreshCw,
  Upload,
  User as UserIcon,
  X,
} from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { AhiGeometricMark } from './AhiLoaders';

interface ProfileModalProps {
  isOpen: boolean;
  authUser: User | null;
  workspaceMode: 'cloud' | 'guest-unverified' | 'guest';
  displayName: string;
  projectCount: number;
  characterCount: number;
  creationCount: number;
  onClose: () => void;
  onRefreshVerification: () => Promise<void>;
  onSyncGuestToCloud: () => Promise<void>;
  onUpdateDisplayName: (nextName: string) => Promise<void>;
  onExportBackup: () => void;
  onImportBackup: (file: File) => void;
}

function formatAuthError(err: unknown): string {
  const code =
    typeof err === 'object' && err !== null && 'code' in err
      ? String((err as { code?: string }).code)
      : '';
  switch (code) {
    case 'auth/operation-not-allowed':
      return 'Email/Password sign-in is not enabled yet in Firebase Console. Use Continue with Google or Guest Mode for now.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in popup was closed before completing.';
    case 'auth/popup-blocked':
      return 'Popup was blocked by your browser. Please allow popups or use Email/Password.';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Incorrect email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email already exists. Flip to Login to sign in.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please wait a moment and try again.';
    default:
      return err instanceof Error ? err.message : 'Sign-in failed. Please try again.';
  }
}

function GoogleGlyph() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#F8FAFC"
        d="M21.35 11.1H12v2.92h5.35c-.24 1.38-1.02 2.55-2.18 3.33v2.76h3.52c2.06-1.9 3.25-4.7 3.25-8.01 0-.68-.06-1.35-.19-2z"
      />
      <path
        fill="#2DD4BF"
        d="M12 22c2.95 0 5.43-.98 7.24-2.65l-3.52-2.76c-.98.66-2.23 1.05-3.72 1.05-2.86 0-5.29-1.93-6.16-4.53H2.2v2.84C4 19.53 7.72 22 12 22z"
      />
      <path
        fill="#34D399"
        d="M5.84 13.11A6.04 6.04 0 0 1 5.52 11c0-.73.13-1.44.32-2.11V6.05H2.2A9.97 9.97 0 0 0 1 11c0 1.61.39 3.14 1.2 4.95l3.64-2.84z"
      />
      <path
        fill="#F8FAFC"
        d="M12 4.36c1.61 0 3.05.55 4.19 1.64l3.14-3.14C17.42 1.09 14.95 0 12 0 7.72 0 4 2.47 2.2 6.05l3.64 2.84C6.71 6.29 9.14 4.36 12 4.36z"
      />
    </svg>
  );
}

export function ProfileModal({
  isOpen,
  authUser,
  workspaceMode,
  displayName,
  projectCount,
  characterCount,
  creationCount,
  onClose,
  onRefreshVerification,
  onSyncGuestToCloud,
  onUpdateDisplayName,
  onExportBackup,
  onImportBackup,
}: ProfileModalProps) {
  // Login & Sign-Up 3D Flip Card state (used when !authUser)
  const [isSignUp, setIsSignUp] = useState(false);
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [showSignupConfirm, setShowSignupConfirm] = useState(false);

  // Signed-in Creator Workspace state
  const [nameInput, setNameInput] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setNameInput(displayName);
      setErrorMsg(null);
      setInfoMsg(null);
      if (!authUser) {
        setIsSignUp(false);
      }
    }
  }, [isOpen, displayName, authUser]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  if (!isOpen) return null;

  const applyPersistence = async () => {
    await setPersistence(
      auth,
      rememberMe ? browserLocalPersistence : browserSessionPersistence
    );
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await applyPersistence();
      await signInWithPopup(auth, googleProvider);
      onClose();
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedEmail = loginIdentifier.trim();
    if (!cleanedEmail || !loginPassword) return;
    if (!cleanedEmail.includes('@')) {
      setErrorMsg('Please enter the email address linked to your account.');
      return;
    }

    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await applyPersistence();
      await signInWithEmailAndPassword(auth, cleanedEmail, loginPassword);
      onClose();
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanedEmail = signupEmail.trim();
    if (!cleanedEmail || !signupPassword || !signupConfirmPassword) return;
    if (signupPassword !== signupConfirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter to confirm.');
      return;
    }
    if (signupPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }

    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await applyPersistence();
      const cred = await createUserWithEmailAndPassword(auth, cleanedEmail, signupPassword);
      const derivedName = cleanedEmail.split('@')[0] || 'Creator';
      await updateProfile(cred.user, { displayName: derivedName });
      await sendEmailVerification(cred.user);
      setInfoMsg(
        'Account created! Check your inbox for a verification link to unlock Cloud Sync.'
      );
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await onUpdateDisplayName(nameInput.trim());
      setInfoMsg('Display name updated.');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not update display name.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!authUser) return;
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await sendEmailVerification(authUser);
      setInfoMsg('Verification email sent! Click the link in your inbox, then press Refresh.');
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRefresh = async () => {
    setErrorMsg(null);
    setInfoMsg(null);
    setBusy(true);
    try {
      await onRefreshVerification();
      setInfoMsg('Account status refreshed.');
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    setBusy(true);
    setErrorMsg(null);
    try {
      await signOut(auth);
      onClose();
    } catch (err) {
      setErrorMsg(formatAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  // =========================================================================
  // Unauthenticated View: Circular Frosted-Glass 3D Flip Login & Sign-Up Card
  // =========================================================================
  if (!authUser) {
    return (
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center p-4 overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ahi-auth-heading"
        onClick={(e) => {
          if (e.target === e.currentTarget && !busy) onClose();
        }}
      >
        {/* Sibling Dark Obsidian + Backdrop Blur Layer (kept outside 3D perspective subtree) */}
        <div
          aria-hidden="true"
          onClick={() => {
            if (!busy) onClose();
          }}
          className="fixed inset-0 bg-[#07090E]/90 backdrop-blur-md"
        />

        {/* Ambient Floating Mint-Cyan Light Orbs Behind the Circular Glass */}
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 overflow-hidden flex items-center justify-center"
        >
          <div
            className="ahi-orb-float-a absolute -translate-x-44 -translate-y-40 w-72 h-72 rounded-full blur-3xl opacity-60"
            style={{
              background:
                'radial-gradient(circle, rgba(45, 212, 191, 0.5) 0%, rgba(45, 212, 191, 0.09) 58%, transparent 76%)',
            }}
          />
          <div
            className="ahi-orb-float-b absolute translate-x-44 translate-y-36 w-80 h-80 rounded-full blur-3xl opacity-55"
            style={{
              background:
                'radial-gradient(circle, rgba(52, 211, 153, 0.45) 0%, rgba(45, 212, 191, 0.08) 58%, transparent 76%)',
            }}
          />
        </div>

        {/* Subtle Close Button in Top-Right Backdrop */}
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          aria-label="Close sign in card"
          className="fixed top-5 right-5 z-20 w-10 h-10 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center backdrop-blur-xl transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Centered 3D Flip Stage */}
        <div className="relative z-10 my-auto flex flex-col items-center">
          <div
            className="w-[min(92vw,440px)] h-[min(92vw,440px)]"
            style={{ perspective: '1200px' }}
          >
            <div
              className="relative w-full h-full"
              style={{
                transformStyle: 'preserve-3d',
                willChange: 'transform',
                transition: 'transform 0.7s cubic-bezier(0.34, 1.56, 0.64, 1)',
                transform: isSignUp ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
            >
              {/* ================= FRONT FACE: LOGIN ================= */}
              <div
                aria-hidden={isSignUp}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '9999px',
                  overflow: 'hidden',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(0deg) translateZ(1px)',
                }}
                className={`bg-slate-900/80 backdrop-blur-2xl border border-white/15 shadow-[0_0_48px_rgba(45,212,191,0.14),inset_0_1px_2px_rgba(255,255,255,0.22),inset_0_-18px_36px_rgba(45,212,191,0.10),0_28px_80px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between pt-6 pb-6 px-9 sm:pt-8 sm:pb-7 sm:px-14 ${
                  isSignUp ? 'pointer-events-none' : ''
                }`}
              >
                {/* Soft Top Specular Frosted Glass Sheen */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.14),rgba(255,255,255,0.03)_42%,rgba(7,9,14,0.45)_100%)]"
                />

                {/* Emblem + Heading */}
                <div className="relative z-10 flex flex-col items-center gap-1.5 text-center">
                  <div className="w-9 h-9 rounded-full bg-[#07090E]/55 border border-[#2DD4BF]/35 flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.22)]">
                    <AhiGeometricMark className="w-6 h-6" />
                  </div>
                  <h2
                    id={!isSignUp ? 'ahi-auth-heading' : undefined}
                    className="text-xl font-display font-bold tracking-tight text-[#F8FAFC]"
                  >
                    Login
                  </h2>
                </div>

                {/* Login Form Controls */}
                <form
                  onSubmit={(e) => void handleLoginSubmit(e)}
                  className="relative z-10 w-full max-w-[274px] space-y-2.5"
                >
                  <input
                    type="text"
                    inputMode="email"
                    autoComplete="username"
                    required
                    tabIndex={isSignUp ? -1 : 0}
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="Email / Username"
                    aria-label="Email or Username"
                    className="w-full h-10 rounded-full bg-white/[0.07] border border-white/15 px-4 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/80 focus:bg-white/[0.1] transition-colors"
                  />

                  <div className="relative">
                    <input
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      tabIndex={isSignUp ? -1 : 0}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password"
                      aria-label="Password"
                      className="w-full h-10 rounded-full bg-white/[0.07] border border-white/15 pl-4 pr-10 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/80 focus:bg-white/[0.1] transition-colors"
                    />
                    <button
                      type="button"
                      tabIndex={isSignUp ? -1 : 0}
                      onClick={() => setShowLoginPassword((prev) => !prev)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                    >
                      {showLoginPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Animated Remember Me Pill Toggle Switch */}
                  <div className="flex items-center justify-center py-0.5">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rememberMe}
                      tabIndex={isSignUp ? -1 : 0}
                      onClick={() => setRememberMe((prev) => !prev)}
                      className="inline-flex items-center gap-2.5 text-[11px] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors duration-300 cursor-pointer select-none"
                    >
                      <span
                        className={`relative inline-flex items-center w-9 h-5 rounded-full border transition-all duration-300 ${
                          rememberMe
                            ? 'bg-[#2DD4BF]/25 border-[#2DD4BF]/80 shadow-[0_0_14px_rgba(45,212,191,0.4)]'
                            : 'bg-white/[0.08] border-white/15'
                        }`}
                      >
                        <span
                          className={`w-3.5 h-3.5 rounded-full transition-all duration-300 ${
                            rememberMe
                              ? 'translate-x-[18px] bg-[#2DD4BF] shadow-[0_0_8px_rgba(45,212,191,0.85)]'
                              : 'translate-x-[2px] bg-[#94A3B8]'
                          }`}
                        />
                      </span>
                      <span>Remember me</span>
                    </button>
                  </div>

                  {/* Primary SIGN IN + Quick Continue with Google Icon */}
                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="submit"
                      disabled={busy}
                      tabIndex={isSignUp ? -1 : 0}
                      className="flex-1 h-10 rounded-full bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-50 text-[#07090E] font-display font-bold text-xs tracking-wider shadow-[0_0_20px_rgba(45,212,191,0.32)] hover:shadow-[0_0_28px_rgba(45,212,191,0.58)] transition-all duration-300 cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SIGN IN'}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      tabIndex={isSignUp ? -1 : 0}
                      onClick={() => void handleGoogleSignIn()}
                      aria-label="Continue with Google"
                      title="Continue with Google"
                      className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/20 hover:border-[#2DD4BF]/60 flex items-center justify-center transition-all duration-300 cursor-pointer shrink-0 hover:shadow-[0_0_18px_rgba(45,212,191,0.28)]"
                    >
                      <GoogleGlyph />
                    </button>
                  </div>
                </form>

                {/* Flip Link to Back (Sign Up) */}
                <button
                  type="button"
                  disabled={busy}
                  tabIndex={isSignUp ? -1 : 0}
                  onClick={() => {
                    setErrorMsg(null);
                    setInfoMsg(null);
                    setIsSignUp(true);
                  }}
                  className="relative z-10 text-[11px] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                >
                  Don&apos;t have an account?{' '}
                  <span className="font-semibold text-[#2DD4BF] hover:text-[#34D399]">
                    Sign Up
                  </span>
                </button>
              </div>

              {/* ================= BACK FACE: SIGN UP ================= */}
              <div
                aria-hidden={!isSignUp}
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '9999px',
                  overflow: 'hidden',
                  backfaceVisibility: 'hidden',
                  WebkitBackfaceVisibility: 'hidden',
                  transform: 'rotateY(180deg) translateZ(1px)',
                }}
                className={`bg-slate-900/80 backdrop-blur-2xl border border-white/15 shadow-[0_0_48px_rgba(45,212,191,0.14),inset_0_1px_2px_rgba(255,255,255,0.22),inset_0_-18px_36px_rgba(45,212,191,0.10),0_28px_80px_rgba(0,0,0,0.85)] flex flex-col items-center justify-between pt-6 pb-6 px-9 sm:pt-7 sm:pb-6 sm:px-14 ${
                  !isSignUp ? 'pointer-events-none' : ''
                }`}
              >
                {/* Soft Top Specular Frosted Glass Sheen */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_15%,rgba(255,255,255,0.14),rgba(255,255,255,0.03)_42%,rgba(7,9,14,0.45)_100%)]"
                />

                {/* Emblem + Heading */}
                <div className="relative z-10 flex flex-col items-center gap-1 text-center">
                  <div className="w-8 h-8 rounded-full bg-[#07090E]/55 border border-[#2DD4BF]/35 flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.22)]">
                    <AhiGeometricMark className="w-5 h-5" />
                  </div>
                  <h2
                    id={isSignUp ? 'ahi-auth-heading' : undefined}
                    className="text-lg sm:text-xl font-display font-bold tracking-tight text-[#F8FAFC]"
                  >
                    Sign Up
                  </h2>
                </div>

                {/* Sign Up Form Controls */}
                <form
                  onSubmit={(e) => void handleSignUpSubmit(e)}
                  className="relative z-10 w-full max-w-[274px] space-y-2"
                >
                  <input
                    type="email"
                    autoComplete="email"
                    required
                    tabIndex={!isSignUp ? -1 : 0}
                    value={signupEmail}
                    onChange={(e) => setSignupEmail(e.target.value)}
                    placeholder="Email"
                    aria-label="Email"
                    className="w-full h-9 sm:h-10 rounded-full bg-white/[0.07] border border-white/15 px-4 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/80 focus:bg-white/[0.1] transition-colors"
                  />

                  <div className="relative">
                    <input
                      type={showSignupPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      tabIndex={!isSignUp ? -1 : 0}
                      value={signupPassword}
                      onChange={(e) => setSignupPassword(e.target.value)}
                      placeholder="Password (min 6 chars)"
                      aria-label="Password"
                      className="w-full h-9 sm:h-10 rounded-full bg-white/[0.07] border border-white/15 pl-4 pr-10 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/80 focus:bg-white/[0.1] transition-colors"
                    />
                    <button
                      type="button"
                      tabIndex={!isSignUp ? -1 : 0}
                      onClick={() => setShowSignupPassword((prev) => !prev)}
                      aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                    >
                      {showSignupPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={showSignupConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      required
                      minLength={6}
                      tabIndex={!isSignUp ? -1 : 0}
                      value={signupConfirmPassword}
                      onChange={(e) => setSignupConfirmPassword(e.target.value)}
                      placeholder="Confirm Password"
                      aria-label="Confirm Password"
                      className="w-full h-9 sm:h-10 rounded-full bg-white/[0.07] border border-white/15 pl-4 pr-10 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/80 focus:bg-white/[0.1] transition-colors"
                    />
                    <button
                      type="button"
                      tabIndex={!isSignUp ? -1 : 0}
                      onClick={() => setShowSignupConfirm((prev) => !prev)}
                      aria-label={
                        showSignupConfirm ? 'Hide confirm password' : 'Show confirm password'
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                    >
                      {showSignupConfirm ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>

                  {/* Primary SIGN UP + Quick Continue with Google Icon */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={busy}
                      tabIndex={!isSignUp ? -1 : 0}
                      className="flex-1 h-10 rounded-full bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-50 text-[#07090E] font-display font-bold text-xs tracking-wider shadow-[0_0_20px_rgba(45,212,191,0.32)] hover:shadow-[0_0_28px_rgba(45,212,191,0.58)] transition-all duration-300 cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'SIGN UP'}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      tabIndex={!isSignUp ? -1 : 0}
                      onClick={() => void handleGoogleSignIn()}
                      aria-label="Continue with Google"
                      title="Continue with Google"
                      className="w-10 h-10 rounded-full bg-white/[0.08] hover:bg-white/[0.16] border border-white/20 hover:border-[#2DD4BF]/60 flex items-center justify-center transition-all duration-300 cursor-pointer shrink-0 hover:shadow-[0_0_18px_rgba(45,212,191,0.28)]"
                    >
                      <GoogleGlyph />
                    </button>
                  </div>
                </form>

                {/* Flip Link to Front (Login) */}
                <button
                  type="button"
                  disabled={busy}
                  tabIndex={!isSignUp ? -1 : 0}
                  onClick={() => {
                    setErrorMsg(null);
                    setInfoMsg(null);
                    setIsSignUp(false);
                  }}
                  className="relative z-10 text-[11px] text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer"
                >
                  Already have an account?{' '}
                  <span className="font-semibold text-[#2DD4BF] hover:text-[#34D399]">
                    Login
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Feedback Banners Safely Placed Below the Circular Card */}
          {errorMsg && (
            <div
              role="alert"
              className="mt-4 max-w-[380px] rounded-full bg-red-950/75 border border-red-500/45 px-4 py-2 text-[11px] text-red-200 text-center backdrop-blur-xl shadow-lg"
            >
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div
              role="status"
              className="mt-4 max-w-[380px] rounded-full bg-[rgba(17,22,33,0.85)] border border-[#2DD4BF]/45 px-4 py-2 text-[11px] text-[#F8FAFC] text-center backdrop-blur-xl shadow-lg inline-flex items-center gap-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
              <span>{infoMsg}</span>
            </div>
          )}

          {/* Subtle Guest Testing Link Below Circular Glass Card */}
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="mt-5 px-4 py-1.5 rounded-full text-xs text-[#94A3B8] hover:text-[#2DD4BF] hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            Continue as Guest (Free)
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // Authenticated View: Creator Workspace & Backup Controls
  // =========================================================================
  return (
    <div
      className="fixed inset-0 z-50 bg-[#07090E]/82 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md bg-[rgba(17,22,33,0.88)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_24px_64px_rgba(0,0,0,0.75)] rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-[#2DD4BF]" />
            <h2 id="profile-modal-title" className="text-sm font-display font-semibold text-[#F8FAFC]">
              Creator Workspace
            </h2>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/5 cursor-pointer"
            aria-label="Close account dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs max-h-[84vh] overflow-y-auto">
          <div
            className={`rounded-2xl px-3.5 py-2.5 border flex items-center gap-2.5 ${
              workspaceMode === 'cloud'
                ? 'bg-[#2DD4BF]/10 border-[#2DD4BF]/35 text-[#F8FAFC]'
                : 'bg-[#07090E]/70 border-white/10 text-[#F8FAFC]'
            }`}
          >
            {workspaceMode === 'cloud' ? (
              <Cloud className="w-4 h-4 text-[#2DD4BF] shrink-0" />
            ) : (
              <HardDrive className="w-4 h-4 text-[#2DD4BF] shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">
                {workspaceMode === 'cloud'
                  ? 'Private Cloud Workspace Active'
                  : 'Email Verification Pending · Local Guest Storage'}
              </div>
              <div className="text-[11px] text-[#94A3B8]">
                {workspaceMode === 'cloud'
                  ? 'Projects, characters & creations sync privately to your account.'
                  : 'Create immediately with zero paywalls, zero limits, and zero watermarks.'}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="bg-[#07090E]/70 border border-white/10 rounded-xl p-3">
              <div className="text-[#64748B] text-[11px]">Projects</div>
              <div className="text-base font-display font-bold text-[#F8FAFC] mt-0.5 tabular-nums">
                {projectCount}
              </div>
            </div>
            <div className="bg-[#07090E]/70 border border-white/10 rounded-xl p-3">
              <div className="text-[#64748B] text-[11px]">Characters</div>
              <div className="text-base font-display font-bold text-[#F8FAFC] mt-0.5 tabular-nums">
                {characterCount}
              </div>
            </div>
            <div className="bg-[#07090E]/70 border border-white/10 rounded-xl p-3">
              <div className="text-[#64748B] text-[11px]">Creations</div>
              <div className="text-base font-display font-bold text-[#F8FAFC] mt-0.5 tabular-nums">
                {creationCount}
              </div>
            </div>
          </div>

          {errorMsg && (
            <div className="rounded-xl bg-red-950/50 border border-red-500/40 px-3.5 py-2.5 text-red-200 leading-relaxed">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="rounded-xl bg-[#2DD4BF]/10 border border-[#2DD4BF]/35 px-3.5 py-2.5 text-[#F8FAFC] leading-relaxed flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#2DD4BF] shrink-0 mt-0.5" />
              <span>{infoMsg}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="bg-[#07090E]/70 border border-white/10 rounded-xl p-3.5 flex items-center gap-3">
              {authUser.photoURL ? (
                <img
                  src={authUser.photoURL}
                  alt={displayName}
                  className="w-10 h-10 rounded-full object-cover border border-white/15 shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#2DD4BF] text-[#07090E] font-display font-bold flex items-center justify-center shrink-0">
                  {(displayName[0] || 'C').toUpperCase()}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[#F8FAFC] truncate">{displayName}</div>
                <div className="text-[11px] text-[#94A3B8] truncate">{authUser.email}</div>
              </div>
            </div>

            {workspaceMode === 'guest-unverified' && (
              <div className="bg-[#07090E]/70 border border-[#2DD4BF]/40 rounded-xl p-3.5 space-y-2.5">
                <div className="text-[#F8FAFC] font-medium">
                  Verify your email to enable private Firestore cloud sync
                </div>
                <p className="text-[11px] text-[#94A3B8] leading-relaxed">
                  While waiting, all creations continue saving locally in IndexedDB so nothing slows you down.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleResendVerification()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-[#F8FAFC] cursor-pointer"
                  >
                    <Mail className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    Resend Email
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleRefresh()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] font-semibold cursor-pointer"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    I&apos;ve Verified
                  </button>
                </div>
              </div>
            )}

            {workspaceMode === 'cloud' && (
              <>
                <form onSubmit={(e) => void handleSaveName(e)} className="space-y-2">
                  <label className="block text-[#94A3B8]">Creator Name</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Your name or studio handle"
                      className="flex-1 bg-[#07090E]/85 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none focus:border-[#2DD4BF]/60"
                    />
                    <button
                      type="submit"
                      disabled={busy || !nameInput.trim()}
                      className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-[#F8FAFC] font-semibold cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </form>

                <button
                  type="button"
                  disabled={syncing}
                  onClick={async () => {
                    setSyncing(true);
                    setErrorMsg(null);
                    setInfoMsg(null);
                    try {
                      await onSyncGuestToCloud();
                      setInfoMsg('Local guest projects & creations synced to your cloud workspace.');
                    } catch (err) {
                      setErrorMsg(err instanceof Error ? err.message : 'Sync failed.');
                    } finally {
                      setSyncing(false);
                    }
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-[#07090E]/70 hover:bg-white/5 border border-white/10 hover:border-[#2DD4BF]/40 text-[#F8FAFC] font-medium cursor-pointer transition-colors"
                >
                  {syncing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-[#2DD4BF]" />
                  ) : (
                    <Cloud className="w-3.5 h-3.5 text-[#2DD4BF]" />
                  )}
                  Sync Local Guest Work to Cloud
                </button>
              </>
            )}
          </div>

          <div className="pt-2 border-t border-white/10 space-y-2">
            <div className="text-[#94A3B8]">Project Backup Files (.ahi)</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={onExportBackup}
                className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#F8FAFC] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Save Backup
              </button>
              <label className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-[#F8FAFC] cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-[#94A3B8]" />
                Load Backup
                <input
                  type="file"
                  accept=".ahi,.json"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) {
                      onImportBackup(f);
                      onClose();
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 pt-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleSignOut()}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>

            <button
              type="button"
              onClick={onClose}
              className="ml-auto px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-[#F8FAFC] font-medium cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
