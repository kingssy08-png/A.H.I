import type { FoleySfxId, MusicTrackPreset } from '../types/studio';

export const FOLEY_SFX_PRESETS: Array<{
  id: FoleySfxId;
  label: string;
  description: string;
}> = [
  { id: 'none', label: 'No SFX', description: 'Clean scene without sound effect' },
  { id: 'sparkle', label: 'Magical Sparkle', description: 'Shimmering ascending celesta chimes' },
  { id: 'boing', label: 'Comedic Boing', description: 'Playful cartoon spring bounce' },
  { id: 'footsteps', label: 'Footsteps', description: 'Light brisk stepping taps' },
  { id: 'whoosh', label: 'Cinema Whoosh', description: 'Fast air sweep transition' },
  { id: 'nature', label: 'Nature Ambience', description: 'Soft breeze and gentle bird chirps' },
  { id: 'fanfare', label: 'Victory Fanfare', description: 'Warm cheerful triad flourish' },
];

export function scheduleFoleySfx(
  ctx: BaseAudioContext,
  dest: AudioNode,
  sfxId: FoleySfxId | undefined,
  atTime: number
): void {
  if (!sfxId || sfxId === 'none') return;
  const t0 = Math.max(0, atTime);

  if (sfxId === 'sparkle') {
    const notes = [880, 1174.66, 1396.91, 1760, 2349.32];
    notes.forEach((freq, i) => {
      const start = t0 + i * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.42);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + 0.45);
    });
    return;
  }

  if (sfxId === 'boing') {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t0);
    osc.frequency.exponentialRampToValueAtTime(520, t0 + 0.22);
    osc.frequency.exponentialRampToValueAtTime(240, t0 + 0.65);

    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(18, t0);
    lfoGain.gain.setValueAtTime(34, t0);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.32, t0 + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.72);

    osc.connect(gain);
    gain.connect(dest);
    lfo.start(t0);
    osc.start(t0);
    lfo.stop(t0 + 0.75);
    osc.stop(t0 + 0.75);
    return;
  }

  if (sfxId === 'footsteps') {
    for (let i = 0; i < 4; i++) {
      const stepT = t0 + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(145 - (i % 2) * 18, stepT);
      osc.frequency.exponentialRampToValueAtTime(52, stepT + 0.08);
      gain.gain.setValueAtTime(0.0001, stepT);
      gain.gain.linearRampToValueAtTime(0.28, stepT + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, stepT + 0.11);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(stepT);
      osc.stop(stepT + 0.12);
    }
    return;
  }

  if (sfxId === 'whoosh') {
    const length = Math.floor(ctx.sampleRate * 0.7);
    const noiseBuf = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 1.6;
    filter.frequency.setValueAtTime(220, t0);
    filter.frequency.exponentialRampToValueAtTime(1900, t0 + 0.28);
    filter.frequency.exponentialRampToValueAtTime(260, t0 + 0.68);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(0.26, t0 + 0.24);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.68);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    noise.start(t0);
    noise.stop(t0 + 0.7);
    return;
  }

  if (sfxId === 'nature') {
    const chirps = [
      { offset: 0.08, f1: 1850, f2: 2450 },
      { offset: 0.26, f1: 2100, f2: 2700 },
      { offset: 0.65, f1: 1720, f2: 2300 },
    ];
    chirps.forEach((c) => {
      const start = t0 + c.offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(c.f1, start);
      osc.frequency.exponentialRampToValueAtTime(c.f2, start + 0.07);
      osc.frequency.exponentialRampToValueAtTime(c.f1 * 0.92, start + 0.14);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.14, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, start + 0.16);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + 0.18);
    });
    return;
  }

  if (sfxId === 'fanfare') {
    const notes = [
      { freq: 523.25, delay: 0, dur: 0.16 },
      { freq: 659.25, delay: 0.14, dur: 0.16 },
      { freq: 783.99, delay: 0.28, dur: 0.16 },
      { freq: 1046.5, delay: 0.44, dur: 0.55 },
    ];
    notes.forEach((n) => {
      const start = t0 + n.delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.freq, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.24, start + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, start + n.dur);
      osc.connect(gain);
      gain.connect(dest);
      osc.start(start);
      osc.stop(start + n.dur + 0.03);
    });
  }
}

