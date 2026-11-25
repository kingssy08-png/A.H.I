import { useId } from 'react';
import { Check } from 'lucide-react';

interface AhiGeometricMarkProps {
  className?: string;
}

/**
 * Geometric A.H.I emblem mark (sleek aperture triangle + precision cinema bridge)
 * synced with Electric Mint-Cyan (#2DD4BF / #34D399) and Crisp White (#F8FAFC).
 */
export function AhiGeometricMark({ className = 'w-10 h-10' }: AhiGeometricMarkProps) {
  const uid = useId().replace(/:/g, '');
  const gradId = `ahi-mark-grad-${uid}`;

  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="10" y1="8" x2="54" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="55%" stopColor="#34D399" />
          <stop offset="100%" stopColor="#2DD4BF" />
        </linearGradient>
      </defs>

      {/* Outer beveled hexagon / cinema frame */}
      <path
        d="M32 6L54.5 19V45L32 58L9.5 45V19L32 6Z"
        stroke="rgba(255,255,255,0.16)"
        strokeWidth="1.5"
        fill="rgba(45,212,191,0.06)"
      />

      {/* Geometric 'A' apex + precision aperture struts */}
      <path
        d="M32 14L46.5 44H39.5L32 28.2L24.5 44H17.5L32 14Z"
        fill={`url(#${gradId})`}
      />

      {/* Precision cinema H-bar & lens core */}
      <rect x="24" y="34.5" width="16" height="3.2" rx="1.6" fill="#F8FAFC" />
      <circle cx="32" cy="23.5" r="2.2" fill="#07090E" />
    </svg>
  );
}

export const KINGSSY_SVG_VIEWBOX = { width: 640, height: 200 } as const;

// Continuous flowing calligraphic cursive path for "Kingssy"
export const KINGSSY_MAIN_PATH =
  'M 48 134 C 66 116, 86 64, 96 34 C 102 20, 114 22, 108 38 C 98 68, 82 104, 72 132 C 86 102, 128 52, 162 42 C 172 39, 174 48, 158 58 C 134 72, 102 84, 90 90 C 110 92, 126 114, 140 128 C 148 135, 162 126, 174 108 C 182 96, 188 86, 190 82 C 186 96, 182 118, 188 128 C 194 134, 208 122, 218 102 C 224 90, 232 82, 236 92 C 238 104, 234 120, 232 128 C 238 106, 254 84, 266 86 C 276 88, 272 114, 276 126 C 282 134, 298 122, 310 104 C 324 84, 344 82, 348 94 C 352 108, 336 128, 320 128 C 308 128, 306 110, 318 96 C 330 82, 346 82, 350 88 C 344 114, 336 154, 322 172 C 310 186, 294 176, 302 158 C 312 138, 346 124, 376 104 C 388 94, 398 82, 404 82 C 412 84, 422 104, 418 118 C 414 130, 396 132, 390 122 C 388 116, 406 128, 434 106 C 446 96, 456 82, 462 82 C 470 84, 480 104, 476 118 C 472 130, 454 132, 448 122 C 446 116, 464 128, 492 104 C 500 94, 504 84, 506 84 C 504 98, 502 120, 512 126 C 522 132, 538 112, 548 86 C 542 114, 532 156, 516 174 C 504 188, 488 178, 498 158 C 510 134, 554 126, 602 114';

export const KINGSSY_DOT_CENTER = { x: 192, y: 58 } as const;
export const KINGSSY_SWASH_PATH = 'M 116 154 C 242 146, 418 140, 588 134';

export interface AhiCalligraphyStageProps {
  signatureText?: string;
  subtitleText?: string;
  replayKey?: number;
  compact?: boolean;
  className?: string;
}

/**
 * Continuous After Effects-inspired trim-path calligraphy reveal + diagonal Mint-Cyan light-beam streak.
 * Renders the bespoke continuous cursive SVG stroke for "Kingssy" and expressive animated script + swash for custom Show Names.
 */
