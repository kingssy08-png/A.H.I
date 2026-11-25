import { useEffect, useId, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  FolderKanban,
  Gem,
  Image as ImageIcon,
  ImagePlus,
  LogIn,
  LogOut,
  Mic,
  Settings,
  Sparkles,
  User as UserIcon,
  Users,
  Video,
} from 'lucide-react';
import type { User as FirebaseUser } from 'firebase/auth';

export type SidebarSectionId =
  | 'create'
  | 'text-to-image'
  | 'text-to-video'
  | 'image-to-video'
  | 'story'
  | 'characters'
  | 'voice'
  | 'projects';

interface CurvedFrostedSidebarProps {
  activeSection: SidebarSectionId;
  authUser: FirebaseUser | null;
  displayName: string;
  turboLive: boolean;
  onSelectSection: (section: SidebarSectionId) => void;
  onOpenProfile: () => void;
  onOpenSettings: () => void;
  onLogout: () => void;
  onExpandedChange?: (expanded: boolean) => void;
}

const MENU_ITEMS: Array<{
  id: SidebarSectionId;
  label: string;
  icon: typeof Sparkles;
}> = [
  { id: 'create', label: 'Create', icon: Sparkles },
  { id: 'text-to-image', label: 'Text-to-Image', icon: ImageIcon },
  { id: 'text-to-video', label: 'Text-to-Video', icon: Video },
  { id: 'image-to-video', label: 'Image-to-Video', icon: ImagePlus },
  { id: 'story', label: 'Story & Episodes', icon: Film },
  { id: 'characters', label: 'Character Library', icon: Users },
  { id: 'voice', label: 'Voice & Lip-Sync', icon: Mic },
  { id: 'projects', label: 'My Projects', icon: FolderKanban },
];

