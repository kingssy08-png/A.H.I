import type {
  AnimationStyle,
  CameraMotion,
  CharacterProfile,
  GeminiVoiceName,
  MusicTrackPreset,
  ShowcaseItem,
  ShowBible,
  VideoProject,
} from '../types/studio';

export const DEFAULT_SHOW_BIBLE: ShowBible = {
  id: 'main-show-bible',
  showTitle: 'Clockwork Harbor Kids',
  visualStyle: '3D Pixar-Style Cartoon',
  lockVisualStyle: true,
  worldSetting:
    'A warm sunlit coastal town of timber workshops, glowing glass lanterns, friendly brass inventions, and gentle sky-ships.',
  targetAgeGroup: 'Ages 6-8 (Early Kids)',
  updatedAt: '2026-11-24T00:00:00Z',
};

export const CAMERA_MOTIONS: Array<{
  id: CameraMotion;
  label: string;
  description: string;
}> = [
  { id: 'Zoom In', label: 'Zoom In', description: 'Slow dramatic push toward subject focal point' },
  { id: 'Zoom Out', label: 'Zoom Out', description: 'Gradual reveal pulling back to show environment' },
  { id: 'Pan Left', label: 'Pan Left', description: 'Smooth horizontal camera sweep across left horizon' },
  { id: 'Pan Right', label: 'Pan Right', description: 'Smooth horizontal tracking sweep to the right' },
  { id: 'Orbit', label: 'Orbit', description: '360-inspired arc circling around the hero subject' },
  { id: 'Drone Flyover', label: 'Drone Flyover', description: 'Elevated aerial glide over landscapes & skylines' },
  { id: 'Static', label: 'Static', description: 'Locked tripod cinema plate for crisp performance' },
];

export const STYLE_PRESETS: Array<{
  id: AnimationStyle;
  title: AnimationStyle;
  subtitle: string;
  paletteHint: string;
  previewImage: string;
  gradientClass: string;
}> = [
  {
    id: 'Warm Storybook 3D',
    title: 'Warm Storybook 3D',
    subtitle: 'Soft-focus vintage 35mm cinema lens, Pro-Mist halation bloom, and pastel matte clay & felt textures.',
    paletteHint: 'Sunlit bloom · Pastel matte clay · Soft 35mm mist',
    previewImage: '/src/assets/images/style_3d_cartoon_1795461025240.jpg',
    gradientClass: 'from-amber-950/60 via-zinc-900/90 to-zinc-950',
  },
  {
    id: 'Enchanted Storybook',
    title: 'Enchanted Storybook',
    subtitle: 'Golden volumetric sunbeams through mossy ancient trees, glowing fireflies, wildflowers, and warm painterly depth.',
    paletteHint: 'Golden sunbeams · Mossy canopy · Fireflies & painterly haze',
    previewImage: '/src/assets/images/style_enchanted_storybook_1795855536212.jpg',
    gradientClass: 'from-emerald-950/60 via-zinc-900/90 to-zinc-950',
  },
  {
    id: '3D Pixar-Style Cartoon',
    title: '3D Pixar-Style Cartoon',
    subtitle: 'Theatrical feature-film 3D animation with sculpted characters, tactile fabrics, PBR shaders, and global illumination.',
    paletteHint: 'Subsurface skin · Tactile fabrics · Theatrical global illumination',
    previewImage: '/src/assets/images/style_3d_cartoon_1795461025240.jpg',
    gradientClass: 'from-indigo-950/70 via-zinc-900/90 to-zinc-950',
  },
  {
    id: 'Anime',
    title: 'Anime',
    subtitle: 'Theatrical cel shading, hand-painted twilight skies, and dynamic kinetic camera framing.',
    paletteHint: 'Twilight indigo · Golden hour glow · Crisp linework',
    previewImage: '/src/assets/images/style_anime_1795461026386.jpg',
    gradientClass: 'from-cyan-950/70 via-zinc-900/90 to-zinc-950',
  },
  {
    id: 'Cinematic Film',
    title: 'Cinematic Film',
    subtitle: 'Anamorphic 2.39:1 depth, volumetric rain shafts, and moody neon specular reflections.',
    paletteHint: 'Obsidian shadows · Electric cyan · Rim highlights',
    previewImage: '/src/assets/images/showcase_cinematic_film_1795462965824.jpg',
    gradientClass: 'from-slate-900/80 via-zinc-950 to-black',
  },
  {
    id: '2D Illustration',
    title: '2D Illustration',
    subtitle: 'Painterly gouache textures, stylized storybook silhouettes, and layered parchment depth.',
    paletteHint: 'Indigo twilight · Warm ochre lanterns · Botanical Ink',
    previewImage: '/src/assets/images/showcase_2d_illustration_1795462965789.jpg',
    gradientClass: 'from-violet-950/60 via-zinc-900/90 to-zinc-950',
  },
  {
    id: 'Music Video',
    title: 'Music Video',
    subtitle: 'Beat-synced camera choreography, vivid stage lighting, and kinetic performance framing.',
    paletteHint: 'Electric mint · Neon rim light · Anamorphic flares',
    previewImage: '/src/assets/images/showcase_cinematic_film_1795462965824.jpg',
    gradientClass: 'from-slate-900/80 via-zinc-950 to-black',
  },
  {
    id: 'Product Ad',
    title: 'Product Ad',
    subtitle: 'Studio macro reflections, sweeping orbital highlights, and crisp commercial polish.',
    paletteHint: 'Obsidian studio · Brushed metal · Specular rim glow',
    previewImage: '/src/assets/images/showcase_product_ad_1795462965806.jpg',
    gradientClass: 'from-zinc-900/80 via-zinc-950 to-black',
  },
  {
    id: 'Realistic',
    title: 'Realistic',
    subtitle: 'Photoreal studio lighting, crisp glass & brushed metal physics, and commercial product clarity.',
    paletteHint: 'Studio obsidian · Cool cyan sweep · High contrast',
    previewImage: '/src/assets/images/showcase_product_ad_1795462965806.jpg',
    gradientClass: 'from-zinc-900/80 via-zinc-950 to-black',
  },
  {
    id: 'Educational',
    title: 'Educational',
    subtitle: 'Clean 2.5D motion-graphics diagrams, orbital geometry, and crisp visual explainers.',
    paletteHint: 'Deep slate void · Cyan vectors · Luminous amber',
    previewImage: '/src/assets/images/style_educational_1795461025982.jpg',
    gradientClass: 'from-teal-950/60 via-zinc-900/90 to-zinc-950',
  },
];

