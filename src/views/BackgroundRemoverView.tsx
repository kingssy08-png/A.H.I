import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  Download,
  Image as ImageIcon,
  Layers,
  Loader2,
  Palette,
  RotateCcw,
  Scissors,
  Sparkles,
  Upload,
  Video,
} from 'lucide-react';
import { removeImageBackground } from '../services/studioApi';
import {
  BG_REMOVER_ASPECT_RATIOS,
  composeBgRemoverOutput,
  exportTransparentCutoutPng,
  readImageFileForBgRemover,
  type BackgroundEditConfig,
  type BgRemoverAspectRatio,
} from '../utils/backgroundRemoverCanvas';

interface BackgroundRemoverViewProps {
  onSendToImageGenerator: (payload: {
    imageUrl: string;
    originalImageUrl: string;
    label: string;
    aspectRatio: BgRemoverAspectRatio;
  }) => void;
  onSendToVideoGenerator: (payload: {
    imageUrl: string;
    originalImageUrl: string;
    label: string;
    aspectRatio: BgRemoverAspectRatio;
  }) => void;
}

const SAMPLE_SUBJECTS: Array<{
  id: string;
  label: string;
  category: string;
  imageUrl: string;
}> = [
  {
    id: 'sample-luna',
    label: 'Luna Pilot',
    category: '3D Character',
    imageUrl: '/src/assets/images/char_luna_pilot_1795461026794.jpg',
  },
  {
    id: 'sample-owl',
    label: 'Professor Owl',
    category: 'Animated Character',
    imageUrl: '/src/assets/images/char_professor_owl_1795461027243.jpg',
  },
  {
    id: 'sample-watch',
    label: 'Obsidian Watch',
    category: 'Product Shot',
    imageUrl: '/src/assets/images/showcase_product_ad_1795462965806.jpg',
  },
];

const SOLID_COLOR_SWATCHES: Array<{ hex: string; bgClass: string }> = [
  { hex: '#0F172A', bgClass: 'bg-[#0F172A]' },
  { hex: '#2DD4BF', bgClass: 'bg-[#2DD4BF]' },
  { hex: '#38BDF8', bgClass: 'bg-[#38BDF8]' },
  { hex: '#F59E0B', bgClass: 'bg-[#F59E0B]' },
  { hex: '#FB7185', bgClass: 'bg-[#FB7185]' },
  { hex: '#A78BFA', bgClass: 'bg-[#A78BFA]' },
  { hex: '#10B981', bgClass: 'bg-[#10B981]' },
  { hex: '#F1F5F9', bgClass: 'bg-[#F1F5F9]' },
];

