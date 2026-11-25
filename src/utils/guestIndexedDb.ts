import { DEFAULT_SHOW_BIBLE, SEED_CHARACTERS, SEED_PROJECTS } from '../data/seedData';
import type { CharacterProfile, ShowBible, StudioCreation, VideoProject } from '../types/studio';

const DB_NAME = 'ahi_guest_studio_db';
const DB_VERSION = 1;

const STORE_PROJECTS = 'projects';
const STORE_CHARACTERS = 'characters';
const STORE_CREATIONS = 'creations';
const STORE_META = 'meta';

const LEGACY_STORAGE_KEYS = {
  projects: ['ahi_projects_v1', 'kinoforge_projects_v2'],
  characters: ['ahi_characters_v1', 'kinoforge_characters_v2'],
  activeProject: ['ahi_active_project_v1', 'kinoforge_active_project_v2'],
};

export interface GuestWorkspaceSnapshot {
  projects: VideoProject[];
  characters: CharacterProfile[];
  creations: StudioCreation[];
  activeProjectId: string;
  showBible: ShowBible;
}

// In-memory fallback if browser blocks IndexedDB (e.g. strict private browsing)
const memoryFallback: GuestWorkspaceSnapshot = {
  projects: [...SEED_PROJECTS],
  characters: [...SEED_CHARACTERS],
  creations: [],
  activeProjectId: SEED_PROJECTS[0].id,
  showBible: { ...DEFAULT_SHOW_BIBLE },
};

function openGuestDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHARACTERS)) {
          db.createObjectStore(STORE_CHARACTERS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CREATIONS)) {
          db.createObjectStore(STORE_CREATIONS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_META)) {
          db.createObjectStore(STORE_META, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).getAll();
      req.onsuccess = () => resolve(Array.isArray(req.result) ? (req.result as T[]) : []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

function readMetaValue<T>(db: IDBDatabase, key: string): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readonly');
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => {
        const row = req.result as { key: string; value: T } | undefined;
        resolve(row ? row.value : null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function writeMetaValue<T>(db: IDBDatabase, key: string, value: T): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, 'readwrite');
      tx.objectStore(STORE_META).put({ key, value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function putItem<T extends { id: string }>(
  db: IDBDatabase,
  storeName: string,
  item: T
): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function deleteItem(db: IDBDatabase, storeName: string, id: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function readLegacyArray<T>(keys: string[]): T[] | null {
  try {
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed as T[];
      }
    }
  } catch {
    // ignore
  }
  return null;
}

function readLegacyString(keys: string[]): string | null {
  try {
    for (const k of keys) {
      const val = localStorage.getItem(k);
      if (val) return val;
    }
  } catch {
    // ignore
  }
  return null;
}

export async function loadGuestWorkspace(): Promise<GuestWorkspaceSnapshot> {
  const db = await openGuestDb();
  if (!db) {
    return {
      projects: [...memoryFallback.projects],
      characters: [...memoryFallback.characters],
      creations: [...memoryFallback.creations],
      activeProjectId: memoryFallback.activeProjectId,
      showBible: { ...memoryFallback.showBible },
    };
  }

  try {
    const initialized = await readMetaValue<boolean>(db, 'initialized_v1');
    if (!initialized) {
      const initialProjects =
        readLegacyArray<VideoProject>(LEGACY_STORAGE_KEYS.projects) ?? SEED_PROJECTS;
      const initialChars =
        readLegacyArray<CharacterProfile>(LEGACY_STORAGE_KEYS.characters) ?? SEED_CHARACTERS;
      const initialActiveId =
        readLegacyString(LEGACY_STORAGE_KEYS.activeProject) ?? initialProjects[0]?.id ?? SEED_PROJECTS[0].id;

      await Promise.all([
        ...initialProjects.map((p) => putItem(db, STORE_PROJECTS, p)),
        ...initialChars.map((c) => putItem(db, STORE_CHARACTERS, c)),
        writeMetaValue(db, 'activeProjectId', initialActiveId),
        writeMetaValue(db, 'initialized_v1', true),
      ]);
    }

    const [projects, characters, creations, activeId, storedShowBible] = await Promise.all([
      readAllFromStore<VideoProject>(db, STORE_PROJECTS),
      readAllFromStore<CharacterProfile>(db, STORE_CHARACTERS),
      readAllFromStore<StudioCreation>(db, STORE_CREATIONS),
      readMetaValue<string>(db, 'activeProjectId'),
      readMetaValue<ShowBible>(db, 'showBible'),
    ]);

    const sortedProjects = (projects.length > 0 ? projects : SEED_PROJECTS).sort((a, b) =>
      (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
    );
    const finalChars = characters.length > 0 ? characters : SEED_CHARACTERS;
    const sortedCreations = creations.sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || '')
    );

    return {
      projects: sortedProjects,
      characters: finalChars,
      creations: sortedCreations,
      activeProjectId: activeId || sortedProjects[0].id,
      showBible: storedShowBible ?? { ...DEFAULT_SHOW_BIBLE },
    };
  } finally {
    db.close();
  }
}

export async function saveGuestProject(project: VideoProject): Promise<void> {
  memoryFallback.projects = [
    project,
    ...memoryFallback.projects.filter((p) => p.id !== project.id),
  ];
  const db = await openGuestDb();
  if (!db) return;
  try {
    await putItem(db, STORE_PROJECTS, project);
  } finally {
    db.close();
  }
}

export async function deleteGuestProject(projectId: string): Promise<void> {
  memoryFallback.projects = memoryFallback.projects.filter((p) => p.id !== projectId);
  const db = await openGuestDb();
  if (!db) return;
  try {
    await deleteItem(db, STORE_PROJECTS, projectId);
  } finally {
    db.close();
  }
}

export async function saveGuestCharacter(character: CharacterProfile): Promise<void> {
  memoryFallback.characters = [
    character,
    ...memoryFallback.characters.filter((c) => c.id !== character.id),
  ];
  const db = await openGuestDb();
  if (!db) return;
  try {
    await putItem(db, STORE_CHARACTERS, character);
  } finally {
    db.close();
  }
}

export async function deleteGuestCharacter(characterId: string): Promise<void> {
  memoryFallback.characters = memoryFallback.characters.filter((c) => c.id !== characterId);
  const db = await openGuestDb();
  if (!db) return;
  try {
    await deleteItem(db, STORE_CHARACTERS, characterId);
  } finally {
    db.close();
  }
}

export async function saveGuestCreation(creation: StudioCreation): Promise<void> {
  memoryFallback.creations = [
    creation,
    ...memoryFallback.creations.filter((c) => c.id !== creation.id),
  ];
  const db = await openGuestDb();
  if (!db) return;
  try {
    await putItem(db, STORE_CREATIONS, creation);
  } finally {
    db.close();
  }
}

export async function deleteGuestCreation(creationId: string): Promise<void> {
  memoryFallback.creations = memoryFallback.creations.filter((c) => c.id !== creationId);
  const db = await openGuestDb();
  if (!db) return;
  try {
    await deleteItem(db, STORE_CREATIONS, creationId);
  } finally {
    db.close();
  }
}

export async function saveGuestActiveProjectId(projectId: string): Promise<void> {
  memoryFallback.activeProjectId = projectId;
  const db = await openGuestDb();
  if (!db) return;
  try {
    await writeMetaValue(db, 'activeProjectId', projectId);
  } finally {
    db.close();
  }
}

export async function saveGuestShowBible(showBible: ShowBible): Promise<void> {
  memoryFallback.showBible = showBible;
  const db = await openGuestDb();
  if (!db) return;
  try {
    await writeMetaValue(db, 'showBible', showBible);
  } finally {
    db.close();
  }
}