export const COMMUNITY_SHOWCASE: ShowcaseItem[] = [
  {
    id: 'show-1',
    title: 'The Clockwork Beacon',
    creator: '@mira.atelier',
    category: '3D Cartoons',
    style: '3D Pixar-Style Cartoon',
    aspectRatio: '16:9',
    cameraMotion: 'Zoom In',
    prompt:
      'Cozy timber rooftop workshop above a twilight harbor town, glowing glass Edison lanterns, brass gears orbiting a miniature lighthouse lens, 3D Pixar-style cartoon render, soft volumetric mist.',
    imageUrl: '/src/assets/images/style_3d_cartoon_1795461025240.jpg',
    engineLabel: 'Flux.1 Schnell + Wan 2.1',
  },
  {
    id: 'show-2',
    title: 'Midnight Obsidian Chronograph',
    creator: '@kuro.commercial',
    category: 'Product Ads',
    style: 'Realistic',
    aspectRatio: '9:16',
    cameraMotion: 'Orbit',
    prompt:
      'Luxury matte black mechanical wristwatch floating above wet volcanic basalt rock, sharp cyan studio rim lighting, subtle levitating water droplets, ultra-clean commercial product macro.',
    imageUrl: '/src/assets/images/showcase_product_ad_1795462965806.jpg',
    engineLabel: 'Flux.1 Schnell',
  },
  {
    id: 'show-3',
    title: 'Neon Overpass — Rain Sector 7',
    creator: '@tomasz.dop',
    category: 'Cinematic Shots',
    style: 'Cinematic Film',
    aspectRatio: '16:9',
    cameraMotion: 'Drone Flyover',
    prompt:
      'Anamorphic cinematic film wide shot of a lone courier in a dark trench coat crossing an elevated rain-slicked overpass, cyan and indigo neon reflections in puddles, atmospheric fog.',
    imageUrl: '/src/assets/images/showcase_cinematic_film_1795462965824.jpg',
    engineLabel: 'Wan 2.1 + Gemini Director',
  },
  {
    id: 'show-4',
    title: 'Last Express at Mu Coast',
    creator: '@hanabi.frames',
    category: 'Anime',
    style: 'Anime',
    aspectRatio: '16:9',
    cameraMotion: 'Pan Right',
    prompt:
      'Theatrical anime wide shot of an elevated coastal train platform at sunset, painted towering cumulonimbus clouds, wind catching a mustard scarf as harbor lights shimmer below.',
    imageUrl: '/src/assets/images/style_anime_1795461026386.jpg',
    engineLabel: 'SDXL + CogVideoX',
  },
  {
    id: 'show-5',
    title: 'Moonlit Botanical Conservatory',
    creator: '@elena.gouache',
    category: 'Cinematic Shots',
    style: '2D Illustration',
    aspectRatio: '1:1',
    cameraMotion: 'Zoom Out',
    prompt:
      'Editorial 2D gouache illustration of a domed glass botanical observatory in a twilight forest, warm lantern light spilling through wrought-iron panes, swirling indigo fireflies.',
    imageUrl: '/src/assets/images/showcase_2d_illustration_1795462965789.jpg',
    engineLabel: 'Flux.1 Schnell',
  },
  {
    id: 'show-6',
    title: 'Luna Vance — Airship Deck',
    creator: '@studio.foundry',
    category: '3D Cartoons',
    style: '3D Pixar-Style Cartoon',
    aspectRatio: '1:1',
    cameraMotion: 'Orbit',
    prompt:
      'Expressive 3D stylized cartoon character portrait of an airship navigator with brass pilot goggles, freckled cheeks, slate-blue flight jacket, warm golden hour backlight.',
    imageUrl: '/src/assets/images/char_luna_pilot_1795461026794.jpg',
    engineLabel: 'Flux.1 Schnell · Consistent Character',
  },
  {
    id: 'show-7',
    title: 'Orbital Resonance Clockwork',
    creator: '@cosmos.explain',
    category: 'Product Ads',
    style: 'Educational',
    aspectRatio: '16:9',
    cameraMotion: 'Zoom In',
    prompt:
      'Clean 2.5D motion graphics isometric view of luminous cyan orbital paths coupled with precision brass clockwork gears floating in a dark obsidian studio void.',
    imageUrl: '/src/assets/images/style_educational_1795461025982.jpg',
    engineLabel: 'Gemini + LTX-Video',
  },
  {
    id: 'show-8',
    title: 'Professor Barnaby — Midnight Desk',
    creator: '@owlworks.3d',
    category: '3D Cartoons',
    style: '3D Pixar-Style Cartoon',
    aspectRatio: '1:1',
    cameraMotion: 'Static',
    prompt:
      'Scholarly 3D cartoon barn owl wearing wire-rimmed spectacles and olive tweed waistcoat holding an engraved brass compass inside a cozy candlelit archive.',
    imageUrl: '/src/assets/images/char_professor_owl_1795461027243.jpg',
    engineLabel: 'Flux.1 + SadTalker Lip-Sync',
  },
];

