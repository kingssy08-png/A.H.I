import { useState } from 'react';
import {
  ArrowUpRight,
  Clapperboard,
  Cpu,
  Image as ImageIcon,
  Mic,
  Move3d,
  Play,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { COMMUNITY_SHOWCASE } from '../data/seedData';
import type { ShowcaseItem, StudioView, VideoProject } from '../types/studio';
import { formatTimecode } from '../utils/audioEngine';

interface HomeStudioViewProps {
  projects: VideoProject[];
  onNavigate: (view: StudioView) => void;
  onOpenProject: (projectId: string, view?: StudioView) => void;
  onRemixShowcase: (item: ShowcaseItem, target: 'image' | 'video') => void;
}

const SHOWCASE_CATEGORIES = [
  'All',
  '3D Cartoons',
  'Anime',
  'Cinematic Shots',
  'Product Ads',
] as const;

const FREE_ENGINES = [
  {
    tool: 'Text-to-Image & Cast',
    engine: 'Workers AI Flux.1 · 1–3s',
    note: 'Zero-queue primary + HF Flux.1 / SD 3.5 auto-failover',
  },
  {
    tool: 'Text / Image-to-Video',
    engine: 'LTX-Video · Wan 2.1 Fast',
    note: '10–25s distilled models + CogVideoX/Mochi backup',
  },
  {
    tool: 'Private Turbo GPU',
    engine: 'Colab Gradio Live',
    note: 'Optional 1-click free Google Colab zero-queue node',
  },
  {
    tool: 'Scripts & Storyboards',
    engine: 'Gemini Script Engine',
    note: 'Scene breakdowns & 3-keyframe SVG boards',
  },
  {
    tool: 'Voice, Lip-Sync & MP4',
    engine: 'Browser TTS · FFmpeg.wasm',
    note: 'Clean MP4 export & zero-cost .ahi project files',
  },
];

export function HomeStudioView({
  projects,
  onNavigate,
  onOpenProject,
  onRemixShowcase,
}: HomeStudioViewProps) {
  const [categoryFilter, setCategoryFilter] =
    useState<(typeof SHOWCASE_CATEGORIES)[number]>('All');

  const filteredShowcase = COMMUNITY_SHOWCASE.filter(
    (item) => categoryFilter === 'All' || item.category === categoryFilter
  );

  return (
    <div className="space-y-8 pb-4">
      {/* Pro Cinema Studio Hero */}
      <section className="relative overflow-hidden rounded-2xl bg-[#111116]/90 backdrop-blur-xl border border-white/10 p-6 lg:p-8">
        <div
          className="pointer-events-none absolute -top-24 -right-24 w-96 h-96 rounded-full bg-indigo-500/15 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 w-80 h-80 rounded-full bg-cyan-500/10 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="text-xs font-mono tracking-wider uppercase text-cyan-400">
              A.H.I — Free AI Cinema &amp; Animation Studio · Zero Credits · Zero Watermarks
            </div>
            <h2 className="text-2xl sm:text-3xl font-display font-bold tracking-tight text-zinc-50 leading-tight">
              Instant 1–3s Flux.1 frames and 10–25s distilled cinema motion, 100% free.
            </h2>
            <p className="text-sm text-zinc-400 max-w-2xl leading-relaxed">
              Generate stills instantaneously on Cloudflare Workers AI <span className="font-mono text-cyan-300">@cf/black-forest-labs/flux-1-schnell</span>{' '}
              with automatic Hugging Face failover, render fast clips via <span className="font-mono text-cyan-300">LTX-Video Distilled</span> &amp;{' '}
              <span className="font-mono text-cyan-300">Wan 2.1 Fast</span>, or connect a free Google Colab GPU in Turbo Mode.
            </p>

            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => onNavigate('text-to-image')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 text-xs font-semibold shadow-lg shadow-indigo-500/20 transition-all cursor-pointer"
              >
                <ImageIcon className="w-4 h-4" />
                Open Text-to-Image
              </button>
              <button
                type="button"
                onClick={() => onNavigate('text-to-video')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-medium transition-colors cursor-pointer"
              >
                <Clapperboard className="w-4 h-4 text-indigo-400" />
                Text-to-Video &amp; Script
              </button>
              <button
                type="button"
                onClick={() => onNavigate('image-to-video')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-medium transition-colors cursor-pointer"
              >
                <Move3d className="w-4 h-4 text-cyan-400" />
                Animate Still Frame
              </button>
              <button
                type="button"
                onClick={() => onNavigate('voice')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-medium transition-colors cursor-pointer"
              >
                <Mic className="w-4 h-4 text-indigo-400" />
                Voice &amp; Lip-Sync
              </button>
            </div>
          </div>

          {/* Honest Open-Source Engine Stack */}
          <div className="lg:col-span-5 bg-zinc-950/75 border border-white/10 rounded-xl p-4 space-y-2.5">
            <div className="flex items-center justify-between text-xs pb-1 border-b border-white/10">
              <span className="font-semibold text-zinc-200 flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                Transparent Free Engine Stack
              </span>
              <span className="font-mono text-[11px] text-emerald-400">No Paywall</span>
            </div>
            <div className="divide-y divide-white/5">
              {FREE_ENGINES.map((row) => (
                <div key={row.tool} className="py-1.5 flex items-baseline justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-xs font-medium text-zinc-200">{row.tool}</span>
                    <span className="text-[11px] text-zinc-500 block truncate">{row.note}</span>
                  </div>
                  <span className="text-[11px] font-mono text-indigo-300 shrink-0">
                    {row.engine}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Active Studio Projects Strip */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-display font-semibold text-zinc-100">
              Jump Back Into Your Cuts
            </h3>
            <p className="text-xs text-zinc-400">
              Open any active timeline in Text-to-Video, Motion Choreography, or Export
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('projects')}
            className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300 cursor-pointer"
          >
            <span>All Projects ({projects.length})</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {projects.slice(0, 3).map((proj) => {
            const totalSec = proj.scenes.reduce((s, sc) => s + sc.durationSeconds, 0);
            return (
              <div
                key={proj.id}
                onClick={() => onOpenProject(proj.id, 'text-to-video')}
                className="group bg-[#111116]/85 border border-white/10 hover:border-indigo-400/50 rounded-xl overflow-hidden transition-all cursor-pointer"
              >
                <div className="aspect-video relative bg-zinc-950 overflow-hidden">
                  {proj.thumbnailUrl && (
                    <img
                      src={proj.thumbnailUrl}
                      alt={proj.title}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-black/25 to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-mono text-zinc-200 tabular-nums">
                    <span>{proj.style}</span>
                    <span>
                      {proj.aspectRatio} · {formatTimecode(totalSec)}
                    </span>
                  </div>
                </div>
                <div className="p-4 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-zinc-100 truncate">{proj.title}</h4>
                    <p className="text-xs text-zinc-400 truncate mt-0.5">{proj.logline}</p>
                  </div>
                  <span className="p-2 rounded-lg bg-white/5 group-hover:bg-indigo-500/20 text-zinc-300 group-hover:text-cyan-300 transition-colors shrink-0">
                    <Play className="w-3.5 h-3.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Community Showcase Masonry Grid */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-display font-semibold text-zinc-100">
              Community Showcase Masonry
            </h3>
            <p className="text-xs text-zinc-400">
              Explore 3D cartoons, anime, cinematic shots, and product ads — click Remix Prompt to
              load any recipe into your studio dock
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111116] border border-white/10 rounded-xl">
            {SHOWCASE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40'
                    : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
          {filteredShowcase.map((item) => (
            <article
              key={item.id}
              className="break-inside-avoid group relative bg-[#111116] border border-white/10 hover:border-cyan-400/40 rounded-2xl overflow-hidden transition-all"
            >
              <div className="relative overflow-hidden bg-zinc-950">
                <img
                  src={item.imageUrl}
                  alt={item.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-auto block group-hover:scale-[1.03] transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-[#09090B]/35 to-transparent opacity-90" />

                <div className="absolute bottom-3 left-3.5 right-3.5 space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-zinc-300">
                    <span className="text-cyan-300">{item.style}</span>
                    <span>
                      {item.aspectRatio} · {item.cameraMotion}
                    </span>
                  </div>
                  <h4 className="text-sm font-display font-semibold text-zinc-50 leading-snug">
                    {item.title}
                  </h4>
                </div>
              </div>

              <div className="p-4 space-y-3 border-t border-white/10">
                <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                  {item.prompt}
                </p>

                <div className="flex items-center justify-between text-[11px] text-zinc-500 font-mono">
                  <span>{item.creator}</span>
                  <span>{item.engineLabel}</span>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => onRemixShowcase(item, 'image')}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-400/35 text-xs font-medium text-indigo-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Wand2 className="w-3.5 h-3.5 text-cyan-400" />
                    Remix Prompt
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemixShowcase(item, 'video')}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                    Animate Shot
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
