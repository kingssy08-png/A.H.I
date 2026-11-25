import { useMemo, useState } from 'react';
import { Check, Film, Image as ImageIcon, Music, Pause, Play, Plus, Search } from 'lucide-react';
import { STOCK_ASSETS } from '../data/stockAssets';
import type { Scene, StockAsset, StockAssetType } from '../types/studio';
import { studioAudio } from '../utils/audioEngine';
import { MotionClipPreview } from './MotionClipPreview';

interface StockAssetsPanelProps {
  activeScene?: Scene | null;
  selectedMusicId?: string;
  onAttachToScene?: (asset: StockAsset) => void;
  onSelectMusic?: (asset: StockAsset) => void;
  compact?: boolean;
}

export function StockAssetsPanel({
  activeScene,
  selectedMusicId,
  onAttachToScene,
  onSelectMusic,
  compact = false,
}: StockAssetsPanelProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | StockAssetType>('all');
  const [playingId, setPlayingId] = useState<string | null>(() => studioAudio.getPlayingTrackId());

  const filteredAssets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return STOCK_ASSETS.filter((asset) => {
      if (typeFilter !== 'all' && asset.type !== typeFilter) return false;
      if (!q) return true;
      return (
        asset.title.toLowerCase().includes(q) ||
        asset.category.toLowerCase().includes(q) ||
        asset.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [query, typeFilter]);

  const attachedIds = new Set((activeScene?.attachedAssets ?? []).map((a) => a.id));

  const togglePlayMusic = (asset: StockAsset) => {
    if (!asset.musicConfig) return;
    if (playingId === asset.id) {
      studioAudio.stop();
      setPlayingId(null);
    } else {
      studioAudio.playPreset({
        id: asset.id,
        ...asset.musicConfig,
      });
      setPlayingId(asset.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search stock images, motion clips, music tracks..."
            aria-label="Search stock assets"
            className="w-full bg-zinc-950 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
          />
        </div>

        <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-white/10 rounded-xl shrink-0">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'image', label: 'Images' },
              { id: 'video', label: 'Video Clips' },
              { id: 'music', label: 'Music Tracks' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setTypeFilter(tab.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                typeFilter === tab.id
                  ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40'
                  : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {filteredAssets.length === 0 ? (
        <div className="border border-white/10 bg-zinc-950 rounded-xl p-8 text-center">
          <p className="text-sm text-zinc-100 font-medium">No matching stock assets</p>
          <p className="text-xs text-zinc-400 mt-1">
            Try clearing your search or switching to All asset types.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setTypeFilter('all');
            }}
            className="mt-4 px-4 py-2 text-xs font-medium bg-white/5 text-zinc-100 rounded-lg hover:bg-white/10 border border-white/10 transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            compact ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
          }`}
        >
          {filteredAssets.map((asset) => {
            const isAttached =
              asset.type === 'music' ? selectedMusicId === asset.id : attachedIds.has(asset.id);
            const isPlaying = playingId === asset.id;

            return (
              <div
                key={asset.id}
                className="bg-zinc-950 border border-white/10 hover:border-indigo-400/40 rounded-xl overflow-hidden flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="aspect-video bg-[#09090B] relative overflow-hidden border-b border-white/10">
                    {asset.type === 'image' && asset.previewImageUrl ? (
                      <img
                        src={asset.previewImageUrl}
                        alt={asset.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : asset.type === 'video' ? (
                      <MotionClipPreview
                        preset={asset.motionPreset}
                        accentColor={asset.accentColor}
                        active={true}
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-4 bg-zinc-950">
                        <div className="flex items-end gap-1 h-10 mb-3" aria-hidden="true">
                          {[0.45, 0.85, 0.6, 1, 0.72, 0.4, 0.9, 0.55, 0.78, 0.5].map((bar, idx) => (
                            <span
                              key={idx}
                              className={`w-1.5 rounded-sm transition-transform duration-200 ${
                                isPlaying ? 'bg-cyan-400' : 'bg-zinc-700'
                              }`}
                              style={{
                                height: `${Math.round(bar * 36)}px`,
                                transform: isPlaying
                                  ? `scaleY(${0.75 + (idx % 3) * 0.15})`
                                  : 'scaleY(1)',
                              }}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePlayMusic(asset)}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-100 border border-white/10 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                        >
                          {isPlaying ? (
                            <>
                              <Pause className="w-3.5 h-3.5 text-cyan-400" />
                              Pause Preview
                            </>
                          ) : (
                            <>
                              <Play className="w-3.5 h-3.5 text-cyan-400" />
                              Audition Track
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                      <span className="inline-flex items-center gap-1 text-zinc-300">
                        {asset.type === 'image' && <ImageIcon className="w-3.5 h-3.5 text-indigo-400" />}
                        {asset.type === 'video' && <Film className="w-3.5 h-3.5 text-cyan-400" />}
                        {asset.type === 'music' && <Music className="w-3.5 h-3.5 text-emerald-400" />}
                        {asset.type === 'image' ? 'Image' : asset.type === 'video' ? 'Video Clip' : 'Music'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate">{asset.category}</span>
                    </div>
                    <h4 className="text-sm font-semibold text-zinc-100 truncate">{asset.title}</h4>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 font-mono tabular-nums mt-1">
                      <span>{asset.durationLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{asset.resolutionOrBpm}</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-1 flex items-center justify-between gap-2">
                  {asset.type === 'music' ? (
                    <button
                      type="button"
                      disabled={!onSelectMusic}
                      onClick={() => onSelectMusic?.(asset)}
                      className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                        isAttached
                          ? 'bg-indigo-500/20 text-cyan-300 border border-cyan-400/40'
                          : 'bg-white/5 text-zinc-100 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      {isAttached ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Active Project Score
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          Use Project Score
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={!onAttachToScene || !activeScene}
                      onClick={() => onAttachToScene?.(asset)}
                      className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        isAttached
                          ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-400/40'
                          : 'bg-white/5 text-zinc-100 hover:bg-white/10 border border-white/10'
                      }`}
                    >
                      {isAttached ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Added to Scene {activeScene?.sceneNumber}
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          {activeScene ? `Add to Scene ${activeScene.sceneNumber}` : 'Select a Scene'}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
