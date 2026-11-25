import type { CharacterProfile, ShowBible, VideoProject } from '../types/studio';

export interface AhiProjectBundle {
  format: 'ahi-project';
  version: 1;
  app: 'A.H.I';
  exportedAt: string;
  project: VideoProject;
  castCharacters: CharacterProfile[];
}

export interface AhiWorkspaceBackup {
  format: 'ahi-workspace';
  version: 1;
  app: 'A.H.I';
  exportedAt: string;
  projects: VideoProject[];
  characters: CharacterProfile[];
  showBible?: ShowBible;
}

export function exportProjectAsAhiFile(
  project: VideoProject,
  allCharacters: CharacterProfile[]
): void {
  const castCharacters = allCharacters.filter((c) => project.characterIds.includes(c.id));
  const bundle: AhiProjectBundle = {
    format: 'ahi-project',
    version: 1,
    app: 'A.H.I',
    exportedAt: new Date().toISOString(),
    project,
    castCharacters,
  };

  const slug =
    project.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled-project';

  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.ahi`;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAllProjectsAsAhiFile(
  projects: VideoProject[],
  allCharacters: CharacterProfile[],
  showBible?: ShowBible
): void {
  const backup: AhiWorkspaceBackup = {
    format: 'ahi-workspace',
    version: 1,
    app: 'A.H.I',
    exportedAt: new Date().toISOString(),
    projects,
    characters: allCharacters,
    ...(showBible ? { showBible } : {}),
  };

  const dateTag = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ahi-projects-backup-${dateTag}.ahi`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function parseAhiProjectFile(file: File): Promise<{
  project: VideoProject;
  castCharacters: CharacterProfile[];
}> {
  const text = await file.text();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('This file is not valid JSON. Please choose a valid .ahi project file.');
  }

  if (!raw || typeof raw !== 'object') {
    throw new Error('Unrecognized .ahi project structure.');
  }

  const record = raw as Record<string, unknown>;
  let projectCandidate: unknown = record;
  let castCharacters: CharacterProfile[] = [];

  if (record.format === 'ahi-project' && record.project && typeof record.project === 'object') {
    projectCandidate = record.project;
    if (Array.isArray(record.castCharacters)) {
      castCharacters = record.castCharacters as CharacterProfile[];
    }
  } else if (
    record.format === 'ahi-workspace' &&
    Array.isArray(record.projects) &&
    record.projects.length > 0
  ) {
    projectCandidate = record.projects[0];
    if (Array.isArray(record.characters)) {
      castCharacters = record.characters as CharacterProfile[];
    }
  }

  const proj = projectCandidate as Partial<VideoProject>;
  if (
    typeof proj.title !== 'string' ||
    !Array.isArray(proj.scenes) ||
    proj.scenes.length === 0
  ) {
    throw new Error('Invalid .ahi project: missing project title or scene timeline.');
  }

  const now = new Date().toISOString();
  const normalizedProject: VideoProject = {
    id: typeof proj.id === 'string' && proj.id ? proj.id : `proj-ahi-${Date.now()}`,
    title: proj.title,
    logline: typeof proj.logline === 'string' ? proj.logline : '',
    storyIdea: typeof proj.storyIdea === 'string' ? proj.storyIdea : '',
    style: proj.style ?? 'Cinematic Film',
    aspectRatio: proj.aspectRatio ?? '16:9',
    styleNotes: typeof proj.styleNotes === 'string' ? proj.styleNotes : '',
    suggestedMusicMood:
      typeof proj.suggestedMusicMood === 'string' ? proj.suggestedMusicMood : 'Cinematic · 96 BPM',
    selectedMusicId:
      typeof proj.selectedMusicId === 'string' ? proj.selectedMusicId : 'track-workshop-marimba',
    characterIds: Array.isArray(proj.characterIds) ? proj.characterIds : [],
    scenes: proj.scenes.map((sc, idx) => ({
      ...sc,
      id: sc.id || `sc-ahi-${Date.now()}-${idx}`,
      sceneNumber: Number(sc.sceneNumber) || idx + 1,
      title: sc.title || `Scene ${idx + 1}`,
      durationSeconds: Math.max(2, Number(sc.durationSeconds) || 8),
      cameraAngle: sc.cameraAngle || 'Medium Shot',
      cameraMotion: sc.cameraMotion ?? 'Zoom In',
      lightingMood: sc.lightingMood || 'Balanced studio light',
      actionDescription: sc.actionDescription || '',
      visualPrompt: sc.visualPrompt || '',
      narration: sc.narration || '',
      dialogueLines: Array.isArray(sc.dialogueLines) ? sc.dialogueLines : [],
      sfxCue: sc.sfxCue || '',
      transition: sc.transition || 'Cut',
    })),
    thumbnailUrl: proj.thumbnailUrl,
    createdAt: typeof proj.createdAt === 'string' ? proj.createdAt : now,
    updatedAt: now,
  };

  return {
    project: normalizedProject,
    castCharacters,
  };
}
