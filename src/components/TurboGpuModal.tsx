import { useEffect, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Cpu,
  ExternalLink,
  Loader2,
  Power,
  Rocket,
  Server,
  X,
  Zap,
} from 'lucide-react';
import { testColabTurboConnection } from '../services/studioApi';
import { normalizeColabGradioUrl, type TurboGpuConfig } from '../utils/turboGpuConfig';

interface TurboGpuModalProps {
  isOpen: boolean;
  config: TurboGpuConfig;
  cloudflareReady: boolean;
  onClose: () => void;
  onSaveConfig: (next: TurboGpuConfig) => void;
}

const COLAB_SNIPPET = `# Run in a free Google Colab T4/L4 runtime to expose a private zero-queue Gradio node:
!pip install -q gradio diffusers torch accelerate
import gradio as gr, torch
from diffusers import FluxPipeline

pipe = FluxPipeline.from_pretrained("black-forest-labs/FLUX.1-schnell", torch_dtype=torch.bfloat16).to("cuda")
def infer(prompt): return pipe(prompt, num_inference_steps=4, guidance_scale=0.0).images[0]

gr.Interface(fn=infer, inputs="text", outputs="image").launch(share=True)`;

export function TurboGpuModal({
  isOpen,
  config,
  cloudflareReady,
  onClose,
  onSaveConfig,
}: TurboGpuModalProps) {
  const [urlInput, setUrlInput] = useState(config.colabUrl);
  const [enabled, setEnabled] = useState(config.enabled);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
    host?: string;
    latencyMs?: number;
  } | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setUrlInput(config.colabUrl);
      setEnabled(config.enabled);
      setTestResult(
        config.enabled && config.lastVerifiedHost
          ? {
              ok: true,
              message: `Connected to private Colab node (${config.lastVerifiedHost})`,
              host: config.lastVerifiedHost,
              latencyMs: config.lastLatencyMs,
            }
          : null
      );
    }
  }, [isOpen, config]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTest = async () => {
    const normalized = normalizeColabGradioUrl(urlInput);
    if (!normalized) {
      setTestResult({
        ok: false,
        message: 'Enter a valid HTTPS *.gradio.live URL from Google Colab (share=True).',
      });
      return;
    }

    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testColabTurboConnection(normalized);
      setUrlInput(res.normalizedUrl);
      setEnabled(true);
      setTestResult({
        ok: true,
        host: res.host,
        latencyMs: res.latencyMs,
        message: `Live Colab tunnel verified in ${res.latencyMs}ms · ${
          res.endpoints.length > 0 ? `${res.endpoints.length} endpoint(s) ready` : 'Ready'
        }`,
      });
    } catch (err) {
      setTestResult({
        ok: false,
        message: err instanceof Error ? err.message : 'Colab tunnel check failed.',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) {
      onSaveConfig({ enabled: false, colabUrl: '' });
      onClose();
      return;
    }

    const normalized = normalizeColabGradioUrl(trimmed);
    if (!normalized) {
      setTestResult({
        ok: false,
        message: 'Enter a valid HTTPS *.gradio.live URL or clear the field to disable.',
      });
      return;
    }

    onSaveConfig({
      enabled,
      colabUrl: normalized,
      lastVerifiedHost: testResult?.host ?? new URL(normalized).hostname,
      lastLatencyMs: testResult?.latencyMs,
    });
    onClose();
  };

  const handleDisconnect = () => {
    setUrlInput('');
    setEnabled(false);
    setTestResult(null);
    onSaveConfig({ enabled: false, colabUrl: '' });
  };

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(COLAB_SNIPPET);
      setCopiedSnippet(true);
      window.setTimeout(() => setCopiedSnippet(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="turbo-gpu-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-xl bg-[#111116] border border-white/15 rounded-2xl shadow-2xl shadow-black/70 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4 bg-zinc-950/80">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-cyan-500/25 to-indigo-500/25 border border-cyan-400/40 flex items-center justify-center">
              <Zap className="w-4 h-4 text-cyan-300" />
            </span>
            <div>
              <h2 id="turbo-gpu-title" className="text-sm font-display font-semibold text-zinc-50">
                Turbo GPU Mode · Zero-Queue Acceleration
              </h2>
              <p className="text-[11px] text-zinc-400">
                Instant 1–3s images + 10–25s distilled video or private Google Colab GPUs
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 cursor-pointer"
            aria-label="Close Turbo GPU Mode modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-5 max-h-[82vh] overflow-y-auto">
          {/* Active Speed Tiers Overview */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5 text-cyan-400" />
                  Workers AI Flux.1
                </span>
                <span
                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                    cloudflareReady
                      ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {cloudflareReady ? 'Active 1–3s' : 'HF Fallback'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Runs <span className="font-mono text-zinc-300">@cf/black-forest-labs/flux-1-schnell</span>{' '}
                first with automatic failover to HF Spaces.
              </p>
            </div>

            <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  Distilled Video Router
                </span>
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-400/30">
                  10–25s
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                Prioritizes <span className="font-mono text-zinc-300">LTX-Video Distilled</span> &amp;{' '}
                <span className="font-mono text-zinc-300">Wan 2.1 Fast</span> ahead of heavy nodes.
              </p>
            </div>
          </div>

          {/* Private Colab Gradio URL Connection */}
          <div className="bg-zinc-950/90 border border-white/10 rounded-xl p-4 space-y-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                  Optional: Connect Free Google Colab Gradio URL
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Route images &amp; video directly to your private Colab T4/L4/A100 runtime with
                  zero shared queue.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEnabled((v) => !v)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono border transition-colors cursor-pointer shrink-0 ${
                  enabled
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300'
                    : 'bg-zinc-900 border-white/10 text-zinc-400'
                }`}
              >
                {enabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://9a1b2c3d4e5f.gradio.live"
                className="flex-1 bg-[#111116] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs font-mono text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
              />
              <button
                type="button"
                disabled={isTesting || !urlInput.trim()}
                onClick={() => void handleTest()}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-45 border border-white/10 text-xs font-medium text-cyan-300 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
              >
                {isTesting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Testing...
                  </>
                ) : (
                  'Test Connection'
                )}
              </button>
            </div>

            {testResult && (
              <div
                className={`rounded-lg px-3 py-2 text-xs flex items-center gap-2 border ${
                  testResult.ok
                    ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/40 border-red-500/40 text-red-200'
                }`}
              >
                {testResult.ok && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                <span>{testResult.message}</span>
              </div>
            )}

            {/* Quick Colab Helper */}
            <div className="pt-2 border-t border-white/10 space-y-2">
              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Need a Colab Gradio link? Paste in a Colab T4 cell:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopySnippet()}
                    className="inline-flex items-center gap-1 text-cyan-300 hover:text-cyan-200 cursor-pointer"
                  >
                    {copiedSnippet ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copiedSnippet ? 'Copied' : 'Copy Colab Code'}
                  </button>
                  <a
                    href="https://colab.research.google.com/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-indigo-300 hover:text-indigo-200"
                  >
                    Open Colab
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <pre className="bg-[#09090B] border border-white/10 rounded-lg p-2.5 text-[10px] font-mono text-zinc-400 overflow-x-auto leading-relaxed">
                {COLAB_SNIPPET}
              </pre>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            {config.colabUrl ? (
              <button
                type="button"
                onClick={handleDisconnect}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-xs font-medium text-red-300 transition-colors cursor-pointer"
              >
                <Power className="w-3.5 h-3.5" />
                Disconnect Colab
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">
                Automatic failover stays active even if Colab disconnects.
              </span>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 text-xs font-semibold cursor-pointer"
              >
                <Zap className="w-3.5 h-3.5" />
                Save Turbo Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