export const VOICE_PRESETS: Array<{
  name: GeminiVoiceName;
  archetype: string;
  register: string;
  bestFor: string;
}> = [
  {
    name: 'Kore',
    archetype: 'Warm Storyteller',
    register: 'Alto · Expressive',
    bestFor: 'Animated narration & educational explainers',
  },
  {
    name: 'Puck',
    archetype: 'Spirited Adventurer',
    register: 'Tenor · Upbeat',
    bestFor: '3D cartoon leads & lively dialogue',
  },
  {
    name: 'Charon',
    archetype: 'Seasoned Mentor',
    register: 'Baritone · Grounded',
    bestFor: 'Documentary voiceover & wise elders',
  },
  {
    name: 'Fenrir',
    archetype: 'Dramatic Trailblazer',
    register: 'Bass-Baritone · Crisp',
    bestFor: 'Anime trailers & high-stakes action',
  },
  {
    name: 'Zephyr',
    archetype: 'Bright Host',
    register: 'Mezzo · Articulate',
    bestFor: 'Science breakdowns & upbeat guides',
  },
];

export const MUSIC_PRESETS: MusicTrackPreset[] = [
  {
    id: 'track-workshop-marimba',
    title: 'Sunlit Workshop Marimba',
    mood: 'Curious & Playful (Kids Show)',
    bpm: 108,
    baseFreq: 261.63,
    scaleIntervals: [0, 2, 4, 7, 9, 12],
    waveform: 'triangle',
    description: 'Plucked wooden pulse tailored for 3D cartoon inventions and lighthearted discovery.',
  },
  {
    id: 'track-pixie-celeste',
    title: 'Toybox Wonder Celeste',
    mood: 'Warm & Magical (Preschool)',
    bpm: 98,
    baseFreq: 329.63,
    scaleIntervals: [0, 2, 4, 7, 11, 12],
    waveform: 'sine',
    description: 'Gentle chime bells and cozy lullaby bounce built for heartwarming animated lessons.',
  },
  {
    id: 'track-heroic-strings',
    title: 'Starlight Adventure Orchestra',
    mood: 'Uplifting & Heroic (Family)',
    bpm: 114,
    baseFreq: 246.94,
    scaleIntervals: [0, 2, 4, 5, 7, 9, 12],
    waveform: 'triangle',
    description: 'Bright orchestral pulse for soaring sky-ship adventures and joyful episode outros.',
  },
  {
    id: 'track-twilight-piano',
    title: 'Twilight Platform Strings',
    mood: 'Wistful & Cinematic',
    bpm: 82,
    baseFreq: 220.0,
    scaleIntervals: [0, 3, 5, 7, 10, 12],
    waveform: 'sine',
    description: 'Floating harmonic pads and gentle arpeggios suited for theatrical anime transitions.',
  },
  {
    id: 'track-science-pulse',
    title: 'Orbital Mechanics Pulse',
    mood: 'Focused & Analytical',
    bpm: 96,
    baseFreq: 293.66,
    scaleIntervals: [0, 2, 5, 7, 9, 14],
    waveform: 'sine',
    description: 'Clean minimal synth rhythm engineered to sit cleanly underneath educational narration.',
  },
  {
    id: 'track-tension-drone',
    title: 'Midnight Brass Tension',
    mood: 'Suspenseful & Noir',
    bpm: 72,
    baseFreq: 146.83,
    scaleIntervals: [0, 1, 5, 7, 8, 12],
    waveform: 'sawtooth',
    description: 'Low-pass filtered analog pulse for mystery reveals and dramatic turning points.',
  },
];

