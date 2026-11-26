import { type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import { DEFAULT_SHOW_BIBLE, SEED_CHARACTERS, SEED_PROJECTS } from '../data/seedData';
import { db, handleFirestoreError, OperationType } from '../firebase';
import type {
  AnimationStyle,
  AspectRatio,
  CharacterExpressionView,
  CharacterProfile,
  GeminiVoiceName,
  Scene,
  ShowBible,
  ShowTargetAge,
  StudioCreation,
  TalkingVoicePreset,
  VideoProject,
  VoiceArchetype,
} from '../types/studio';

// Blueprint-synchronized constants (must match firebase-blueprint.json & firestore.rules verbatim)
const VALID_STYLES: AnimationStyle[] = [
  'Warm Storybook 3D',
  '3D Pixar-Style Cartoon',
  'Anime',
  'Cinematic Film',
  '2D Illustration',
  'Music Video',
  'Product Ad',
  'Realistic',
  '3D Cartoon',
  'Educational',
];
const VALID_RATIOS: AspectRatio[] = ['16:9', '9:16', '1:1', '21:9'];
const VALID_VOICES: GeminiVoiceName[] = ['Kore', 'Puck', 'Charon', 'Fenrir', 'Zephyr'];
const VALID_VOICE_PRESETS: TalkingVoicePreset[] = ['male', 'female', 'cartoon', 'mentor', 'bright'];
const VALID_TARGET_AGES: ShowTargetAge[] = [
  'Ages 3-5 (Preschool)',
  'Ages 6-8 (Early Kids)',
  'Ages 9-12 (Tween Adventure)',
  'All-Ages Family',
];
const ID_REGEX = /^[a-zA-Z0-9_\-]+$/;

export interface CloudWorkspaceProfile {
  uid: string;
  displayName: string;
  photoUrl: string;
}

export function sanitizeId(raw: string, fallbackPrefix = 'item'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_\-]/g, '-').slice(0, 128);
  if (cleaned.length >= 1 && ID_REGEX.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}-${Date.now()}`;
}

function clampString(value: unknown, maxLen: number, fallback = ''): string {
  const str = typeof value === 'string' ? value : fallback;
  return str.slice(0, maxLen);
}

function normalizeStyle(style: unknown): AnimationStyle {
  return VALID_STYLES.includes(style as AnimationStyle)
    ? (style as AnimationStyle)
    : '3D Pixar-Style Cartoon';
}

function normalizeAspectRatio(ratio: unknown): AspectRatio {
  return VALID_RATIOS.includes(ratio as AspectRatio) ? (ratio as AspectRatio) : '16:9';
}

function normalizeVoice(voice: unknown): GeminiVoiceName {
  return VALID_VOICES.includes(voice as GeminiVoiceName) ? (voice as GeminiVoiceName) : 'Kore';
}

function normalizeVoicePreset(preset: unknown): TalkingVoicePreset {
  return VALID_VOICE_PRESETS.includes(preset as TalkingVoicePreset)
    ? (preset as TalkingVoicePreset)
    : 'female';
}

function normalizeTargetAge(age: unknown): ShowTargetAge {
  return VALID_TARGET_AGES.includes(age as ShowTargetAge)
    ? (age as ShowTargetAge)
    : 'Ages 6-8 (Early Kids)';
}

/**
 * Ensures image/media URLs saved to Firestore never exceed the blueprint's maxLength
 * or Firestore's 1MB document ceiling.
 */
async function compactMediaUrlForFirestore(
  url: string | undefined,
  maxChars: number
): Promise<string> {
  if (!url) return '';
  if (url.length <= maxChars) return url;

  // Large inline video/audio blobs belong in local IndexedDB, not Firestore docs
  if (!url.startsWith('data:image/')) {
    return '';
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const targets = [
        { side: 512, quality: 0.72 },
        { side: 384, quality: 0.58 },
        { side: 256, quality: 0.45 },
      ];
      for (const t of targets) {
        const scale = Math.min(1, t.side / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/webp', t.quality);
        if (compressed.length <= maxChars) {
          resolve(compressed);
          return;
        }
      }
      resolve('');
    };
    img.onerror = () => resolve('');
    img.src = url;
  });
}

function sanitizeSceneForFirestore(scene: Scene): Record<string, unknown> {
  const safeVideoUrl =
    scene.generatedVideoUrl && scene.generatedVideoUrl.length <= 2048 ? scene.generatedVideoUrl : '';
  const safeLipSyncUrl =
    scene.lipSyncVideoUrl && scene.lipSyncVideoUrl.length <= 2048 ? scene.lipSyncVideoUrl : '';

  return {
    id: sanitizeId(scene.id || `scene-${scene.sceneNumber}`, 'scene'),
    sceneNumber: Number.isFinite(scene.sceneNumber) ? scene.sceneNumber : 1,
    title: clampString(scene.title || 'Untitled Scene', 120),
    ...(scene.storyBeat ? { storyBeat: clampString(scene.storyBeat, 40) } : {}),
    durationSeconds: Number.isFinite(scene.durationSeconds) ? scene.durationSeconds : 5,
    cameraAngle: clampString(scene.cameraAngle, 120),
    cameraMotion: clampString(scene.cameraMotion || 'Auto', 40),
    lightingMood: clampString(scene.lightingMood, 120),
    actionDescription: clampString(scene.actionDescription, 1200),
    visualPrompt: clampString(scene.visualPrompt, 1500),
    narration: clampString(scene.narration, 1200),
    dialogueLines: Array.isArray(scene.dialogueLines)
      ? scene.dialogueLines.slice(0, 10).map((d) => ({
          id: sanitizeId(d.id || 'line', 'line'),
          speaker: clampString(d.speaker, 80),
          emotion: clampString(d.emotion, 60),
          line: clampString(d.line, 400),
        }))
      : [],
    ...(Array.isArray(scene.assignedCharacterIds)
      ? {
          assignedCharacterIds: scene.assignedCharacterIds
            .slice(0, 8)
            .map((id) => sanitizeId(String(id), 'char')),
        }
      : {}),
    sfxCue: clampString(scene.sfxCue, 200),
    ...(scene.sfxPresetId ? { sfxPresetId: clampString(scene.sfxPresetId, 24) } : {}),
    transition: clampString(scene.transition, 80),
    ...(safeVideoUrl ? { generatedVideoUrl: safeVideoUrl } : {}),
    ...(scene.generatedVideoSpace
      ? { generatedVideoSpace: clampString(scene.generatedVideoSpace, 120) }
      : {}),
    ...(scene.generatedVideoMode ? { generatedVideoMode: scene.generatedVideoMode } : {}),
    ...(safeLipSyncUrl ? { lipSyncVideoUrl: safeLipSyncUrl } : {}),
    ...(scene.voiceName ? { voiceName: normalizeVoice(scene.voiceName) } : {}),
  };
}

function timestampToIso(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val) return val;
  return new Date().toISOString();
}

export async function ensureUserWorkspaceProfile(user: User): Promise<CloudWorkspaceProfile> {
  const path = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  const safeUid = sanitizeId(user.uid, 'user');
  const displayName = clampString(
    user.displayName?.trim() || user.email?.split('@')[0] || 'Creator',
    80,
    'Creator'
  );
  const photoUrl = clampString(user.photoURL || '', 512);

  try {
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: safeUid,
        displayName,
        photoUrl,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    const data = snap.exists() ? snap.data() : null;
    return {
      uid: safeUid,
      displayName: clampString(data?.displayName, 80, displayName) || displayName,
      photoUrl: clampString(data?.photoUrl, 512, photoUrl),
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function updateUserWorkspaceDisplayName(
  uid: string,
  displayName: string,
  photoUrl = ''
): Promise<void> {
  const path = `users/${uid}`;
  const ref = doc(db, 'users', uid);
  try {
    await updateDoc(ref, {
      displayName: clampString(displayName.trim() || 'Creator', 80, 'Creator'),
      photoUrl: clampString(photoUrl, 512),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function saveCloudProject(
  uid: string,
  project: VideoProject,
  isExisting = false
): Promise<void> {
  const safeProjectId = sanitizeId(project.id, 'proj');
  const path = `users/${uid}/projects/${safeProjectId}`;
  const ref = doc(db, 'users', uid, 'projects', safeProjectId);

  const safeThumbnail = await compactMediaUrlForFirestore(project.thumbnailUrl, 195000);
  const safeCharacterIds = (Array.isArray(project.characterIds) ? project.characterIds : [])
    .slice(0, 20)
    .map((id) => sanitizeId(String(id), 'char'));
  const safeScenes = (Array.isArray(project.scenes) ? project.scenes : [])
    .slice(0, 24)
    .map(sanitizeSceneForFirestore);

  const editableFields = {
    title: clampString(project.title?.trim() || 'Untitled Story', 120, 'Untitled Story'),
    seriesTitle: clampString(project.seriesTitle?.trim() || '', 120),
    seasonNumber: Math.min(50, Math.max(1, Math.round(Number(project.seasonNumber) || 1))),
    episodeNumber: Math.min(200, Math.max(1, Math.round(Number(project.episodeNumber) || 1))),
    targetAgeGroup: normalizeTargetAge(project.targetAgeGroup),
    logline: clampString(project.logline, 600),
    storyIdea: clampString(project.storyIdea, 2000),
    style: normalizeStyle(project.style),
    aspectRatio: normalizeAspectRatio(project.aspectRatio),
    styleNotes: clampString(project.styleNotes, 500),
    suggestedMusicMood: clampString(project.suggestedMusicMood, 120),
    selectedMusicId: clampString(project.selectedMusicId, 128),
    characterIds: safeCharacterIds,
    scenes: safeScenes,
    thumbnailUrl: safeThumbnail,
    updatedAt: serverTimestamp(),
  };

  try {
    await ensureUserWorkspaceProfileIfMissing(uid);
    if (isExisting) {
      const existingSnap = await getDoc(ref);
      if (existingSnap.exists()) {
        await updateDoc(ref, editableFields);
        return;
      }
    }
    await setDoc(ref, {
      id: safeProjectId,
      ownerId: sanitizeId(uid, 'user'),
      ...editableFields,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, isExisting ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCloudProject(uid: string, projectId: string): Promise<void> {
  const safeId = sanitizeId(projectId, 'proj');
  const path = `users/${uid}/projects/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'projects', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudCharacter(
  uid: string,
  character: CharacterProfile,
  isExisting = false
): Promise<void> {
  const safeCharId = sanitizeId(character.id, 'char');
  const path = `users/${uid}/characters/${safeCharId}`;
  const ref = doc(db, 'users', uid, 'characters', safeCharId);

  const safeAvatar = await compactMediaUrlForFirestore(character.avatarUrl, 240000);
  const safeTraits = (Array.isArray(character.personalityTraits) ? character.personalityTraits : [])
    .slice(0, 10)
    .map((t) => clampString(t, 64))
    .filter(Boolean);
  const safePalette = (Array.isArray(character.colorPalette) ? character.colorPalette : [])
    .slice(0, 8)
    .map((c) => clampString(c, 32))
    .filter(Boolean);
  const safeSource =
    character.avatarSource === 'studio' ||
    character.avatarSource === 'flux' ||
    character.avatarSource === 'upload'
      ? character.avatarSource
      : 'studio';

  const safeExpressionSheet: CharacterExpressionView[] = [];
  if (Array.isArray(character.expressionSheet)) {
    for (const item of character.expressionSheet.slice(0, 4)) {
      if (!item || typeof item.imageUrl !== 'string') continue;
      const compacted = await compactMediaUrlForFirestore(item.imageUrl, 60000);
      if (compacted) {
        safeExpressionSheet.push({
          expression: item.expression,
          imageUrl: compacted,
        });
      }
    }
  }

  const editableFields = {
    name: clampString(character.name?.trim() || 'New Character', 80, 'New Character'),
    role: clampString(character.role, 80),
    styleAffinity: normalizeStyle(character.styleAffinity),
    appearancePrompt: clampString(character.appearancePrompt, 1000),
    personalityTraits: safeTraits,
    voiceName: normalizeVoice(character.voiceName),
    voiceStyle: clampString(character.voiceStyle, 200),
    voiceArchetype: clampString(character.voiceArchetype || 'Warm Storyteller', 64),
    voicePreset: normalizeVoicePreset(character.voicePreset),
    voicePitch: Math.min(2.0, Math.max(0.5, Number(character.voicePitch) || 1.0)),
    voiceSpeed: Math.min(2.0, Math.max(0.5, Number(character.voiceSpeed) || 1.0)),
    lockedVoice: character.lockedVoice !== false,
    signatureProps: clampString(character.signatureProps, 300),
    colorPalette: safePalette,
    avatarUrl: safeAvatar,
    avatarSource: safeSource,
    expressionSheet: safeExpressionSheet,
    updatedAt: serverTimestamp(),
  };

  try {
    await ensureUserWorkspaceProfileIfMissing(uid);
    if (isExisting) {
      const snap = await getDoc(ref);
      if (snap.exists()) {
        await updateDoc(ref, editableFields);
        return;
      }
    }
    await setDoc(ref, {
      id: safeCharId,
      ownerId: sanitizeId(uid, 'user'),
      ...editableFields,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, isExisting ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCloudCharacter(uid: string, characterId: string): Promise<void> {
  const safeId = sanitizeId(characterId, 'char');
  const path = `users/${uid}/characters/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'characters', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveCloudCreation(uid: string, creation: StudioCreation): Promise<void> {
  const safeId = sanitizeId(creation.id, 'creation');
  const path = `users/${uid}/creations/${safeId}`;
  const ref = doc(db, 'users', uid, 'creations', safeId);

  const safeMediaUrl = await compactMediaUrlForFirestore(creation.mediaUrl, 285000);

  try {
    await ensureUserWorkspaceProfileIfMissing(uid);
    await setDoc(ref, {
      id: safeId,
      ownerId: sanitizeId(uid, 'user'),
      mode: creation.mode === 'video' ? 'video' : 'image',
      prompt: clampString(creation.prompt.trim() || 'Untitled creation', 1500, 'Untitled creation'),
      style: clampString(creation.style || '3D Cartoon', 40, '3D Cartoon'),
      aspectRatio: normalizeAspectRatio(creation.aspectRatio),
      mediaUrl: safeMediaUrl,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteCloudCreation(uid: string, creationId: string): Promise<void> {
  const safeId = sanitizeId(creationId, 'creation');
  const path = `users/${uid}/creations/${safeId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'creations', safeId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

const pendingWorkspaceInit = new Map<string, Promise<void>>();
const showBibleWriteChain = new Map<string, Promise<void>>();

async function ensureUserWorkspaceProfileIfMissing(uid: string): Promise<void> {
  const existingInit = pendingWorkspaceInit.get(uid);
  if (existingInit) {
    return existingInit;
  }

  const initPromise = (async () => {
    const ref = doc(db, 'users', uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        uid: sanitizeId(uid, 'user'),
        displayName: 'Creator',
        photoUrl: '',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  })().finally(() => {
    pendingWorkspaceInit.delete(uid);
  });

  pendingWorkspaceInit.set(uid, initPromise);
  return initPromise;
}

export async function saveCloudShowBible(uid: string, bible: ShowBible): Promise<void> {
  const safeBibleId = sanitizeId(bible.id || 'main-show-bible', 'bible');
  const path = `users/${uid}/showBibles/${safeBibleId}`;
  const ref = doc(db, 'users', uid, 'showBibles', safeBibleId);

  const editableFields = {
    showTitle: clampString(bible.showTitle?.trim() || 'Clockwork Harbor Kids', 120, 'Clockwork Harbor Kids'),
    visualStyle: normalizeStyle(bible.visualStyle),
    lockVisualStyle: Boolean(bible.lockVisualStyle),
    worldSetting: clampString(bible.worldSetting, 1200),
    targetAgeGroup: normalizeTargetAge(bible.targetAgeGroup),
    updatedAt: serverTimestamp(),
  };

  const previous = showBibleWriteChain.get(uid) ?? Promise.resolve();
  const nextWrite = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        await ensureUserWorkspaceProfileIfMissing(uid);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          await updateDoc(ref, editableFields);
          return;
        }
        await setDoc(ref, {
          id: safeBibleId,
          ownerId: sanitizeId(uid, 'user'),
          ...editableFields,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    });

  showBibleWriteChain.set(uid, nextWrite);
  return nextWrite;
}

export function subscribeToCloudWorkspace(
  uid: string,
  callbacks: {
    onProjects: (projects: VideoProject[]) => void;
    onCharacters: (characters: CharacterProfile[]) => void;
    onCreations: (creations: StudioCreation[]) => void;
    onShowBible?: (showBible: ShowBible) => void;
  }
): Unsubscribe {
  const projectsPath = `users/${uid}/projects`;
  const charactersPath = `users/${uid}/characters`;
  const creationsPath = `users/${uid}/creations`;
  const showBiblesPath = `users/${uid}/showBibles`;

  const projectsQuery = query(
    collection(db, 'users', uid, 'projects'),
    where('ownerId', '==', uid)
  );

  const charactersQuery = query(
    collection(db, 'users', uid, 'characters'),
    where('ownerId', '==', uid)
  );

  const creationsQuery = query(
    collection(db, 'users', uid, 'creations'),
    where('ownerId', '==', uid)
  );

  let seededStarterProjects = false;
  let seededStarterCharacters = false;

  const unsubProjects = onSnapshot(
    projectsQuery,
    (snap) => {
      if (snap.empty && !seededStarterProjects) {
        seededStarterProjects = true;
        void Promise.all(SEED_PROJECTS.map((proj) => saveCloudProject(uid, proj, false))).catch(
          () => undefined
        );
        return;
      }
      const list: VideoProject[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || 'Untitled Story'),
            seriesTitle: typeof data.seriesTitle === 'string' ? data.seriesTitle : undefined,
            seasonNumber: typeof data.seasonNumber === 'number' ? data.seasonNumber : 1,
            episodeNumber: typeof data.episodeNumber === 'number' ? data.episodeNumber : 1,
            targetAgeGroup: data.targetAgeGroup ? normalizeTargetAge(data.targetAgeGroup) : undefined,
            logline: String(data.logline || ''),
            storyIdea: String(data.storyIdea || ''),
            style: normalizeStyle(data.style),
            aspectRatio: normalizeAspectRatio(data.aspectRatio),
            styleNotes: String(data.styleNotes || ''),
            suggestedMusicMood: String(data.suggestedMusicMood || ''),
            selectedMusicId: String(data.selectedMusicId || ''),
            characterIds: Array.isArray(data.characterIds) ? (data.characterIds as string[]) : [],
            scenes: Array.isArray(data.scenes) ? (data.scenes as Scene[]) : [],
            thumbnailUrl:
              typeof data.thumbnailUrl === 'string' && data.thumbnailUrl
                ? data.thumbnailUrl
                : undefined,
            createdAt: timestampToIso(data.createdAt),
            updatedAt: timestampToIso(data.updatedAt),
          };
        })
        .sort((a, b) => (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt));
      callbacks.onProjects(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, projectsPath);
    }
  );

  const unsubCharacters = onSnapshot(
    charactersQuery,
    (snap) => {
      if (snap.empty && !seededStarterCharacters) {
        seededStarterCharacters = true;
        void Promise.all(SEED_CHARACTERS.map((char) => saveCloudCharacter(uid, char, false))).catch(
          () => undefined
        );
        return;
      }
      const list: CharacterProfile[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: String(data.name || 'Character'),
          role: String(data.role || ''),
          styleAffinity: normalizeStyle(data.styleAffinity),
          appearancePrompt: String(data.appearancePrompt || ''),
          personalityTraits: Array.isArray(data.personalityTraits)
            ? (data.personalityTraits as string[])
            : [],
          voiceName: normalizeVoice(data.voiceName),
          voiceStyle: String(data.voiceStyle || ''),
          voiceArchetype: typeof data.voiceArchetype === 'string' ? (data.voiceArchetype as VoiceArchetype) : undefined,
          voicePreset: data.voicePreset ? normalizeVoicePreset(data.voicePreset) : undefined,
          voicePitch: typeof data.voicePitch === 'number' ? data.voicePitch : 1.0,
          voiceSpeed: typeof data.voiceSpeed === 'number' ? data.voiceSpeed : 1.0,
          lockedVoice: typeof data.lockedVoice === 'boolean' ? data.lockedVoice : true,
          signatureProps: String(data.signatureProps || ''),
          colorPalette: Array.isArray(data.colorPalette) ? (data.colorPalette as string[]) : [],
          avatarUrl: typeof data.avatarUrl === 'string' && data.avatarUrl ? data.avatarUrl : undefined,
          avatarSource: (data.avatarSource as CharacterProfile['avatarSource']) || 'studio',
          expressionSheet: Array.isArray(data.expressionSheet)
            ? (data.expressionSheet as CharacterExpressionView[])
            : undefined,
        };
      });
      callbacks.onCharacters(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, charactersPath);
    }
  );

  const unsubCreations = onSnapshot(
    creationsQuery,
    (snap) => {
      const list: StudioCreation[] = snap.docs
        .map((d) => {
          const data = d.data();
          return {
            id: d.id,
            mode: (data.mode === 'video' ? 'video' : 'image') as 'image' | 'video',
            prompt: String(data.prompt || ''),
            style: String(data.style || '3D Cartoon'),
            aspectRatio: normalizeAspectRatio(data.aspectRatio),
            mediaUrl: String(data.mediaUrl || ''),
            createdAt: timestampToIso(data.createdAt),
          };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      callbacks.onCreations(list);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, creationsPath);
    }
  );

  const showBiblesQuery = query(
    collection(db, 'users', uid, 'showBibles'),
    where('ownerId', '==', uid)
  );
  let seededShowBible = false;
  const unsubShowBibles = onSnapshot(
    showBiblesQuery,
    (snap) => {
      if (snap.empty && !seededShowBible) {
        seededShowBible = true;
        void saveCloudShowBible(uid, DEFAULT_SHOW_BIBLE).catch(() => undefined);
        return;
      }
      const docSnap = snap.docs[0];
      if (docSnap && callbacks.onShowBible) {
        const data = docSnap.data();
        callbacks.onShowBible({
          id: docSnap.id,
          showTitle: String(data.showTitle || DEFAULT_SHOW_BIBLE.showTitle),
          visualStyle: normalizeStyle(data.visualStyle),
          lockVisualStyle: Boolean(data.lockVisualStyle ?? true),
          worldSetting: String(data.worldSetting || DEFAULT_SHOW_BIBLE.worldSetting),
          targetAgeGroup: normalizeTargetAge(data.targetAgeGroup),
          updatedAt: timestampToIso(data.updatedAt),
        });
      }
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, showBiblesPath);
    }
  );

  return () => {
    unsubProjects();
    unsubCharacters();
    unsubCreations();
    unsubShowBibles();
  };
}

export async function deleteCloudWorkspace(uid: string): Promise<void> {
  const subcollections = ['projects', 'characters', 'creations', 'showBibles'] as const;

  for (const sub of subcollections) {
    const colPath = `users/${uid}/${sub}`;
    try {
      const q = query(collection(db, 'users', uid, sub), where('ownerId', '==', uid));
      const snap = await getDocs(q);
      for (const docSnap of snap.docs) {
        const docPath = `${colPath}/${docSnap.id}`;
        try {
          await deleteDoc(docSnap.ref);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, docPath);
        }
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, colPath);
    }
  }

  const rootPath = `users/${uid}`;
  const rootRef = doc(db, 'users', uid);
  try {
    const rootSnap = await getDoc(rootRef);
    if (rootSnap.exists()) {
      await deleteDoc(rootRef);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, rootPath);
  }
}
