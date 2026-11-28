import { CheckCircle2, Cpu, Loader2, RefreshCw } from 'lucide-react';

interface FreeGpuStatusCardProps {
  isRunning: boolean;
  message: string | null;
  progress?: number;
  activeSpace?: string;
  attempt?: number;
  totalAttempts?: number;
  translatedPrompt?: string | null;
}

export function FreeGpuStatusCard({
  isRunning,
  message,
  progress = 0,
  activeSpace,
  attempt,
  totalAttempts,
  translatedPrompt,
}: FreeGpuStatusCardProps) {
  if (!message && !isRunning) return null;

  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const isFailover = Boolean(
    message && /fail|backup|switch|retry|busy|sleeping/i.test(message)
  );

  return (
    <div className="bg-zinc-950/95 border border-indigo-400/35 rounded-xl p-3.5 space-y-2.5 text-xs">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-indigo-100 min-w-0">
          {isRunning ? (
            isFailover ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400 shrink-0" />
            ) : (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400 shrink-0" />
            )
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          )}
          <span className="font-medium truncate">
            {message || 'Creating your clip...'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0 font-mono text-[11px] tabular-nums text-cyan-300">
          {isRunning && clampedProgress > 0 && <span>{clampedProgress}%</span>}
        </div>
      </div>

      {isRunning && (
        <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 transition-all duration-300"
            style={{ width: `${Math.max(8, clampedProgress)}%` }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-400">
        <span className="inline-flex items-center gap-1.5">
          <Cpu className="w-3 h-3 text-cyan-400 shrink-0" />
          A.H.I Cinema Pipeline — zero cost, zero watermarks.
        </span>
      </div>

      {translatedPrompt && (
        <div className="pt-2 border-t border-white/10 text-[11px] text-zinc-400 leading-relaxed">
          <span className="text-zinc-300 font-medium">Model Prompt:</span>{' '}
          <span className="text-zinc-400">{translatedPrompt}</span>
        </div>
      )}
    </div>
  );
}