export function svgToDataUrl(svgMarkup: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;
}

export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

class StudioAudioPlayer {
  private ctx: AudioContext | null = null;
  private timerId: number | null = null;
  private masterGain: GainNode | null = null;
  private step = 0;
  private currentTrackId: string | null = null;

  public getPlayingTrackId(): string | null {
    return this.currentTrackId;
  }

  public stop(): void {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
    if (this.masterGain && this.ctx) {
      try {
        this.masterGain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
      } catch {
        // ignore audio context teardown errors
      }
    }
    this.currentTrackId = null;
  }

  public setVolume(volume: number): void {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(Math.max(0.001, Math.min(0.6, volume * 0.45)), this.ctx.currentTime, 0.05);
    }
  }

  public playPreset(
    preset: Pick<MusicTrackPreset, 'id' | 'bpm' | 'baseFreq' | 'scaleIntervals' | 'waveform'>,
    volume = 0.55
  ): void {
    this.stop();

    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }

    const master = this.ctx.createGain();
    master.gain.value = Math.max(0.01, Math.min(0.6, volume * 0.45));
    master.connect(this.ctx.destination);
    this.masterGain = master;
    this.currentTrackId = preset.id;
    this.step = 0;

    const stepMs = Math.max(140, Math.round((60 / Math.max(50, preset.bpm)) * 500));

    const playNote = () => {
      if (!this.ctx || !this.masterGain || this.currentTrackId !== preset.id) return;
      const now = this.ctx.currentTime;
      const intervals = preset.scaleIntervals.length > 0 ? preset.scaleIntervals : [0, 4, 7, 12];
      const pattern = [0, 2, 1, 3, 2, 4 % intervals.length, 1, 0];
      const interval = intervals[pattern[this.step % pattern.length] % intervals.length];
      const freq = preset.baseFreq * Math.pow(2, interval / 12);

      const osc = this.ctx.createOscillator();
      const filter = this.ctx.createBiquadFilter();
      const env = this.ctx.createGain();

      osc.type = preset.waveform;
      osc.frequency.setValueAtTime(freq, now);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(preset.waveform === 'sawtooth' ? 680 : 1850, now);

      env.gain.setValueAtTime(0.0001, now);
      env.gain.linearRampToValueAtTime(0.28, now + 0.03);
      env.gain.exponentialRampToValueAtTime(0.001, now + stepMs / 1000 * 0.92);

      osc.connect(filter);
      filter.connect(env);
      env.connect(this.masterGain);

      osc.start(now);
      osc.stop(now + stepMs / 1000);

      // Subtle root bass pulse every 4 steps
      if (this.step % 4 === 0) {
        const bass = this.ctx.createOscillator();
        const bassEnv = this.ctx.createGain();
        bass.type = 'sine';
        bass.frequency.setValueAtTime(preset.baseFreq * 0.5, now);
        bassEnv.gain.setValueAtTime(0.0001, now);
        bassEnv.gain.linearRampToValueAtTime(0.22, now + 0.04);
        bassEnv.gain.exponentialRampToValueAtTime(0.001, now + (stepMs * 2) / 1000);
        bass.connect(bassEnv);
        bassEnv.connect(this.masterGain);
        bass.start(now);
        bass.stop(now + (stepMs * 2) / 1000);
      }

      this.step += 1;
    };

    playNote();
    this.timerId = window.setInterval(playNote, stepMs);
  }

  public playFoleySfx(sfxId: FoleySfxId): void {
    if (sfxId === 'none') return;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    if (!this.ctx) {
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const sfxGain = this.ctx.createGain();
    sfxGain.gain.value = 0.85;
    sfxGain.connect(this.ctx.destination);
    scheduleFoleySfx(this.ctx, sfxGain, sfxId, this.ctx.currentTime + 0.02);
  }
}

export const studioAudio = new StudioAudioPlayer();

export function getBrowserSpeechVoices(): SpeechSynthesisVoice[] {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return [];
  return window.speechSynthesis.getVoices();
}

