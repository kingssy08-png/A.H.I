import { Download, Film, Image as ImageIcon, Plus, Trash2, Upload, Wand2 } from 'lucide-react';
import type { StudioCreation, VideoProject } from '../types/studio';

interface SimpleProjectsViewProps {
  projects: VideoProject[];
  creations?: StudioCreation[];
  activeProjectId: string;
  onOpenStory: (projectId: string, step?: 1 | 2 | 3) => void;
  onCreateNewStory: () => void;
  onDeleteProject: (projectId: string) => void;
  onExportAhiProject: (projectId: string) => void;
  onImportAhiFile: (file: File) => void;
  onOpenCreationInCreate?: (creation: StudioCreation) => void;
  onDeleteCreation?: (creationId: string) => void;
}

export function SimpleProjectsView({
  projects,
  creations = [],
  activeProjectId,
  onOpenStory,
  onCreateNewStory,
  onDeleteProject,
  onExportAhiProject,
  onImportAhiFile,
  onOpenCreationInCreate,
  onDeleteCreation,
}: SimpleProjectsViewProps) {
  const savedMedia = creations.filter((c) => Boolean(c.mediaUrl));

  return (
    <div className="max-w-5xl mx-auto space-y-10 pb-20">
      {/* Saved Story Projects */}
      <section className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-display font-bold text-[#F8FAFC]">Saved &amp; Projects</h1>
            <p className="text-xs text-[#94A3B8]">
              Reopen saved episodes, download your generated clips, or export portable .ahi backups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl hover:border-[#2DD4BF]/45 border border-white/10 text-xs font-medium text-[#F8FAFC] cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5 text-[#94A3B8]" />
              Load .ahi
              <input
                type="file"
                accept=".ahi,.json"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) onImportAhiFile(file);
                }}
                className="hidden"
              />
            </label>

            <button
              type="button"
              onClick={onCreateNewStory}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold shadow-[0_0_20px_rgba(45,212,191,0.22)] transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Story
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((proj) => {
            const isActive = proj.id === activeProjectId;
            const readyClips = proj.scenes.filter((s) => Boolean(s.generatedVideoUrl)).length;
            return (
              <div
                key={proj.id}
                className={`bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl rounded-2xl overflow-hidden border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] flex flex-col justify-between transition-all ${
                  isActive
                    ? 'border-[#2DD4BF]/60 shadow-[0_0_24px_rgba(45,212,191,0.14)]'
                    : 'border-white/10 hover:border-[#2DD4BF]/45 hover:shadow-[0_0_24px_rgba(45,212,191,0.10)]'
                }`}
              >
                <div>
                  <div className="aspect-video bg-[#07090E] relative overflow-hidden">
                    <img
                      src={proj.thumbnailUrl || '/src/assets/images/style_3d_cartoon_1795461025240.jpg'}
                      alt={proj.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0B0F18] via-transparent to-transparent" />
                    <span className="absolute top-2.5 left-2.5 px-2.5 py-0.5 rounded-full bg-[#07090E]/75 backdrop-blur-md border border-white/10 text-[10px] font-medium text-[#F8FAFC]">
                      {proj.style}
                    </span>
                    {isActive && (
                      <span className="absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-full bg-[#2DD4BF] text-[#07090E] text-[10px] font-bold">
                        Active
                      </span>
                    )}
                  </div>

                  <div className="p-4 space-y-1.5">
                    {(proj.seriesTitle || proj.seasonNumber || proj.episodeNumber) && (
                      <div className="flex items-center justify-between gap-2 text-[10px] font-semibold">
                        <span className="text-[#2DD4BF] truncate">
                          {proj.seriesTitle || 'Series Episode'}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[#07090E]/80 border border-white/10 text-[#94A3B8] tabular-nums shrink-0">
                          S{proj.seasonNumber ?? 1} · E{proj.episodeNumber ?? 1}
                        </span>
                      </div>
                    )}
                    <h2 className="text-sm font-display font-semibold text-[#F8FAFC] truncate">
                      {proj.title}
                    </h2>
                    <p className="text-xs text-[#94A3B8] line-clamp-2 leading-relaxed">
                      {proj.logline || proj.storyIdea}
                    </p>
                    <div className="pt-1 flex items-center gap-3 text-[11px] text-[#64748B] tabular-nums">
                      <span>{proj.scenes.length} scenes</span>
                      <span>·</span>
                      <span>{readyClips} clips ready</span>
                      <span>·</span>
                      <span>{proj.aspectRatio}</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onOpenStory(proj.id, 2)}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Film className="w-3.5 h-3.5" />
                    Open Story
                  </button>

                  <button
                    type="button"
                    onClick={() => onExportAhiProject(proj.id)}
                    className="p-2.5 rounded-xl bg-[#07090E]/75 hover:bg-white/10 border border-white/10 hover:border-[#2DD4BF]/40 text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer transition-colors"
                    title="Download .ahi backup"
                    aria-label={`Download ${proj.title} backup`}
                  >
                    <Download className="w-4 h-4" />
                  </button>

                  {projects.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteProject(proj.id)}
                      className="p-2.5 rounded-xl bg-[#07090E]/75 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-[#94A3B8] hover:text-red-300 cursor-pointer transition-colors"
                      title="Delete project"
                      aria-label={`Delete ${proj.title}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Saved Creations & Downloads */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg font-display font-bold text-[#F8FAFC]">
              Saved Creations &amp; Downloads
            </h2>
            <p className="text-xs text-[#94A3B8]">
              Your generated images and videos ready to reopen or download without watermarks.
            </p>
          </div>
          <span className="text-xs text-[#64748B] tabular-nums">{savedMedia.length} saved</span>
        </div>

        {savedMedia.length === 0 ? (
          <div className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-2xl p-8 text-center space-y-2">
            <div className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-[#94A3B8]">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div className="text-xs font-medium text-[#F8FAFC]">No saved creations yet</div>
            <p className="text-xs text-[#64748B]">
              Any image or video you create in Create appears here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {savedMedia.map((item) => (
              <div
                key={item.id}
                className="bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 hover:border-[#2DD4BF]/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:shadow-[0_0_24px_rgba(45,212,191,0.10)] rounded-2xl overflow-hidden flex flex-col justify-between transition-all"
              >
                <div>
                  <div className="aspect-video bg-black relative overflow-hidden">
                    {item.mode === 'video' ? (
                      <video
                        src={item.mediaUrl}
                        controls
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img
                        src={item.mediaUrl}
                        alt={item.prompt}
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  <div className="p-4 space-y-1.5">
                    <p className="text-xs font-medium text-[#F8FAFC] line-clamp-2 leading-relaxed">
                      {item.prompt}
                    </p>
                    <div className="text-[11px] text-[#64748B] flex items-center gap-2">
                      <span className="uppercase text-[#2DD4BF]">{item.mode}</span>
                      <span>·</span>
                      <span>{item.style}</span>
                      <span>·</span>
                      <span>{item.aspectRatio}</span>
                    </div>
                  </div>
                </div>

                <div className="px-4 pb-4 flex items-center gap-2">
                  {onOpenCreationInCreate && (
                    <button
                      type="button"
                      onClick={() => onOpenCreationInCreate(item)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-white/5 hover:bg-[#2DD4BF] text-[#F8FAFC] hover:text-[#07090E] border border-white/10 hover:border-transparent text-xs font-semibold transition-colors cursor-pointer"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      Open in Create
                    </button>
                  )}

                  <a
                    href={item.mediaUrl}
                    download={`ahi-${item.mode}-${item.id}.${item.mode === 'video' ? 'mp4' : 'png'}`}
                    className="p-2 rounded-xl bg-[#07090E]/75 hover:bg-white/10 border border-white/10 hover:border-[#2DD4BF]/40 text-[#94A3B8] hover:text-[#F8FAFC] transition-colors"
                    title="Download file"
                    aria-label="Download creation"
                  >
                    <Download className="w-4 h-4" />
                  </a>

                  {onDeleteCreation && (
                    <button
                      type="button"
                      onClick={() => onDeleteCreation(item.id)}
                      className="p-2 rounded-xl bg-[#07090E]/75 hover:bg-red-500/20 border border-white/10 hover:border-red-500/40 text-[#94A3B8] hover:text-red-300 cursor-pointer transition-colors"
                      title="Remove saved item"
                      aria-label="Remove saved item"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