export const SEED_CHARACTERS: CharacterProfile[] = [
  {
    id: 'char-milo-hero',
    name: 'Milo',
    role: 'Milo & Friends Hero',
    styleAffinity: '3D Pixar-Style Cartoon',
    appearancePrompt:
      'Friendly 7-year-old animated boy hero with tousled chestnut-brown hair, expressive hazel eyes, light freckles, warm subsurface skin shading, royal-blue zip-up hoodie layered over a golden-yellow crew shirt, and a bright red canvas adventure backpack with brass compass clip.',
    personalityTraits: ['Brave', 'Curious', 'Kind-hearted'],
    voiceName: 'Puck',
    voiceStyle: 'Bright, enthusiastic young kid adventure hero bursting with warmth',
    voiceArchetype: 'Energetic Kid Hero',
    voicePreset: 'cartoon',
    voicePitch: 1.08,
    voiceSpeed: 1.04,
    lockedVoice: true,
    signatureProps: 'Red adventure backpack & pocket brass compass',
    colorPalette: ['#2563EB', '#FACC15', '#DC2626', '#2DD4BF'],
    avatarUrl: '/src/assets/images/char_milo_kid_hero_1795855533787.jpg',
  },
  {
    id: 'char-luna-vance',
    name: 'Luna',
    role: 'Milo & Friends Explorer',
    styleAffinity: '3D Pixar-Style Cartoon',
    appearancePrompt:
      'Young female adventurer with tousled auburn hair, brass pilot goggles pushed onto her forehead, freckled cheeks, expressive eyes, and a tailored slate-blue explorer jacket with brass compass pendant.',
    personalityTraits: ['Resourceful', 'Optimistic', 'Quick-witted'],
    voiceName: 'Zephyr',
    voiceStyle: 'Energetic, curious young adventurer with crisp diction',
    voiceArchetype: 'Energetic Kid Hero',
    voicePreset: 'bright',
    voicePitch: 1.08,
    voiceSpeed: 1.04,
    lockedVoice: true,
    signatureProps: 'Brass astrolabe & folding star chart',
    colorPalette: ['#3B556E', '#2DD4BF', '#06B6D4', '#07090E'],
    avatarUrl: '/src/assets/images/char_luna_pilot_1795461026794.jpg',
  },
  {
    id: 'char-benny-rabbit',
    name: 'Benny',
    role: 'Woodland Rabbit',
    styleAffinity: 'Enchanted Storybook',
    appearancePrompt:
      'Cheerful young anthropomorphic woodland rabbit with finely sculpted cream and warm tan fur, tall expressive ears, bright amber eyes, wearing a cozy moss-green knit scarf and warm terracotta corduroy overalls.',
    personalityTraits: ['Playful', 'Loyal', 'Observant'],
    voiceName: 'Puck',
    voiceStyle: 'Playful, cheerful woodland rabbit sidekick with lively timing',
    voiceArchetype: 'Silly Sidekick',
    voicePreset: 'cartoon',
    voicePitch: 1.12,
    voiceSpeed: 1.06,
    lockedVoice: true,
    signatureProps: 'Moss-green knit scarf & acorn satchel',
    colorPalette: ['#E7D3B0', '#4D7C0F', '#C2410C', '#2DD4BF'],
    avatarUrl: '/src/assets/images/char_benny_rabbit_1795855535117.jpg',
  },
  {
    id: 'char-zippy-robot',
    name: 'Zippy',
    role: 'Companion Robot',
    styleAffinity: '3D Pixar-Style Cartoon',
    appearancePrompt:
      'Adorable compact spherical companion robot with brushed mint-cyan and warm ivory metal plating, subtle brass joints, glowing tip antenna, articulated small arms, and a curved obsidian visor displaying joyful glowing cyan eyes.',
    personalityTraits: ['Clever', 'Helpful', 'Upbeat'],
    voiceName: 'Zephyr',
    voiceStyle: 'Crisp, cheerful little robot companion with gentle melodic warmth',
    voiceArchetype: 'Curious Explorer',
    voicePreset: 'bright',
    voicePitch: 1.14,
    voiceSpeed: 1.06,
    lockedVoice: true,
    signatureProps: 'Glowing cyan visor & folding mini wrench',
    colorPalette: ['#2DD4BF', '#F8FAFC', '#B45309', '#07090E'],
    avatarUrl: '/src/assets/images/char_zippy_robot_1795855535457.jpg',
  },
  {
    id: 'char-prof-barnaby',
    name: 'Professor Barnaby',
    role: 'Clockwork Archivist',
    styleAffinity: '3D Pixar-Style Cartoon',
    appearancePrompt:
      'Scholarly barn owl professor wearing round wire-rimmed spectacles, a tailored olive tweed waistcoat over a cream shirt, striped burgundy tie, holding an engraved brass pocket compass.',
    personalityTraits: ['Meticulous', 'Dry humor', 'Encyclopedic'],
    voiceName: 'Charon',
    voiceStyle: 'Warm, measured British-inflected academic mentor',
    voiceArchetype: 'Wise Gentle Elder',
    voicePreset: 'mentor',
    voicePitch: 0.92,
    voiceSpeed: 0.96,
    lockedVoice: true,
    signatureProps: 'Engraved brass compass & leather field journal',
    colorPalette: ['#52573E', '#2DD4BF', '#5E2B35', '#07090E'],
    avatarUrl: '/src/assets/images/char_professor_owl_1795461027243.jpg',
  },
  {
    id: 'char-ren-sato',
    name: 'Ren Sato',
    role: 'Coastal Astronomer',
    styleAffinity: 'Anime',
    appearancePrompt:
      'Teenage traveler in a dark indigo utility jacket, mustard knit scarf, and canvas backpack standing beneath dusk overhead train cables, expressive eyes reflecting harbor lights.',
    personalityTraits: ['Observant', 'Quietly determined', 'Poetic'],
    voiceName: 'Kore',
    voiceStyle: 'Reflective, gentle anime protagonist narration',
    voiceArchetype: 'Curious Explorer',
    voicePreset: 'female',
    voicePitch: 1.0,
    voiceSpeed: 1.0,
    lockedVoice: true,
    signatureProps: 'Vintage film camera & worn train pass',
    colorPalette: ['#243A5E', '#2DD4BF', '#704B38', '#07090E'],
    avatarUrl: '/src/assets/images/style_anime_1795461026386.jpg',
  },
  {
    id: 'char-nova-guide',
    name: 'Dr. Aria Chen',
    role: 'Science Explainer Host',
    styleAffinity: 'Educational',
    appearancePrompt:
      'Clean 2.5D stylized motion-graphics host in a charcoal turtleneck and cyan lapel pin, gesturing beside floating orbital geometry and luminous mechanical rings.',
    personalityTraits: ['Lucid', 'Enthusiastic', 'Structured'],
    voiceName: 'Puck',
    voiceStyle: 'Clear, engaging science communicator with warm pacing',
    voiceArchetype: 'Warm Storyteller',
    voicePreset: 'cartoon',
    voicePitch: 1.05,
    voiceSpeed: 1.02,
    lockedVoice: true,
    signatureProps: 'Interactive orbital rings & laser pointer',
    colorPalette: ['#2DD4BF', '#34D399', '#1E293B', '#07090E'],
    avatarUrl: '/src/assets/images/style_educational_1795461025982.jpg',
  },
];