export function speakWithBrowserTts(
  text: string,
  options?: { voiceName?: string; rate?: number; pitch?: number; onEnd?: () => void }
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text.trim()) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text.trim());
  const voices = window.speechSynthesis.getVoices();
  if (options?.voiceName) {
    const found = voices.find((v) => v.name === options.voiceName);
    if (found) utterance.voice = found;
  }
  utterance.rate = options?.rate ?? 1;
  utterance.pitch = options?.pitch ?? 1;
  if (options?.onEnd) {
    utterance.onend = options.onEnd;
    utterance.onerror = options.onEnd;
  }
  window.speechSynthesis.speak(utterance);
}

export function stopBrowserTts(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

function encodeAudioBufferToWav(buffer: AudioBuffer): Uint8Array {
  const numChannels = Math.min(2, buffer.numberOfChannels);
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const dataSize = length * numChannels * 2;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);

  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) {
      view.setUint8(offset + i, s.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * 2, true);
  view.setUint16(32, numChannels * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let pos = 44;
  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(pos, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      pos += 2;
    }
  }

  return new Uint8Array(out);
}

export async function renderProjectAudioMixWav(params: {
  totalDurationSec: number;
  titleSlateDurationSec: number;
  signatureShimmerTimes?: number[];
  musicPreset: Pick<MusicTrackPreset, 'bpm' | 'baseFreq' | 'scaleIntervals' | 'waveform'>;
  musicGain?: number;
  enableAutoDuck?: boolean;
  includeFoley?: boolean;
  scenes: Array<{
    durationSeconds: number;
    voiceAudioBase64?: string;
    sfxPresetId?: FoleySfxId;
    clipVoiceBuffer?: AudioBuffer | null;
  }>;
}): Promise<Uint8Array> {
  const sampleRate = 24000;
  const totalSec = Math.max(1, params.totalDurationSec);
  const OfflineCtx =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const ctx = new OfflineCtx(2, Math.ceil(totalSec * sampleRate), sampleRate);

  // Optional gentle crystalline shimmer aligned with calligraphy light-beam sweeps
  if (params.signatureShimmerTimes?.length) {
    const shimmerGain = ctx.createGain();
    shimmerGain.gain.value = 0.22;
    shimmerGain.connect(ctx.destination);
    params.signatureShimmerTimes.forEach((sweepAt) => {
      if (sweepAt >= 0 && sweepAt < totalSec - 0.3) {
        [523.25, 783.99, 1046.5].forEach((freq, idx) => {
          const t0 = sweepAt + idx * 0.055;
          const osc = ctx.createOscillator();
          const env = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t0);
          env.gain.setValueAtTime(0.0001, t0);
          env.gain.linearRampToValueAtTime(0.18, t0 + 0.04);
          env.gain.exponentialRampToValueAtTime(0.0008, Math.min(totalSec, t0 + 0.45));
          osc.connect(env);
          env.connect(shimmerGain);
          osc.start(t0);
          osc.stop(Math.min(totalSec, t0 + 0.48));
        });
      }
    });
  }

  // Music bed routed through dynamic ducking gain node
  const baseMusicGain = params.musicGain ?? 0.25;
  const musicBus = ctx.createGain();
  musicBus.gain.value = baseMusicGain;
  const musicDuckGain = ctx.createGain();
  musicDuckGain.gain.setValueAtTime(1, 0);
  musicBus.connect(musicDuckGain);
  musicDuckGain.connect(ctx.destination);

  const stepSec = Math.max(0.16, (60 / Math.max(50, params.musicPreset.bpm)) * 0.5);
  const intervals =
    params.musicPreset.scaleIntervals.length > 0
      ? params.musicPreset.scaleIntervals
      : [0, 4, 7, 12];
  const pattern = [0, 2, 1, 3, 2, 4 % intervals.length, 1, 0];

  let stepIdx = 0;
  for (let t = 0; t < totalSec - 0.1; t += stepSec) {
    const interval = intervals[pattern[stepIdx % pattern.length] % intervals.length];
    const freq = params.musicPreset.baseFreq * Math.pow(2, interval / 12);

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const env = ctx.createGain();

    osc.type = params.musicPreset.waveform;
    osc.frequency.setValueAtTime(freq, t);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(
      params.musicPreset.waveform === 'sawtooth' ? 620 : 1650,
      t
    );

    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(0.24, t + 0.03);
    env.gain.exponentialRampToValueAtTime(0.001, Math.min(totalSec, t + stepSec * 0.92));

    osc.connect(filter);
    filter.connect(env);
    env.connect(musicBus);
    osc.start(t);
    osc.stop(Math.min(totalSec, t + stepSec));

    if (stepIdx % 4 === 0) {
      const bass = ctx.createOscillator();
      const bassEnv = ctx.createGain();
      bass.type = 'sine';
      bass.frequency.setValueAtTime(params.musicPreset.baseFreq * 0.5, t);
      bassEnv.gain.setValueAtTime(0.0001, t);
      bassEnv.gain.linearRampToValueAtTime(0.18, t + 0.04);
      bassEnv.gain.exponentialRampToValueAtTime(0.001, Math.min(totalSec, t + stepSec * 1.9));
      bass.connect(bassEnv);
      bassEnv.connect(musicBus);
      bass.start(t);
      bass.stop(Math.min(totalSec, t + stepSec * 2));
    }

    stepIdx += 1;
  }

  const sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.72;
  sfxBus.connect(ctx.destination);

  const shouldDuck = params.enableAutoDuck !== false;
  const shouldIncludeFoley = params.includeFoley !== false;

  // Overlay Foley SFX, synthesized narration, and talking clip speech + apply Automatic Voice Ducking
  let cursor = params.titleSlateDurationSec;
  for (const sc of params.scenes) {
    if (shouldIncludeFoley && sc.sfxPresetId && sc.sfxPresetId !== 'none') {
      scheduleFoleySfx(ctx, sfxBus, sc.sfxPresetId, cursor + 0.15);
    }

    let speechDuration = 0;

    if (sc.clipVoiceBuffer) {
      try {
        const src = ctx.createBufferSource();
        src.buffer = sc.clipVoiceBuffer;
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0.98;
        src.connect(voiceGain);
        voiceGain.connect(ctx.destination);
        src.start(cursor, 0, Math.min(sc.durationSeconds, sc.clipVoiceBuffer.duration));
        speechDuration = Math.max(speechDuration, Math.min(sc.durationSeconds, sc.clipVoiceBuffer.duration));
      } catch {
        // ignore invalid clip buffer
      }
    }

    if (sc.voiceAudioBase64) {
      try {
        const raw = sc.voiceAudioBase64.includes(',')
          ? sc.voiceAudioBase64.split(',')[1]
          : sc.voiceAudioBase64;
        const bin = atob(raw);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
          bytes[i] = bin.charCodeAt(i);
        }
        const decoded = await ctx.decodeAudioData(bytes.buffer.slice(0));
        const src = ctx.createBufferSource();
        src.buffer = decoded;
        const voiceGain = ctx.createGain();
        voiceGain.gain.value = 0.96;
        src.connect(voiceGain);
        voiceGain.connect(ctx.destination);
        src.start(cursor);
        speechDuration = Math.max(speechDuration, Math.min(sc.durationSeconds, decoded.duration));
      } catch {
        // skip invalid audio clip gracefully
      }
    }

    if (shouldDuck && speechDuration > 0.15) {
      const duckStart = Math.max(0, cursor - 0.08);
      const duckEnd = Math.min(totalSec, cursor + speechDuration + 0.12);
      musicDuckGain.gain.setValueAtTime(1, duckStart);
      musicDuckGain.gain.linearRampToValueAtTime(0.24, Math.min(totalSec, duckStart + 0.15));
      musicDuckGain.gain.setValueAtTime(0.24, Math.max(duckStart + 0.16, duckEnd - 0.2));
      musicDuckGain.gain.linearRampToValueAtTime(1, duckEnd);
    }

    cursor += sc.durationSeconds;
  }

  const rendered = await ctx.startRendering();
  return encodeAudioBufferToWav(rendered);
}