export function CurvedFrostedSidebar({
  activeSection,
  authUser,
  displayName,
  turboLive,
  onSelectSection,
  onOpenProfile,
  onOpenSettings,
  onLogout,
  onExpandedChange,
}: CurvedFrostedSidebarProps) {
  const [isPinned, setIsPinned] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [suppressHoverUntilLeave, setSuppressHoverUntilLeave] = useState(false);

  const isExpanded = isPinned || (isHovered && !suppressHoverUntilLeave);

  const asideRef = useRef<HTMLElement | null>(null);
  const [boxSize, setBoxSize] = useState<{ width: number; height: number }>({
    width: 68,
    height: 760,
  });

  const rawId = useId().replace(/:/g, '');
  const clipId = `ahi-curved-sidebar-${rawId}`;
  const innerClipId = `ahi-curved-sidebar-inner-${rawId}`;

  useEffect(() => {
    onExpandedChange?.(isExpanded);
  }, [isExpanded, onExpandedChange]);

  useEffect(() => {
    const el = asideRef.current;
    if (!el) return;

    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setBoxSize({ width: rect.width, height: rect.height });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const handleToggleExpand = () => {
    if (isExpanded) {
      setIsPinned(false);
      setIsHovered(false);
      setSuppressHoverUntilLeave(true);
    } else {
      setIsPinned(true);
      setSuppressHoverUntilLeave(false);
    }
  };

  const w = Math.max(60, boxSize.width);
  const h = Math.max(240, boxSize.height);
  const r = Math.min(26, w / 2 - 4, h / 6);
  const dip = w > 145 ? 18 : 7;
  const xR = w - 1;
  const xIn = w - 1 - dip;

  const curvePath = [
    `M ${r} 1`,
    `L ${(xR - r).toFixed(1)} 1`,
    `Q ${xR.toFixed(1)} 1 ${xR.toFixed(1)} ${r.toFixed(1)}`,
    `C ${xR.toFixed(1)} ${(h * 0.22).toFixed(1)}, ${xIn.toFixed(1)} ${(h * 0.34).toFixed(1)}, ${xIn.toFixed(1)} ${(h * 0.5).toFixed(1)}`,
    `C ${xIn.toFixed(1)} ${(h * 0.66).toFixed(1)}, ${xR.toFixed(1)} ${(h * 0.78).toFixed(1)}, ${xR.toFixed(1)} ${(h - r).toFixed(1)}`,
    `Q ${xR.toFixed(1)} ${(h - 1).toFixed(1)} ${(xR - r).toFixed(1)} ${(h - 1).toFixed(1)}`,
    `L ${r.toFixed(1)} ${(h - 1).toFixed(1)}`,
    `Q 1 ${(h - 1).toFixed(1)} 1 ${(h - r).toFixed(1)}`,
    `L 1 ${r.toFixed(1)}`,
    `Q 1 1 ${r.toFixed(1)} 1`,
    'Z',
  ].join(' ');

  const shortUserId = authUser
    ? `ID ${authUser.uid.slice(0, 6).toUpperCase()}`
    : 'LOCAL GUEST';
  const cleanName = displayName.trim() || 'Creator';

  return (
    <>
      {/* Mobile Backdrop when Expanded */}
      {isExpanded && (
        <div
          aria-hidden="true"
          onClick={() => {
            setIsPinned(false);
            setIsHovered(false);
          }}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        ref={asideRef}
        aria-label="Studio sidebar navigation"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => {
          setIsHovered(false);
          setSuppressHoverUntilLeave(false);
        }}
        className={`fixed left-3 sm:left-4 top-3 sm:top-4 bottom-3 sm:bottom-4 z-40 transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] drop-shadow-[0_24px_48px_rgba(0,0,0,0.65)] ${
          isExpanded ? 'w-[260px]' : 'w-[68px]'
        }`}
      >
        {/* SVG ClipPath Definitions */}
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          className="absolute pointer-events-none"
        >
          <defs>
            <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
              <path d={curvePath} />
            </clipPath>
            <clipPath id={innerClipId} clipPathUnits="userSpaceOnUse">
              <path d={curvePath} />
            </clipPath>
          </defs>
        </svg>

        {/* Frosted-Glass Clipped Body */}
        <div
          style={{ clipPath: `url(#${clipId})` }}
          className="relative w-full h-full backdrop-blur-2xl bg-[rgba(17,22,33,0.72)] flex flex-col justify-between overflow-hidden"
        >
          {/* Subtle Inner Specular Glass Highlight */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.05] via-transparent to-[#07090E]/55"
          />

          {/* Top Section: Brand + Profile */}
          <div
            className={`relative z-10 pt-4 pb-2 transition-all duration-300 ${
              isExpanded ? 'px-4 pr-6' : 'px-2.5'
            } space-y-3`}
          >
            {/* Brand Header + Collapse/Expand Toggle */}
            <div
              className={`flex items-center ${
                isExpanded ? 'justify-between gap-2' : 'justify-center'
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectSection('create')}
                className="flex items-center gap-2.5 text-left cursor-pointer group shrink-0"
                title="A.H.I Studio"
              >
                <span className="w-9 h-9 rounded-xl bg-[#2DD4BF] group-hover:bg-[#34D399] text-[#07090E] flex items-center justify-center shadow-[0_0_20px_rgba(45,212,191,0.3)] group-hover:scale-105 transition-all shrink-0">
                  <Clapperboard className="w-4 h-4 stroke-[2.3]" />
                </span>
                {isExpanded && (
                  <div className="min-w-0">
                    <div className="font-display font-bold text-sm tracking-wider text-[#F8FAFC] leading-none">
                      A.H.I
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5 whitespace-nowrap">
                      Free Cinema Studio
                    </div>
                  </div>
                )}
              </button>

              {isExpanded && (
                <button
                  type="button"
                  onClick={handleToggleExpand}
                  aria-label="Collapse sidebar"
                  title="Collapse sidebar"
                  className="p-1.5 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* User Avatar (Collapsed) or Sleek Profile Card (Expanded) */}
            {isExpanded ? (
              <button
                type="button"
                onClick={onOpenProfile}
                className="w-full text-left rounded-2xl bg-white/[0.04] hover:bg-white/[0.09] border border-white/10 hover:border-[#2DD4BF]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-2.5 flex items-center gap-2.5 transition-all cursor-pointer group"
              >
                {authUser?.photoURL ? (
                  <img
                    src={authUser.photoURL}
                    alt={cleanName}
                    referrerPolicy="no-referrer"
                    className="w-9 h-9 rounded-full object-cover border border-white/15 shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[#2DD4BF] flex items-center justify-center font-display font-bold text-xs shrink-0">
                    {authUser ? (
                      (cleanName[0] || 'C').toUpperCase()
                    ) : (
                      <UserIcon className="w-4 h-4" />
                    )}
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs font-semibold text-[#F8FAFC] truncate">
                      {authUser ? cleanName : 'Guest Creator'}
                    </span>
                    <span className="px-1.5 py-0.5 rounded-full bg-[#2DD4BF]/15 border border-[#2DD4BF]/40 text-[#2DD4BF] text-[9px] font-bold tracking-wide shrink-0">
                      FREE
                    </span>
                  </div>
                  <div className="text-[10px] font-mono text-[#64748B] truncate mt-0.5">
                    {shortUserId}
                  </div>
                </div>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={onOpenProfile}
                  title={authUser ? `${cleanName} · Account` : 'Sign In / Guest Workspace'}
                  className="relative w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-[#2DD4BF]/45 flex items-center justify-center transition-all cursor-pointer overflow-hidden"
                >
                  {authUser?.photoURL ? (
                    <img
                      src={authUser.photoURL}
                      alt={cleanName}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <UserIcon className="w-4 h-4 text-[#2DD4BF]" />
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Middle Section: Clean Vertical Navigation Items */}
          <nav
            aria-label="Studio workspace tools"
            className={`relative z-10 flex-1 overflow-y-auto py-1 space-y-1 transition-all duration-300 ${
              isExpanded ? 'px-3 pr-7' : 'px-2 pr-3'
            }`}
          >
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  aria-current={isActive ? 'page' : undefined}
                  onClick={() => onSelectSection(item.id)}
                  title={!isExpanded ? item.label : undefined}
                  className={`w-full flex items-center rounded-2xl transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2DD4BF]/60 ${
                    isExpanded ? 'gap-3 px-3 py-2.5 justify-start' : 'h-10 justify-center'
                  } ${
                    isActive
                      ? 'bg-[#2DD4BF]/15 border border-[#2DD4BF]/40 text-[#F8FAFC] shadow-[0_0_20px_rgba(45,212,191,0.16)] backdrop-blur-md'
                      : 'border border-transparent text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.06] hover:border-white/10'
                  }`}
                >
                  <Icon
                    strokeWidth={isActive ? 2.1 : 1.75}
                    className={`w-[18px] h-[18px] shrink-0 transition-transform ${
                      isActive ? 'text-[#2DD4BF]' : 'text-[#94A3B8]'
                    }`}
                  />
                  {isExpanded && (
                    <span className="text-xs font-medium tracking-tight whitespace-nowrap truncate">
                      {item.label}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Bottom Section: Free Engine Mini-Card / Status Gem + Settings + Log out */}
          <div
            className={`relative z-10 pt-2 pb-4 space-y-2 transition-all duration-300 ${
              isExpanded ? 'px-3.5 pr-6' : 'px-2 pr-3'
            }`}
          >
            {isExpanded ? (
              <button
                type="button"
                onClick={onOpenSettings}
                className="w-full text-left rounded-2xl bg-[#07090E]/65 hover:bg-[#07090E]/85 border border-white/10 hover:border-[#2DD4BF]/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] p-3 space-y-1 transition-all cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-display font-bold tracking-wide text-[#F8FAFC] flex items-center gap-1.5">
                    <Gem className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    FREE UNLIMITED
                  </span>
                </div>
                <div className="text-[10px] text-[#94A3B8] leading-snug">
                  100% Free · Zero Watermarks · Private
                </div>
              </button>
            ) : (
              <div className="flex flex-col items-center gap-1.5 pb-0.5">
                <button
                  type="button"
                  onClick={handleToggleExpand}
                  aria-label="Expand sidebar"
                  title="Expand sidebar"
                  className="w-9 h-9 rounded-xl bg-white/[0.05] hover:bg-white/[0.12] border border-white/10 hover:border-[#2DD4BF]/40 text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center transition-all cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  title="Account Settings"
                  className="w-9 h-9 rounded-xl bg-[#07090E]/65 hover:bg-[#07090E]/85 border border-[#2DD4BF]/35 text-[#2DD4BF] flex items-center justify-center shadow-[0_0_18px_rgba(45,212,191,0.22)] transition-all cursor-pointer"
                >
                  <Gem className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Footer Actions: Settings & Log out */}
            <div
              className={`pt-1 border-t border-white/10 ${
                isExpanded ? 'flex items-center justify-between gap-1.5' : 'flex flex-col items-center gap-1'
              }`}
            >
              <button
                type="button"
                onClick={onOpenSettings}
                title="Account Settings"
                className={`inline-flex items-center rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.07] transition-colors cursor-pointer ${
                  isExpanded ? 'gap-2 px-2.5 py-2 text-xs font-medium flex-1' : 'w-9 h-9 justify-center'
                }`}
              >
                <Settings className="w-4 h-4 shrink-0" />
                {isExpanded && <span className="whitespace-nowrap">Settings</span>}
              </button>

              <button
                type="button"
                onClick={onLogout}
                title={authUser ? 'Log out' : 'Sign In / Create Account'}
                className={`inline-flex items-center rounded-xl text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-white/[0.07] transition-colors cursor-pointer ${
                  isExpanded ? 'gap-2 px-2.5 py-2 text-xs font-medium' : 'w-9 h-9 justify-center'
                }`}
              >
                {authUser ? (
                  <LogOut className="w-4 h-4 shrink-0" />
                ) : (
                  <LogIn className="w-4 h-4 shrink-0 text-[#2DD4BF]" />
                )}
                {isExpanded && (
                  <span className="whitespace-nowrap">
                    {authUser ? 'Log out' : 'Sign In'}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Crisp Curved Outer Border + Subtle Inner Specular Rim Tracing the Exact Organic Curve */}
        <svg
          width={w}
          height={h}
          viewBox={`0 0 ${w} ${h}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 w-full h-full"
        >
          <path
            d={curvePath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.05)"
            strokeWidth="3.5"
            clipPath={`url(#${innerClipId})`}
          />
          <path
            d={curvePath}
            fill="none"
            stroke="rgba(255, 255, 255, 0.10)"
            strokeWidth="1.25"
          />
        </svg>
      </aside>
    </>
  );
}