export const SEED_PROJECTS: VideoProject[] = [
  {
    id: 'proj-clockwork-beacon',
    title: 'The Clockwork Beacon',
    seriesTitle: 'Clockwork Harbor Kids',
    seasonNumber: 1,
    episodeNumber: 1,
    targetAgeGroup: 'Ages 6-8 (Early Kids)',
    logline:
      'A young fox inventor and an owl archivist race against twilight to align the rooftop lighthouse before the night fog swallows the harbor.',
    storyIdea:
      'In a cozy brass-and-timber rooftop workshop above a harbor town, a young inventor rushes to calibrate a golden clockwork beacon as evening fog rolls in.',
    style: '3D Pixar-Style Cartoon',
    aspectRatio: '16:9',
    styleNotes:
      'Warm amber glass lantern key lights balanced against cool twilight indigo shadows. Tactile wood grain, brushed brass reflections, and gentle 35mm shallow depth of field.',
    suggestedMusicMood: 'Curious & Playful · 108 BPM',
    selectedMusicId: 'track-workshop-marimba',
    characterIds: ['char-luna-vance', 'char-prof-barnaby'],
    thumbnailUrl: '/src/assets/images/style_3d_cartoon_1795461025240.jpg',
    createdAt: '2026-11-20T10:15:00Z',
    updatedAt: '2026-11-23T09:40:00Z',
    scenes: [
      {
        id: 'sc-cb-1',
        sceneNumber: 1,
        title: 'Lanterns Over Harbor Town',
        durationSeconds: 8,
        cameraAngle: 'Wide Establishing Crane',
        cameraMotion: 'Zoom In',
        lightingMood: 'Golden dusk key with warm tungsten practicals',
        actionDescription:
          'Camera glides past hanging Edison bulbs into the open-air rooftop workshop overlooking the distant clock tower.',
        visualPrompt:
          '3D Pixar-style cartoon wide shot of a warm timber rooftop workshop overlooking a dusk coastal town, glowing glass lanterns, brass gears scattered across oak workbench, shallow depth of field.',
        narration:
          'High above the harbor roofs, every gear in the tower had only twelve minutes left before the sea mist arrived.',
        dialogueLines: [
          {
            id: 'dl-cb-1',
            speaker: 'Luna Vance',
            emotion: 'Focused',
            line: 'Hold the escapement steady, Professor—the mainspring is finally catching!',
          },
        ],
        sfxCue: 'Soft ticking clockwork, distant harbor bell chime',
        transition: 'Smooth Push-In',
        storyboard: {
          sketchNotes: 'Establish rooftop workshop depth with warm lantern foreground framing and distant harbor tower silhouette.',
          paletteHexes: ['#09090B', '#6366F1', '#06B6D4', '#F59E0B'],
          generatedAt: '2026-11-23T09:30:00Z',
          keyframes: [
            {
              id: 'kf-seed-1',
              beatLabel: 'Opening Frame',
              caption: 'Wide glide past hanging amber lanterns toward the open workshop arch.',
              cameraMotion: 'Zoom In',
              svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#09090B"/><stop offset="100%" stop-color="#1E1B4B"/></linearGradient><radialGradient id="glow1" cx="50%" cy="40%" r="45%"><stop offset="0%" stop-color="#06B6D4" stop-opacity="0.45"/><stop offset="100%" stop-color="#6366F1" stop-opacity="0"/></radialGradient></defs><rect width="640" height="360" fill="url(#sky1)"/><rect x="30" y="20" width="580" height="320" rx="10" fill="none" stroke="#3F3F46" stroke-width="1.5" stroke-dasharray="6 6"/><path d="M0 260 L120 220 L210 245 L320 190 L440 235 L540 205 L640 250 L640 360 L0 360 Z" fill="#111116"/><rect x="470" y="105" width="38" height="145" fill="#1E293B"/><polygon points="465,105 489,65 513,105" fill="#334155"/><circle cx="489" cy="130" r="9" fill="#06B6D4"/><circle cx="195" cy="95" r="70" fill="url(#glow1)"/><line x1="195" y1="0" x2="195" y2="75" stroke="#94A3B8" stroke-width="2"/><rect x="181" y="75" width="28" height="36" rx="8" fill="#F59E0B" opacity="0.9"/><rect x="80" y="275" width="480" height="85" rx="6" fill="#27272A"/><circle cx="320" cy="245" r="32" fill="#6366F1" opacity="0.85"/><circle cx="320" cy="245" r="14" fill="#09090B"/></svg>`,
            },
            {
              id: 'kf-seed-2',
              beatLabel: 'Action Beat',
              caption: 'Luna aligns the brass escapement wheel while Barnaby holds the lantern close.',
              cameraMotion: 'Pan Left',
              svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><radialGradient id="glow2" cx="48%" cy="55%" r="50%"><stop offset="0%" stop-color="#6366F1" stop-opacity="0.45"/><stop offset="100%" stop-color="#09090B" stop-opacity="0"/></radialGradient></defs><rect width="640" height="360" fill="#09090B"/><rect width="640" height="360" fill="url(#glow2)"/><rect x="60" y="250" width="520" height="110" fill="#18181B"/><circle cx="250" cy="165" r="46" fill="#27272A"/><path d="M210 250 C210 205, 290 205, 290 250 Z" fill="#3B556E"/><circle cx="250" cy="128" r="16" fill="#06B6D4"/><circle cx="425" cy="180" r="38" fill="#3F3F46"/><path d="M385 250 C385 210, 465 210, 465 250 Z" fill="#52573E"/><circle cx="330" cy="245" r="28" fill="none" stroke="#6366F1" stroke-width="6" stroke-dasharray="10 5"/><path d="M160 75 L235 75" stroke="#06B6D4" stroke-width="2" stroke-dasharray="4 4"/><polygon points="235,70 247,75 235,80" fill="#06B6D4"/></svg>`,
            },
            {
              id: 'kf-seed-3',
              beatLabel: 'Closing Beat',
              caption: 'Luminous lighthouse beam ignites and cuts across the incoming harbor mist.',
              cameraMotion: 'Zoom Out',
              svgMarkup: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360"><defs><linearGradient id="beam" x1="0" y1="0.5" x2="1" y2="0.2"><stop offset="0%" stop-color="#06B6D4" stop-opacity="0.85"/><stop offset="100%" stop-color="#6366F1" stop-opacity="0.05"/></linearGradient></defs><rect width="640" height="360" fill="#09090B"/><polygon points="210,165 640,40 640,210" fill="url(#beam)"/><rect x="155" y="135" width="60" height="225" fill="#18181B"/><polygon points="150,135 185,95 220,135" fill="#27272A"/><circle cx="205" cy="165" r="16" fill="#A5F3FC"/><path d="M0 290 Q160 270 320 295 T640 285 L640 360 L0 360 Z" fill="#18181B" opacity="0.75"/></svg>`,
            },
          ],
        },
      },
      {
        id: 'sc-cb-2',
        sceneNumber: 2,
        title: 'The Missing Calibrator',
        durationSeconds: 10,
        cameraAngle: 'Over-the-Shoulder Medium Close-Up',
        cameraMotion: 'Orbit',
        lightingMood: 'Warm amber under-lighting from oil flask',
        actionDescription:
          'Luna holds up the brass pliers while Professor Barnaby peers over his wire spectacles at the spinning central gear.',
        visualPrompt:
          '3D Pixar-style cartoon close-up on an intricate brass clockwork core on a wooden desk, warm orange glow from an adjacent glass vial, crisp metallic specular highlights.',
        narration:
          'One misaligned tooth would freeze the beacon until morning—and the fleet was already rounding the headland.',
        dialogueLines: [
          {
            id: 'dl-cb-2',
            speaker: 'Professor Barnaby',
            emotion: 'Measured',
            line: 'Three degrees counter-clockwise. Patience beats force every single time.',
          },
        ],
        sfxCue: 'Crisp metallic click, gentle ratchet wind',
        transition: 'Match Cut on Spinning Gear',
      },
      {
        id: 'sc-cb-3',
        sceneNumber: 3,
        title: 'Ignition at Dusk',
        durationSeconds: 10,
        cameraAngle: 'Low Heroic Pull-Back',
        cameraMotion: 'Drone Flyover',
        lightingMood: 'Radiant golden flare cutting through slate-indigo mist',
        actionDescription:
          'The central lens locks into alignment, projecting a warm beam across the harbor as distant ship horns answer in unison.',
        visualPrompt:
          '3D animated wide shot from behind the workshop window as a golden beam sweeps across twilight rooftops and calm harbor water.',
        narration:
          'Light spilled across the bay, turning a quiet workshop into the town’s brightest promise.',
        dialogueLines: [
          {
            id: 'dl-cb-3',
            speaker: 'Luna Vance',
            emotion: 'Relieved',
            line: 'Right on schedule. Let us log this one in the archive.',
          },
        ],
        sfxCue: 'Resonant brass hum, distant ship horn',
        transition: 'Fade to Black',
      },
    ],
  },
  {
    id: 'proj-platform-seven',
    title: 'Last Train at Mu Station',
    logline:
      'At a cliffside coastal station, a lone traveler waits for the twilight express carrying a letter meant for someone across the bay.',
    storyIdea:
      'An atmospheric anime short about a coastal train station at sunset where a young traveler reflects before boarding the final coastal train.',
    style: 'Anime',
    aspectRatio: '16:9',
    styleNotes:
      'Lush painted cloud layers transitioning from amber sunset to deep twilight indigo, sharp cel-shaded railings, and gentle wind physics on scarf and hair.',
    suggestedMusicMood: 'Wistful & Cinematic · 82 BPM',
    selectedMusicId: 'track-twilight-piano',
    characterIds: ['char-ren-sato'],
    thumbnailUrl: '/src/assets/images/style_anime_1795461026386.jpg',
    createdAt: '2026-11-18T14:20:00Z',
    updatedAt: '2026-11-22T17:10:00Z',
    scenes: [
      {
        id: 'sc-ps-1',
        sceneNumber: 1,
        title: 'Overlooking the Curved Bay',
        durationSeconds: 12,
        cameraAngle: 'Wide Architectural Pan',
        cameraMotion: 'Pan Right',
        lightingMood: 'Sunset orange horizon against cool platform shadow',
        actionDescription:
          'Ren leans against the steel platform railing as harbor town lights flicker on along the shoreline curve.',
        visualPrompt:
          'Theatrical anime wide shot of an elevated coastal train platform at twilight, young traveler in scarf looking over illuminated harbor bay, painterly clouds.',
        narration:
          'Every summer, the harbor lamps lit up from west to east, five minutes before the 6:42 express rounded the bend.',
        dialogueLines: [
          {
            id: 'dl-ps-1',
            speaker: 'Ren Sato',
            emotion: 'Quiet',
            line: 'If I miss tonight’s crossing, the tide chart changes again tomorrow.',
          },
        ],
        sfxCue: 'Distant ocean surf, wind rustling overhead wires',
        transition: 'Slow Dissolve',
      },
      {
        id: 'sc-ps-2',
        sceneNumber: 2,
        title: 'Headlamps on Curved Steel',
        durationSeconds: 10,
        cameraAngle: 'Telephoto Track-Level Shot',
        cameraMotion: 'Zoom In',
        lightingMood: 'Warm twin train headlights piercing indigo dusk',
        actionDescription:
          'The silver commuter train curves along the cliffside rails, casting warm streaks across the yellow tactile paving.',
        visualPrompt:
          'Modern anime film frame of a silver passenger train curving onto a coastal platform at dusk, glowing headlights reflecting on steel rails.',
        narration: 'And just like that, distance turned into an open door.',
        dialogueLines: [],
        sfxCue: 'Rhythmic rail clack, pneumatic brake hiss',
        transition: 'Cut on Door Chime',
      },
    ],
  },
  {
    id: 'proj-neon-overpass',
    title: 'Neon Overpass — Sector 7',
    logline:
      'A rain-drenched courier navigates an elevated neon highway while tracking an encrypted signal beneath flickering streetlamps.',
    storyIdea:
      'Sleek anamorphic cyberpunk film sequence following a lone courier across a wet midnight overpass illuminated by electric cyan and indigo reflections.',
    style: 'Cinematic Film',
    aspectRatio: '21:9',
    styleNotes:
      '21:9 anamorphic obsidian shadows, crisp cyan puddle reflections, volumetric fog diffusion, slow drone pull-back.',
    suggestedMusicMood: 'Suspenseful & Noir · 72 BPM',
    selectedMusicId: 'track-tension-drone',
    characterIds: [],
    thumbnailUrl: '/src/assets/images/showcase_cinematic_film_1795462965824.jpg',
    createdAt: '2026-11-19T19:00:00Z',
    updatedAt: '2026-11-23T08:15:00Z',
    scenes: [
      {
        id: 'sc-no-1',
        sceneNumber: 1,
        title: 'Wet Asphalt Horizon',
        durationSeconds: 10,
        cameraAngle: 'Anamorphic Low Tracking Shot',
        cameraMotion: 'Drone Flyover',
        lightingMood: 'Electric cyan rain glare and deep indigo shadow',
        actionDescription:
          'Drone sweeps forward over shimmering asphalt puddles toward the lone silhouette standing under an overpass light.',
        visualPrompt:
          'Cinematic anamorphic film frame of a rain-slicked city overpass at midnight, silhouette in dark trench coat, vibrant cyan and indigo neon reflections on wet pavement.',
        narration: 'After midnight, the elevated transit line belonged only to ghosts and couriers.',
        dialogueLines: [],
        sfxCue: 'Steady rainfall, distant subway rumble',
        transition: 'Hard Cut',
      },
    ],
  },
];

export const STORY_STARTERS: Array<{
  label: string;
  style: AnimationStyle;
  idea: string;
}> = [
  {
    label: 'Clockwork Rooftop Rescue',
    style: '3D Pixar-Style Cartoon',
    idea: 'A timid paper-kite maker and a boastful brass automaton must repair a wind-powered windmill before a sudden valley storm tears down their floating village.',
  },
  {
    label: 'Rainy Midnight Ramen Cart',
    style: 'Anime',
    idea: 'Under neon reflections in a quiet Tokyo backstreet, an elderly ramen chef serves one final bowl to a sleepless architecture student trying to finish her bridge model.',
  },
  {
    label: 'Obsidian Watch Commercial',
    style: 'Realistic',
    idea: 'Create a 30-second luxury product commercial revealing a matte titanium timepiece suspended above volcanic stone and crisp water droplets.',
  },
  {
    label: 'Midnight Overpass Chase',
    style: 'Cinematic Film',
    idea: 'Follow a rain-soaked acoustic engineer tracking an elusive harmonic signal across elevated midnight bridges and neon train yards.',
  },
];
