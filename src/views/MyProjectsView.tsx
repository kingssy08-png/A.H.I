import { useMemo, useState } from 'react';
import { Copy, Download, Film, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { AnimationStyle, StudioView, VideoProject } from '../types/studio';
import { formatTimecode } from '../utils/audioEngine';

interface MyProjectsViewProps {
  projects: VideoProject[];
  activeProjectId: string;
  onOpenProject: (projectId: string, view: StudioView) => void;
  onDuplicateProject: (projectId: string) => void;
  onDeleteProject: (projectId: string) => void;
  onCreateBlankProject: () => void;
  onExportAhiProject: (projectId: string) => void;
  onImportAhiFile: (file: File) => void;
}

export function MyProjectsView({
  projects,
  activeProjectId,
  onOpenProject,
  onDuplicateProject,
  onDeleteProject,
  onCreateBlankProject,
  onExportAhiProject,
  onImportAhiFile,
}: MyProjectsViewProps) {
  const [search, setSearch] = useState('');
  const [styleFilter, setStyleFilter] = useState<'All' | AnimationStyle>('All');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      if (styleFilter !== 'All' && p.style !== styleFilter) return false;
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        p.logline.toLowerCase().includes(q) ||
        p.style.toLowerCase().includes(q)
      );
    });
  }, [projects, search, styleFilter]);

  return (
    <div className="space-y-6 pb-4">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects by title or logline..."
              className="w-full bg-[#111116] border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-400/60"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1 p-1 bg-[#111116] border border-white/10 rounded-xl">
            {(
              [
                'All',
                '3D Pixar-Style Cartoon',
                'Anime',
                'Cinematic Film',
                'Educational',
              ] as const
            ).map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setStyleFilter(tab)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  styleFilter === tab
                    ? 'bg-indigo-500/20 text-cyan-300 border border-indigo-400/40'
                    : 'text-zinc-400 hover:text-zinc-100 border border-transparent'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <label className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-100 text-xs font-medium rounded-xl transition-colors whitespace-nowrap shrink-0 cursor-pointer">
            <Upload className="w-3.5 h-3.5 text-cyan-400" />
            Import .ahi Backup
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
            onClick={onCreateBlankProject}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-500 to-cyan-500 hover:from-indigo-400 hover:to-cyan-400 text-zinc-950 text-xs font-semibold rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Blank Project
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-[#111116] border border-white/10 rounded-2xl p-10 text-center space-y-3">
          <p className="text-sm font-medium text-zinc-100">No projects match your current filter</p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setStyleFilter('All');
            }}
            className="px-4 py-2 text-xs font-medium bg-white/5 text-zinc-100 rounded-xl hover:bg-white/10 border border-white/10 cursor-pointer"
          >
            Show All Projects
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((project) => {
            const totalSec = project.scenes.reduce((sum, s) => sum + s.durationSeconds, 0);
            const storyboardCount = project.scenes.filter(
              (s) => s.storyboard && s.storyboard.keyframes.length > 0
            ).length;
            const isActive = project.id === activeProjectId;

            return (
              <div
                key={project.id}
                className={`bg-[#111116]/85 border rounded-2xl overflow-hidden flex flex-col justify-between transition-all ${
                  isActive
                    ? 'border-cyan-400/60 shadow-[0_0_24px_rgba(6,182,212,0.12)]'
                    : 'border-white/10 hover:border-indigo-400/40'
                }`}
              >
                <div>
                  <div className="aspect-video bg-zinc-950 relative overflow-hidden border-b border-white/10">
                    {project.thumbnailUrl ? (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.title}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-600">
                        <Film className="w-8 h-8" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-[#09090B] via-black/20 to-transparent" />
                    <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs text-zinc-200">
                      <span className="text-cyan-300">{project.style}</span>
                      <span className="font-mono tabular-nums">{formatTimecode(totalSec)}</span>
                    </div>
                  </div>

                  <div className="p-5 space-y-2">
                    <h3 className="text-base font-display font-semibold text-zinc-100 truncate">
                      {project.title}
                    </h3>
                    <p className="text-xs text-zinc-400 leading-relaxed line-clamp-2">
                      {project.logline}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-zinc-500 pt-1 tabular-nums">
                      <span>{project.scenes.length} scenes</span>
                      <span aria-hidden="true">·</span>
                      <span>{storyboardCount} storyboarded</span>
                      <span aria-hidden="true">·</span>
                      <span>{project.aspectRatio}</span>
                    </div>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-2 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id, 'text-to-video')}
                      className="px-3 py-1.5 text-xs font-medium bg-white/5 hover:bg-white/10 text-zinc-100 border border-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Open Timeline
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenProject(project.id, 'export')}
                      className="px-3 py-1.5 text-xs font-medium bg-indigo-500/20 hover:bg-indigo-500/30 text-cyan-200 border border-indigo-400/40 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Export
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onExportAhiProject(project.id)}
                      title="Download .ahi project backup"
                      className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium text-cyan-300 hover:text-cyan-200 hover:bg-white/5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      .ahi
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateProject(project.id)}
                      title="Duplicate project"
                      className="p-2 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-white/5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={projects.length <= 1}
                      onClick={() => onDeleteProject(project.id)}
                      title="Delete project"
                      className="p-2 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-white/5 disabled:opacity-35 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