export function BackgroundRemoverView({
  onSendToImageGenerator,
  onSendToVideoGenerator,
}: BackgroundRemoverViewProps) {
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [subjectLabel, setSubjectLabel] = useState<string>('Cutout Subject');
  const [sourceDimensions, setSourceDimensions] = useState<{ w: number; h: number } | null>(null);

  const [cutoutUrl, setCutoutUrl] = useState<string | null>(null);
  const [composedUrl, setComposedUrl] = useState<string | null>(null);
  const [composedDims, setComposedDims] = useState<{ w: number; h: number } | null>(null);

  const [previewTab, setPreviewTab] = useState<'original' | 'result'>('original');
  const [aspectRatio, setAspectRatio] = useState<BgRemoverAspectRatio>('original');
  const [bgMode, setBgMode] = useState<'transparent' | 'white' | 'color' | 'image'>('transparent');
  const [customHex, setCustomHex] = useState<string>('#0F172A');
  const [customBgImageUrl, setCustomBgImageUrl] = useState<string | null>(null);
  const [customBgLabel, setCustomBgLabel] = useState<string>('');

  const [isRemoving, setIsRemoving] = useState(false);
  const [isComposing, setIsComposing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  const subjectInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);
  const dragCounterRef = useRef(0);

  // Re-compose preview & downloadable PNG whenever cutout, aspect ratio, or background changes
  useEffect(() => {
    if (!cutoutUrl) {
      setComposedUrl(null);
      setComposedDims(null);
      return;
    }

    let cancelled = false;
    setIsComposing(true);

    const bgConfig: BackgroundEditConfig =
      bgMode === 'white'
        ? { mode: 'white' }
        : bgMode === 'color'
        ? { mode: 'color', hex: customHex }
        : bgMode === 'image' && customBgImageUrl
        ? { mode: 'image', imageUrl: customBgImageUrl, label: customBgLabel }
        : { mode: 'transparent' };

    void composeBgRemoverOutput(cutoutUrl, aspectRatio, bgConfig)
      .then((res) => {
        if (cancelled) return;
        setComposedUrl(res.pngDataUrl);
        setComposedDims({ w: res.width, h: res.height });
      })
      .catch(() => {
        if (cancelled) return;
        setComposedUrl(cutoutUrl);
      })
      .finally(() => {
        if (!cancelled) setIsComposing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cutoutUrl, aspectRatio, bgMode, customHex, customBgImageUrl, customBgLabel]);

  const handleUploadSubjectFile = useCallback(async (file: File) => {
    setErrorMessage(null);
    setStatusNotice(null);
    try {
      const loaded = await readImageFileForBgRemover(file);
      setOriginalUrl(loaded.dataUrl);
      setSourceDimensions({ w: loaded.width, h: loaded.height });
      setSubjectLabel(loaded.label);
      setCutoutUrl(null);
      setComposedUrl(null);
      setComposedDims(null);
      setPreviewTab('original');
      setAspectRatio('original');
      setBgMode('transparent');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not read image file.');
    }
  }, []);

  const handleLoadSample = (sample: (typeof SAMPLE_SUBJECTS)[number]) => {
    setErrorMessage(null);
    setStatusNotice(null);
    setOriginalUrl(sample.imageUrl);
    setSubjectLabel(sample.label);
    setCutoutUrl(null);
    setComposedUrl(null);
    setComposedDims(null);
    setPreviewTab('original');
    setAspectRatio('original');
    setBgMode('transparent');

    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setSourceDimensions({ w: img.naturalWidth, h: img.naturalHeight });
      }
    };
    img.src = sample.imageUrl;
  };

  const handleRemoveBackground = async () => {
    if (!originalUrl || isRemoving) return;
    setErrorMessage(null);
    setStatusNotice(null);
    setIsRemoving(true);

    try {
      const res = await removeImageBackground(originalUrl, { strictAi: true });
      setCutoutUrl(res.imageDataUrl);
      setPreviewTab('result');
    } catch (err) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Background removal could not complete right now. Please try again.'
      );
    } finally {
      setIsRemoving(false);
    }
  };

  const handleUploadCustomBackground = async (file: File) => {
    setErrorMessage(null);
    try {
      const loaded = await readImageFileForBgRemover(file);
      setCustomBgImageUrl(loaded.dataUrl);
      setCustomBgLabel(loaded.label);
      setBgMode('image');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Could not read background image file.'
      );
    }
  };

  const handleDownloadPng = async () => {
    if (!cutoutUrl) return;
    const downloadSource =
      composedUrl ||
      (await exportTransparentCutoutPng(cutoutUrl, aspectRatio).catch(() => cutoutUrl));
    const safeName = subjectLabel
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const a = document.createElement('a');
    a.href = downloadSource;
    a.download = `${safeName || 'ahi-cutout'}-${aspectRatio === 'original' ? 'cutout' : aspectRatio.replace(':', 'x')}.png`;
    a.click();
    setStatusNotice(
      bgMode === 'transparent'
        ? 'Downloaded transparent PNG with full alpha channel.'
        : 'Downloaded PNG with your selected background and framing.'
    );
  };

  const handleSendToGenerator = async (target: 'image' | 'video') => {
    if (!cutoutUrl || !originalUrl) return;
    setErrorMessage(null);
    const transparentPng = await exportTransparentCutoutPng(cutoutUrl, aspectRatio).catch(
      () => cutoutUrl
    );
    const payload = {
      imageUrl: transparentPng,
      originalImageUrl: originalUrl,
      label: subjectLabel || 'Cutout Subject',
      aspectRatio,
    };
    if (target === 'image') {
      onSendToImageGenerator(payload);
    } else {
      onSendToVideoGenerator(payload);
    }
  };

  const handleReset = () => {
    setOriginalUrl(null);
    setCutoutUrl(null);
    setComposedUrl(null);
    setComposedDims(null);
    setSourceDimensions(null);
    setSubjectLabel('Cutout Subject');
    setPreviewTab('original');
    setAspectRatio('original');
    setBgMode('transparent');
    setCustomBgImageUrl(null);
    setCustomBgLabel('');
    setErrorMessage(null);
    setStatusNotice(null);
    if (subjectInputRef.current) subjectInputRef.current.value = '';
    if (bgInputRef.current) bgInputRef.current.value = '';
  };

  const activePreviewUrl =
    previewTab === 'result' && (composedUrl || cutoutUrl)
      ? composedUrl || cutoutUrl
      : originalUrl;

  const showCheckerboardStage =
    previewTab === 'result' && Boolean(cutoutUrl) && bgMode === 'transparent';

  return (
    <div className="pb-16 space-y-6">
      <input
        ref={subjectInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadSubjectFile(file);
          e.target.value = '';
        }}
        className="hidden"
      />
      <input
        ref={bgInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleUploadCustomBackground(file);
          e.target.value = '';
        }}
        className="hidden"
      />

      {/* Editorial Header & Transparent Pricing Disclosure */}
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-white/10 pb-5">
        <div className="space-y-1.5 max-w-2xl">
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-[#F8FAFC] text-balance">
            Background Remover
          </h1>
          <p className="text-sm text-[#94A3B8] leading-relaxed">
            Isolate characters, products, and photos with AI segmentation, export transparent PNGs,
            swap backgrounds, or expand the canvas without distorting your subject.
          </p>
          <p className="text-xs text-[#64748B]">
            100% Free AI Segmentation (RMBG / BiRefNet) · No Usage Fees · Server-Secured Routing
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => subjectInputRef.current?.click()}
            className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 hover:border-[#2DD4BF]/45 text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Upload className="w-4 h-4 text-[#2DD4BF]" />
            {originalUrl ? 'Upload New Image' : 'Upload Image'}
          </button>
          {originalUrl && (
            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-transparent hover:bg-white/[0.06] border border-white/10 text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </button>
          )}
        </div>
      </header>

      {errorMessage && (
        <div
          role="alert"
          className="rounded-2xl bg-red-950/50 border border-red-500/40 px-4 py-3 text-xs text-red-200 flex items-center justify-between gap-3"
        >
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-red-300 hover:text-white font-medium cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {statusNotice && (
        <div
          role="status"
          className="rounded-2xl bg-[rgba(17,22,33,0.72)] border border-[#2DD4BF]/35 px-4 py-3 text-xs text-[#F8FAFC] flex items-center justify-between gap-3"
        >
          <span className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-[#2DD4BF] shrink-0" />
            {statusNotice}
          </span>
          <button
            type="button"
            onClick={() => setStatusNotice(null)}
            className="text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Main Responsive Workspace Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Primary Canvas & Actions Column */}
        <section className="lg:col-span-8 space-y-4">
          {!originalUrl ? (
            /* Empty / Upload Dropzone */
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                dragCounterRef.current += 1;
                setIsDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
                if (dragCounterRef.current === 0) setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                dragCounterRef.current = 0;
                setIsDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handleUploadSubjectFile(file);
              }}
              className={`rounded-2xl border-2 border-dashed transition-all p-6 sm:p-10 text-center space-y-6 bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl ${
                isDragging
                  ? 'border-[#2DD4BF] bg-[#2DD4BF]/10'
                  : 'border-white/15 hover:border-[#2DD4BF]/45'
              }`}
            >
              <div className="mx-auto w-14 h-14 rounded-2xl bg-[#2DD4BF]/15 border border-[#2DD4BF]/35 text-[#2DD4BF] flex items-center justify-center">
                <Scissors className="w-6 h-6" />
              </div>

              <div className="space-y-2 max-w-md mx-auto">
                <h2 className="font-display text-lg font-semibold text-[#F8FAFC]">
                  Upload an image to remove its background
                </h2>
                <p className="text-xs text-[#94A3B8] leading-relaxed">
                  Supports PNG, JPG, and WEBP from phones or computers. Works cleanly on cartoon
                  characters, 3D renders, products, and real photographs.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => subjectInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] text-[#07090E] text-xs font-bold shadow-[0_0_24px_rgba(45,212,191,0.24)] transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Choose Photo (PNG, JPG, WEBP)
                </button>
              </div>

              {/* Quick Sample Tryouts */}
              <div className="pt-4 border-t border-white/10 space-y-3">
                <div className="text-xs font-medium text-[#94A3B8]">
                  Or try instantly with a sample subject
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-xl mx-auto">
                  {SAMPLE_SUBJECTS.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={() => handleLoadSample(sample)}
                      className="flex items-center gap-3 p-2.5 rounded-xl bg-[#07090E]/75 hover:bg-[#07090E] border border-white/10 hover:border-[#2DD4BF]/45 text-left transition-all cursor-pointer min-h-[44px]"
                    >
                      <img
                        src={sample.imageUrl}
                        alt={sample.label}
                        referrerPolicy="no-referrer"
                        className="w-11 h-11 rounded-lg object-cover shrink-0 border border-white/10"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#F8FAFC] truncate">
                          {sample.label}
                        </div>
                        <div className="text-[11px] text-[#64748B] truncate">
                          {sample.category}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            /* Interactive Original / Result Canvas Stage */
            <div className="rounded-2xl bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 p-4 sm:p-5 space-y-4">
              {/* Top Toolbar: Original / Result Segmented Control + Dimensions Readout */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div
                  role="tablist"
                  aria-label="Image preview mode"
                  className="inline-flex items-center p-1 bg-[#07090E]/85 border border-white/10 rounded-xl"
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewTab === 'original'}
                    onClick={() => setPreviewTab('original')}
                    className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      previewTab === 'original'
                        ? 'bg-[#2DD4BF] text-[#07090E]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={previewTab === 'result'}
                    disabled={!cutoutUrl}
                    onClick={() => setPreviewTab('result')}
                    className={`min-h-[40px] px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                      previewTab === 'result'
                        ? 'bg-[#2DD4BF] text-[#07090E]'
                        : 'text-[#94A3B8] hover:text-[#F8FAFC]'
                    }`}
                  >
                    Result
                  </button>
                </div>

                <div className="text-xs text-[#94A3B8] tabular-nums flex items-center gap-2">
                  {previewTab === 'result' && composedDims ? (
                    <>
                      <span>
                        {composedDims.w} × {composedDims.h} px
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {bgMode === 'transparent' ? 'Transparent PNG' : 'PNG Export Ready'}
                      </span>
                    </>
                  ) : sourceDimensions ? (
                    <>
                      <span>
                        {sourceDimensions.w} × {sourceDimensions.h} px
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>Original Preview</span>
                    </>
                  ) : (
                    <span>Original Preview</span>
                  )}
                </div>
              </div>

              {/* Stage Viewport */}
              <div
                className={`relative w-full min-h-[280px] sm:min-h-[400px] max-h-[58vh] rounded-xl border border-white/10 overflow-hidden flex items-center justify-center p-3 sm:p-5 ${
                  showCheckerboardStage ? 'ahi-checkerboard' : 'bg-[#07090E]'
                }`}
              >
                {activePreviewUrl && (
                  <img
                    src={activePreviewUrl}
                    alt={
                      previewTab === 'result'
                        ? `${subjectLabel} with background removed`
                        : `${subjectLabel} original preview`
                    }
                    referrerPolicy="no-referrer"
                    className="max-h-[52vh] w-auto max-w-full object-contain rounded-lg select-none"
                  />
                )}

                {isComposing && cutoutUrl && !isRemoving && (
                  <div className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg bg-[#07090E]/85 border border-white/10 text-[11px] text-[#94A3B8] flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-[#2DD4BF]" />
                    Updating canvas...
                  </div>
                )}

                {/* Sleek Minimal Segmentation Overlay */}
                {isRemoving && (
                  <div className="absolute inset-0 bg-[#07090E]/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center space-y-4">
                    <div className="relative w-16 h-16 flex items-center justify-center">
                      <div className="absolute inset-0 rounded-full border-2 border-[#2DD4BF]/25" />
                      <div className="absolute inset-0 rounded-full border-2 border-t-[#2DD4BF] border-r-transparent border-b-transparent border-l-transparent ahi-orbit-cw" />
                      <Scissors className="w-5 h-5 text-[#2DD4BF]" />
                    </div>
                    <div className="space-y-1">
                      <div className="font-display text-base font-semibold text-[#F8FAFC]">
                        Removing background...
                      </div>
                      <p className="text-xs text-[#94A3B8]">
                        This usually takes a few moments
                      </p>
                    </div>
                    <div className="w-48 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full w-1/2 rounded-full bg-[#2DD4BF] ahi-bar-sweep" />
                    </div>
                  </div>
                )}
              </div>

              {/* Primary Action Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <button
                    type="button"
                    disabled={isRemoving}
                    onClick={() => void handleRemoveBackground()}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2DD4BF] hover:bg-[#34D399] disabled:opacity-50 text-[#07090E] text-xs font-bold shadow-[0_0_24px_rgba(45,212,191,0.24)] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {isRemoving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Removing...
                      </>
                    ) : (
                      <>
                        <Scissors className="w-4 h-4" />
                        {cutoutUrl ? 'Re-Run Removal' : 'Remove Background'}
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={!cutoutUrl || isRemoving}
                    onClick={() => void handleDownloadPng()}
                    className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] disabled:opacity-35 border border-white/10 hover:border-[#2DD4BF]/45 text-xs font-semibold text-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 text-[#2DD4BF]" />
                    Download PNG
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleReset}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-transparent hover:bg-white/[0.06] border border-white/10 text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>

              {/* Direct Integration into AHI Image & Video Generators */}
              {cutoutUrl && (
                <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="text-xs font-semibold text-[#F8FAFC]">
                      Use Cutout in A.H.I Studio
                    </div>
                    <p className="text-[11px] text-[#94A3B8]">
                      Sends your transparent PNG directly as a character reference.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleSendToGenerator('image')}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#2DD4BF]/15 hover:bg-[#2DD4BF]/25 border border-[#2DD4BF]/40 text-xs font-semibold text-[#2DD4BF] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <ImageIcon className="w-3.5 h-3.5" />
                      Send to Image Generator
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleSendToGenerator('video')}
                      className="inline-flex items-center justify-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-[#2DD4BF]/15 hover:bg-[#2DD4BF]/25 border border-[#2DD4BF]/40 text-xs font-semibold text-[#2DD4BF] transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <Video className="w-3.5 h-3.5" />
                      Send to Video Generator
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Controls Panel: Aspect Ratio & Replace Background */}
        <aside className="lg:col-span-4 space-y-5">
          {/* Subject Name */}
          <div className="rounded-2xl bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 p-4 space-y-3">
            <label
              htmlFor="bg-remover-label"
              className="block text-xs font-semibold text-[#F8FAFC]"
            >
              Subject Label
            </label>
            <input
              id="bg-remover-label"
              type="text"
              value={subjectLabel}
              onChange={(e) => setSubjectLabel(e.target.value)}
              placeholder="e.g., Milo, Luna, Red Backpack"
              className="w-full min-h-[44px] bg-[#07090E]/80 border border-white/10 focus:border-[#2DD4BF]/60 rounded-xl px-3 py-2 text-xs text-[#F8FAFC] placeholder-[#64748B] focus:outline-none"
            />
          </div>

          {/* Aspect Ratio Canvas Expansion */}
          <div className="rounded-2xl bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 p-4 space-y-3">
            <div className="space-y-0.5">
              <h2 className="text-xs font-semibold text-[#F8FAFC]">Canvas Aspect Ratio</h2>
              <p className="text-[11px] text-[#94A3B8]">
                Expands the surrounding canvas while keeping the full subject unstretched.
              </p>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-3 gap-2">
              {BG_REMOVER_ASPECT_RATIOS.map((ratio) => {
                const active = aspectRatio === ratio.id;
                return (
                  <button
                    key={ratio.id}
                    type="button"
                    disabled={!cutoutUrl}
                    onClick={() => setAspectRatio(ratio.id)}
                    className={`min-h-[44px] px-2.5 py-2 rounded-xl border text-center transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      active
                        ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#2DD4BF]'
                        : 'bg-[#07090E]/75 border-white/10 text-[#F8FAFC] hover:border-[#2DD4BF]/35'
                    }`}
                  >
                    <div className="text-xs font-semibold tabular-nums whitespace-nowrap">
                      {ratio.label}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Replace Background Options */}
          <div className="rounded-2xl bg-[rgba(17,22,33,0.72)] backdrop-blur-2xl border border-white/10 p-4 space-y-4">
            <div className="space-y-0.5">
              <h2 className="text-xs font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Replace Background
              </h2>
              <p className="text-[11px] text-[#94A3B8]">
                {cutoutUrl
                  ? 'Choose transparent output, solid colour, or upload your own backdrop.'
                  : 'Remove the background first to edit or replace the backdrop.'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!cutoutUrl}
                onClick={() => setBgMode('transparent')}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  bgMode === 'transparent'
                    ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#2DD4BF]'
                    : 'bg-[#07090E]/75 border-white/10 text-[#F8FAFC] hover:border-[#2DD4BF]/35'
                }`}
              >
                <span className="w-4 h-4 rounded border border-white/20 ahi-checkerboard shrink-0" />
                <span className="truncate">Transparent</span>
              </button>

              <button
                type="button"
                disabled={!cutoutUrl}
                onClick={() => setBgMode('white')}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  bgMode === 'white'
                    ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#2DD4BF]'
                    : 'bg-[#07090E]/75 border-white/10 text-[#F8FAFC] hover:border-[#2DD4BF]/35'
                }`}
              >
                <span className="w-4 h-4 rounded border border-white/25 bg-white shrink-0" />
                <span className="truncate">White</span>
              </button>

              <button
                type="button"
                disabled={!cutoutUrl}
                onClick={() => setBgMode('color')}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  bgMode === 'color'
                    ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#2DD4BF]'
                    : 'bg-[#07090E]/75 border-white/10 text-[#F8FAFC] hover:border-[#2DD4BF]/35'
                }`}
              >
                <Palette className="w-4 h-4 shrink-0 text-[#2DD4BF]" />
                <span className="truncate">Solid Colour</span>
              </button>

              <button
                type="button"
                disabled={!cutoutUrl}
                onClick={() => {
                  if (customBgImageUrl) {
                    setBgMode('image');
                  } else {
                    bgInputRef.current?.click();
                  }
                }}
                className={`min-h-[44px] px-3 py-2 rounded-xl border text-xs font-medium flex items-center gap-2 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  bgMode === 'image'
                    ? 'bg-[#2DD4BF]/15 border-[#2DD4BF]/60 text-[#2DD4BF]'
                    : 'bg-[#07090E]/75 border-white/10 text-[#F8FAFC] hover:border-[#2DD4BF]/35'
                }`}
              >
                <Sparkles className="w-4 h-4 shrink-0 text-[#2DD4BF]" />
                <span className="truncate">New Image</span>
              </button>
            </div>

            {/* Custom Solid Colour Picker */}
            {bgMode === 'color' && cutoutUrl && (
              <div className="pt-3 border-t border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="bg-custom-color"
                    className="text-xs font-medium text-[#94A3B8]"
                  >
                    Custom Colour
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono tabular-nums text-[#F8FAFC]">
                      {customHex.toUpperCase()}
                    </span>
                    <input
                      id="bg-custom-color"
                      type="color"
                      value={customHex}
                      onChange={(e) => setCustomHex(e.target.value)}
                      className="w-9 h-9 rounded-lg border border-white/15 bg-transparent cursor-pointer"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {SOLID_COLOR_SWATCHES.map((swatch) => (
                    <button
                      key={swatch.hex}
                      type="button"
                      onClick={() => setCustomHex(swatch.hex)}
                      aria-label={`Select colour ${swatch.hex}`}
                      className={`w-7 h-7 rounded-lg border transition-transform cursor-pointer ${swatch.bgClass} ${
                        customHex.toLowerCase() === swatch.hex.toLowerCase()
                          ? 'border-[#2DD4BF] scale-110'
                          : 'border-white/20 hover:scale-105'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Uploaded Background Image Controls */}
            {(bgMode === 'image' || customBgImageUrl) && cutoutUrl && (
              <div className="pt-3 border-t border-white/10 space-y-2.5">
                {customBgImageUrl ? (
                  <div className="flex items-center gap-3">
                    <img
                      src={customBgImageUrl}
                      alt={customBgLabel || 'Custom background'}
                      referrerPolicy="no-referrer"
                      className="w-14 h-10 rounded-lg object-cover border border-white/15 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium text-[#F8FAFC] truncate">
                        {customBgLabel || 'Uploaded Background'}
                      </div>
                      <div className="text-[11px] text-[#64748B]">Active backdrop</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => bgInputRef.current?.click()}
                      className="min-h-[36px] px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[11px] font-medium text-[#F8FAFC] cursor-pointer whitespace-nowrap"
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => bgInputRef.current?.click()}
                    className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#07090E]/80 hover:border-[#2DD4BF]/45 border border-dashed border-white/20 text-xs font-medium text-[#F8FAFC] flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#2DD4BF]" />
                    Upload Background Image
                  </button>
                )}
              </div>
            )}

            {bgMode !== 'image' && cutoutUrl && (
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-[#07090E]/65 hover:bg-[#07090E] border border-white/10 hover:border-[#2DD4BF]/40 text-xs font-medium text-[#94A3B8] hover:text-[#F8FAFC] flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#2DD4BF]" />
                Upload Background Photo
              </button>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