export function AhiCalligraphyStage({
  signatureText = 'Kingssy',
  subtitleText = 'A.H.I CINEMA STUDIO',
  replayKey = 0,
  compact = false,
  className = '',
}: AhiCalligraphyStageProps) {
  const uid = useId().replace(/:/g, '');
  const strokeGradId = `ahi-sig-stroke-${uid}`;
  const swashGradId = `ahi-sig-swash-${uid}`;
  const trimmed = signatureText.trim() || 'Kingssy';
  const isKingssySignature = /^kingssy$/i.test(trimmed);

  return (
    <div
      key={replayKey}
      className={`relative overflow-hidden flex flex-col items-center justify-center select-none ${className}`}
    >
      {/* Subtle radial Mint-Cyan ambient backdrop glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 68% 55% at 50% 48%, rgba(45, 212, 191, 0.14), rgba(52, 211, 153, 0.04) 48%, transparent 74%)',
        }}
      />

      {/* Calligraphic Signature Stage */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        {isKingssySignature ? (
          <svg
            viewBox={`0 0 ${KINGSSY_SVG_VIEWBOX.width} ${KINGSSY_SVG_VIEWBOX.height}`}
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={`ahi-signature-neon ${
              compact ? 'w-72 sm:w-80 h-auto' : 'w-[320px] sm:w-[490px] h-auto'
            }`}
            aria-label="Kingssy handwritten signature"
          >
            <defs>
              <linearGradient id={strokeGradId} x1="48" y1="30" x2="602" y2="165" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#F8FAFC" />
                <stop offset="68%" stopColor="#F8FAFC" />
                <stop offset="88%" stopColor="#CCFBF1" />
                <stop offset="100%" stopColor="#2DD4BF" />
              </linearGradient>
              <linearGradient id={swashGradId} x1="116" y1="145" x2="588" y2="138" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#F8FAFC" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Continuous Flowing Calligraphic "Kingssy" Trim-Path Stroke (1.6s ease-in-out) */}
            <path
              pathLength={1000}
              d={KINGSSY_MAIN_PATH}
              stroke={`url(#${strokeGradId})`}
              strokeWidth="4.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="ahi-trim-stroke"
            />

            {/* Calligraphic 'i' Dot Accent */}
            <path
              pathLength={1000}
              d={`M ${KINGSSY_DOT_CENTER.x} ${KINGSSY_DOT_CENTER.y} L ${KINGSSY_DOT_CENTER.x + 2} ${KINGSSY_DOT_CENTER.y - 1}`}
              stroke="#2DD4BF"
              strokeWidth="6.5"
              strokeLinecap="round"
              className="ahi-trim-swash"
            />

            {/* Sleek Calligraphic Underline Flourish */}
            <path
              pathLength={1000}
              d={KINGSSY_SWASH_PATH}
              stroke={`url(#${swashGradId})`}
              strokeWidth="2.1"
              strokeLinecap="round"
              className="ahi-trim-swash"
            />
          </svg>
        ) : (
          <div className="ahi-signature-neon flex flex-col items-center">
            <div
              className={`ahi-signature-text-reveal font-signature text-[#F8FAFC] leading-tight tracking-wide px-4 py-1 ${
                compact ? 'text-4xl sm:text-5xl' : 'text-5xl sm:text-6xl'
              }`}
              style={{
                textShadow: '0 0 18px rgba(45, 212, 191, 0.5)',
              }}
            >
              {trimmed}
            </div>
            <svg
              viewBox="0 0 380 34"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className={compact ? 'w-52 h-5 -mt-1' : 'w-64 sm:w-80 h-6 -mt-1'}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id={swashGradId} x1="12" y1="16" x2="368" y2="16" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#2DD4BF" stopOpacity="0.2" />
                  <stop offset="35%" stopColor="#F8FAFC" />
                  <stop offset="75%" stopColor="#2DD4BF" />
                  <stop offset="100%" stopColor="#34D399" stopOpacity="0.3" />
                </linearGradient>
              </defs>
              <path
                pathLength={1000}
                d="M 14 22 C 92 10, 218 6, 366 16 C 288 22, 184 26, 84 28"
                stroke={`url(#${swashGradId})`}
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ahi-trim-stroke"
              />
            </svg>
          </div>
        )}

        {subtitleText.trim() && (
          <div
            className={`font-display uppercase tracking-[0.28em] text-[#94A3B8] ${
              compact ? 'text-[9px] mt-1.5 pl-[0.28em]' : 'text-[11px] mt-2 pl-[0.28em]'
            }`}
          >
            {subtitleText}
          </div>
        )}
      </div>

      {/* Diagonal Electric Mint-Cyan Light-Beam Streak (0.4s sweep after 1.6s signature draw) */}
      <div
        aria-hidden="true"
        className="ahi-diagonal-beam pointer-events-none absolute -inset-y-12 left-0 w-36 z-20"
        style={{
          background:
            'linear-gradient(90deg, transparent 0%, rgba(45, 212, 191, 0.14) 22%, rgba(248, 250, 252, 0.58) 50%, rgba(52, 211, 153, 0.28) 74%, transparent 100%)',
          filter: 'blur(6px)',
        }}
      />
    </div>
  );
}

interface AhiSplashScreenProps {
  visible: boolean;
  fadingOut: boolean;
  statusLabel?: string;
  onSkip?: () => void;
}

export function AhiSplashScreen({
  visible,
  fadingOut,
  statusLabel = 'Preparing your studio workspace...',
  onSkip,
}: AhiSplashScreenProps) {
  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading A.H.I Studio"
      className={`fixed inset-0 z-[100] bg-[#07090E] overflow-hidden flex flex-col items-center justify-center px-6 transition-all duration-500 ease-out ${
        fadingOut ? 'opacity-0 scale-[1.015] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle Skip Button in Top-Right Corner */}
      {onSkip && (
        <button
          type="button"
          onClick={onSkip}
          className="fixed top-5 right-5 z-30 px-3.5 py-1.5 rounded-full bg-white/[0.06] hover:bg-white/[0.12] border border-white/15 hover:border-[#2DD4BF]/50 text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] backdrop-blur-xl transition-all cursor-pointer"
        >
          Skip
        </button>
      )}

      {/* Soft pulsing Mint-Cyan ambient aura */}
      <div
        aria-hidden="true"
        className="ahi-aura-breathe pointer-events-none absolute w-[520px] h-[520px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(45, 212, 191, 0.15) 0%, rgba(52, 211, 153, 0.05) 45%, transparent 72%)',
        }}
      />

      {/* Frosted-glass Stage Hosting the 1.6s Kingssy Calligraphy Trim-Path + 0.4s Diagonal Light Sweep */}
      <div className="relative flex flex-col items-center space-y-6 w-full max-w-2xl">
        <div className="relative w-full py-6 sm:py-8 rounded-3xl bg-[rgba(17,22,33,0.42)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_28px_80px_rgba(0,0,0,0.65)] overflow-hidden">
          <AhiCalligraphyStage
            signatureText="Kingssy"
            subtitleText="A.H.I · FREE AI CINEMA & ANIMATION STUDIO"
          />
        </div>

        {/* Status Text + Minimalist Fading Mint-Cyan Progress Bar */}
        <div className="flex flex-col items-center space-y-3 text-center">
          <p className="text-xs text-[#94A3B8] tracking-wide">{statusLabel}</p>

          <div
            className="relative w-52 h-[3px] rounded-full overflow-hidden bg-white/[0.06]"
            style={{
              maskImage: 'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
              WebkitMaskImage:
                'linear-gradient(to right, transparent, black 18%, black 82%, transparent)',
            }}
          >
            <div className="ahi-bar-sweep absolute inset-y-0 left-0 w-2/5 rounded-full bg-gradient-to-r from-transparent via-[#2DD4BF] to-[#34D399] shadow-[0_0_12px_rgba(45,212,191,0.75)]" />
          </div>
        </div>
      </div>
    </div>
  );
}

export type GenerationLoaderMode = 'image' | 'video' | 'talking' | 'episode' | 'export';

interface AhiGenerationLoaderProps {
  mode: GenerationLoaderMode;
  progress: number;
  statusMessage?: string | null;
  compact?: boolean;
}

const STEP_PIPELINES: Record<GenerationLoaderMode, string[]> = {
  image: [
    'Refining visual prompt...',
    'Connecting to free open-source GPU...',
    'Rendering high-res artwork...',
  ],
  video: [
    'Enhancing camera prompt...',
    'Connecting to free open-source GPU...',
    'Rendering frames...',
  ],
  talking: [
    'Compositing character & background...',
    'Generating spoken voice track...',
    'Animating lip-sync & expressions...',
    'Finalizing talking video...',
  ],
  episode: [
    'Structuring narrative arc...',
    'Aligning characters & camera cues...',
    'Building scene cards...',
  ],
  export: [
    'Preparing scene clips & audio...',
    'Mixing narration & background score...',
    'Encoding watermark-free MP4...',
  ],
};

function resolveActiveStepIndex(
  mode: GenerationLoaderMode,
  progress: number,
  statusMessage?: string | null
): number {
  const msg = (statusMessage || '').toLowerCase();
  if (mode === 'talking') {
    if (msg.includes('step 4') || msg.includes('final') || progress >= 90) return 3;
    if (
      msg.includes('step 3') ||
      msg.includes('lip-sync') ||
      msg.includes('lipsync') ||
      msg.includes('sadtalker') ||
      msg.includes('liveportrait') ||
      msg.includes('animat') ||
      progress >= 58
    ) {
      return 2;
    }
    if (
      msg.includes('step 2') ||
      msg.includes('voice') ||
      msg.includes('audio') ||
      msg.includes('speech') ||
      progress >= 36
    ) {
      return 1;
    }
    return 0;
  }
  if (mode === 'video') {
    if (msg.includes('enhancing') || msg.includes('prompt')) return 0;
    if (msg.includes('wait') || msg.includes('connect') || msg.includes('queue')) return 1;
    if (msg.includes('render') || msg.includes('frame') || progress >= 50) return 2;
  }
  if (progress >= 55) return 2;
  if (progress >= 25) return 1;
  return 0;
}

/**
 * Cinema-grade frosted-glass AI generation overlay with Mint-Cyan pulse waves,
 * rotating cinema aperture ring around the A.H.I emblem, live progression steps,
 * and smooth animated Mint-Cyan progress bar.
 */
export function AhiGenerationLoader({
  mode,
  progress,
  statusMessage,
  compact = false,
}: AhiGenerationLoaderProps) {
  const uid = useId().replace(/:/g, '');
  const ringGradId = `ahi-gen-ring-${uid}`;

  const steps = STEP_PIPELINES[mode];
  const activeStepIdx = resolveActiveStepIndex(mode, progress, statusMessage);
  const clampedPct = Math.min(100, Math.max(8, Math.round(progress)));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`relative overflow-hidden bg-[rgba(17,22,33,0.78)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_24px_60px_rgba(0,0,0,0.55)] flex flex-col items-center justify-center text-center ${
        compact ? 'w-full aspect-video rounded-xl p-4 space-y-3.5' : 'w-full max-w-2xl aspect-video rounded-2xl p-6 sm:p-8 space-y-5'
      }`}
    >
      {/* Subtle radial Mint-Cyan ambient glow inside glass stage */}
      <div
        aria-hidden="true"
        className="ahi-aura-breathe pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 42%, rgba(45, 212, 191, 0.12), transparent 64%)',
        }}
      />

      {/* Pulse wave + cinema aperture ring + centered A.H.I mark */}
      <div
        className={`relative flex items-center justify-center shrink-0 ${
          compact ? 'w-16 h-16' : 'w-24 h-24'
        }`}
      >
        {/* Expanding Mint-Cyan pulse waves */}
        <span
          aria-hidden="true"
          className="ahi-pulse-wave absolute inset-0 rounded-full border border-[#2DD4BF]/45"
        />
        <span
          aria-hidden="true"
          className="ahi-pulse-wave-delayed absolute inset-0 rounded-full border border-[#34D399]/35"
        />

        {/* Cinema Aperture Rotating SVG Ring */}
        <svg
          viewBox="0 0 96 96"
          className="ahi-orbit-cw absolute inset-0 w-full h-full drop-shadow-[0_0_12px_rgba(45,212,191,0.45)]"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id={ringGradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#2DD4BF" />
              <stop offset="60%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#2DD4BF" stopOpacity="0.1" />
            </linearGradient>
          </defs>
          {/* Segmented aperture arcs */}
          <circle
            cx="48"
            cy="48"
            r="43"
            fill="none"
            stroke={`url(#${ringGradId})`}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="62 24 44 24 62 24"
          />
        </svg>

        {/* Counter-rotating inner subtle iris ring */}
        <svg
          viewBox="0 0 96 96"
          className="ahi-orbit-ccw absolute inset-0 w-full h-full"
          aria-hidden="true"
        >
          <circle
            cx="48"
            cy="48"
            r="35"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1"
            strokeDasharray="3 6"
          />
        </svg>

        {/* Frosted glass medallion with A.H.I emblem */}
        <div
          className={`relative rounded-2xl bg-[rgba(7,9,14,0.82)] border border-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] flex items-center justify-center ${
            compact ? 'w-10 h-10 rounded-xl' : 'w-14 h-14'
          }`}
        >
          <AhiGeometricMark className={compact ? 'w-6 h-6' : 'w-8 h-8'} />
        </div>
      </div>

      {/* Live Headline Status */}
      <div className="relative z-10 space-y-1 max-w-md">
        <div
          className={`font-display font-semibold text-[#F8FAFC] ${
            compact ? 'text-xs' : 'text-base sm:text-lg'
          }`}
        >
          {statusMessage || steps[activeStepIdx]}
        </div>
        {!compact && (
          <p className="text-xs text-[#94A3B8]">
            100% free &amp; watermark-free · Cinema-grade generation in progress
          </p>
        )}
      </div>

      {/* Friendly Live Status Steps */}
      {!compact && (
        <div className="relative z-10 flex flex-wrap items-center justify-center gap-2 max-w-xl">
          {steps.map((stepLabel, idx) => {
            const isDone = idx < activeStepIdx;
            const isActive = idx === activeStepIdx;
            return (
              <div
                key={stepLabel}
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] border transition-all ${
                  isActive
                    ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/50 text-[#F8FAFC] shadow-[0_0_16px_rgba(45,212,191,0.16)]'
                    : isDone
                    ? 'bg-white/[0.04] border-[#34D399]/35 text-[#34D399]'
                    : 'bg-[#07090E]/50 border-white/10 text-[#64748B]'
                }`}
              >
                {isDone ? (
                  <Check className="w-3 h-3 text-[#34D399]" />
                ) : isActive ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2DD4BF] animate-pulse shadow-[0_0_8px_#2DD4BF]" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-[#64748B]/50" />
                )}
                <span>{stepLabel}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Smooth Animated Progress Bar */}
      <div className={`relative z-10 w-full ${compact ? 'max-w-[220px]' : 'max-w-sm'} space-y-1.5`}>
        <div className="h-1.5 w-full bg-[#07090E]/85 border border-white/10 rounded-full overflow-hidden">
          <div
            className="relative h-full rounded-full bg-gradient-to-r from-[#2DD4BF] to-[#34D399] shadow-[0_0_14px_rgba(45,212,191,0.55)] transition-all duration-500 ease-out"
            style={{ width: `${clampedPct}%` }}
          >
            <span className="ahi-bar-sweep absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/45 to-transparent" />
          </div>
        </div>
        <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-[#64748B]">
          <span>A.H.I ENGINE</span>
          <span className="text-[#2DD4BF]">{clampedPct}%</span>
        </div>
      </div>
    </div>
  );
}
