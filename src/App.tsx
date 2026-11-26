import { useCallback, useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from './hooks/usePWAInstall';
import {
  deleteUser,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  type User as FirebaseUser,
} from 'firebase/auth';
import { AhiSplashScreen } from './components/AhiLoaders';
import {
  CurvedFrostedSidebar,
  type SidebarSectionId,
} from './components/CurvedFrostedSidebar';
import { AccountSettingsModal } from './components/InfoAndTurboModal';
import { ProfileModal } from './components/ProfileModal';
import { DEFAULT_SHOW_BIBLE, SEED_CHARACTERS, SEED_PROJECTS } from './data/seedData';
import { auth, isFirestoreOfflineError } from './firebase';
import {
  deleteCloudCharacter,
  deleteCloudCreation,
  deleteCloudProject,
  deleteCloudWorkspace,
  ensureUserWorkspaceProfile,
  saveCloudCharacter,
  saveCloudCreation,
  saveCloudProject,
  saveCloudShowBible,
  subscribeToCloudWorkspace,
  updateUserWorkspaceDisplayName,
} from './services/workspaceStorage';
import type {
  CharacterProfile,
  GeminiVoiceName,
  ShowBible,
  StudioCreation,
  VideoProject,
  VoiceClip,
} from './types/studio';
import {
  exportAllProjectsAsAhiFile,
  exportProjectAsAhiFile,
  parseAhiProjectFile,
} from './utils/ahiProjectFile';
import {
  loadStudioPreferences,
  saveStudioPreferences,
  type StudioPreferences,
} from './utils/studioPreferences';
import { SimpleCharactersView } from './views/SimpleCharactersView';
import { type CreatePresetPayload, SimpleCreateView } from './views/SimpleCreateView';
import { SimpleProjectsView } from './views/SimpleProjectsView';
import { StoryEpisodesView } from './views/StoryEpisodesView';
import { VoiceMusicStudioView } from './views/VoiceMusicStudioView';

export default function App() {
  const [activeSection, setActiveSection] = useState<SidebarSectionId>('create');
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [storyInitialStep, setStoryInitialStep] = useState<1 | 2 | 3>(1);

  const [projects, setProjects] = useState<VideoProject[]>(SEED_PROJECTS);
  const [characters, setCharacters] = useState<CharacterProfile[]>(SEED_CHARACTERS);
  const [creations, setCreations] = useState<StudioCreation[]>([]);
  const [showBible, setShowBible] = useState<ShowBible>(DEFAULT_SHOW_BIBLE);
  const [voiceClips, setVoiceClips] = useState<VoiceClip[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(SEED_PROJECTS[0].id);

  const [studioPrefs, setStudioPrefs] = useState<StudioPreferences>(() => loadStudioPreferences());
  const isOnline = useOnlineStatus();

  // Firebase Auth & Cloud Workspace State
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [minSplashDone, setMinSplashDone] = useState(() => !studioPrefs.playStartupIntro);
  const [splashVisible, setSplashVisible] = useState(() => studioPrefs.playStartupIntro);
  const [splashFadingOut, setSplashFadingOut] = useState(false);
  const [cloudDisplayName, setCloudDisplayName] = useState<string>('');
  const [fatalWorkspaceError, setFatalWorkspaceError] = useState<Error | null>(null);

  const [preselectedCharacter, setPreselectedCharacter] = useState<CharacterProfile | null>(null);
  const [pendingCreatePreset, setPendingCreatePreset] = useState<CreatePresetPayload | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [settingsModalOpen, setSettingsModalOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  if (fatalWorkspaceError) {
    throw fatalWorkspaceError;
  }

  useEffect(() => {
    if (!studioPrefs.playStartupIntro) {
      setMinSplashDone(true);
      return;
    }
    const t = window.setTimeout(() => setMinSplashDone(true), 2150);
    return () => window.clearTimeout(t);
  }, [studioPrefs.playStartupIntro]);

  const handleSkipSplash = useCallback(() => {
    setMinSplashDone(true);
    if (!authReady) return;
    setSplashFadingOut(true);
    window.setTimeout(() => {
      setSplashVisible(false);
    }, 320);
  }, [authReady]);

  // Smooth fade-out once Firebase Auth & startup animation settle
  useEffect(() => {
    if (!authReady || !minSplashDone || splashFadingOut) return;
    setSplashFadingOut(true);
    const hideTimer = window.setTimeout(() => {
      setSplashVisible(false);
    }, 480);
    return () => window.clearTimeout(hideTimer);
  }, [authReady, minSplashDone, splashFadingOut]);

  // Strict Auth Listener: reject anonymous sessions and reset state when signed out
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user && user.isAnonymous) {
        void signOut(auth).catch(() => undefined);
        setAuthUser(null);
        setAuthReady(true);
        return;
      }

      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setProjects(SEED_PROJECTS);
        setCharacters(SEED_CHARACTERS);
        setCreations([]);
        setShowBible(DEFAULT_SHOW_BIBLE);
        setVoiceClips([]);
        setActiveProjectId(SEED_PROJECTS[0].id);
        setCloudDisplayName('');
        setSettingsModalOpen(false);
        setProfileModalOpen(false);
        setFatalWorkspaceError(null);
      } else {
        setCloudDisplayName(
          user.displayName?.trim() || user.email?.split('@')[0] || 'Creator'
        );
      }
    });
    return () => unsub();
  }, []);

  const handleCloudSyncError = useCallback((err: unknown) => {
    if (isFirestoreOfflineError(err)) {
      setNotice({
        type: 'error',
        text: 'Cloud sync is temporarily offline. Changes stay available locally and will sync when reconnected.',
      });
      return;
    }
    setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
  }, []);

  // Immediate Cloud Sync: attach private Firestore listeners as soon as user is signed in
  useEffect(() => {
    if (!authReady || !authUser) return;

    let cancelled = false;
    const unsubCloud = subscribeToCloudWorkspace(authUser.uid, {
      onProjects: (cloudProjects) => {
        if (cancelled) return;
        if (cloudProjects.length > 0) {
          setProjects(cloudProjects);
          setActiveProjectId((curr) =>
            cloudProjects.some((p) => p.id === curr) ? curr : cloudProjects[0].id
          );
        }
      },
      onCharacters: (cloudChars) => {
        if (cancelled) return;
        if (cloudChars.length > 0) {
          setCharacters(cloudChars);
        }
      },
      onCreations: (cloudCreations) => {
        if (cancelled) return;
        setCreations(cloudCreations);
      },
      onShowBible: (cloudBible) => {
        if (cancelled || !cloudBible) return;
        setShowBible(cloudBible);
      },
    });

    void ensureUserWorkspaceProfile(authUser)
      .then((profile) => {
        if (!cancelled) {
          setCloudDisplayName(profile.displayName);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          handleCloudSyncError(err);
        }
      });

    return () => {
      cancelled = true;
      unsubCloud();
    };
  }, [authReady, authUser, handleCloudSyncError]);

  const handleUpdatePreferences = (next: StudioPreferences) => {
    setStudioPrefs(next);
    saveStudioPreferences(next);
  };

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? SEED_PROJECTS[0];

  const handleSelectActiveProject = (projectId: string) => {
    setActiveProjectId(projectId);
  };

  const handleUpdateProject = (updated: VideoProject) => {
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    setProjects((prev) => prev.map((p) => (p.id === stamped.id ? stamped : p)));
    if (authUser) {
      void saveCloudProject(authUser.uid, stamped, true).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleCreateProject = (newProj: VideoProject) => {
    setProjects((prev) => [newProj, ...prev]);
    handleSelectActiveProject(newProj.id);
    if (authUser) {
      void saveCloudProject(authUser.uid, newProj, false).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleDeleteProject = (projectId: string) => {
    if (projects.length <= 1) return;
    const remaining = projects.filter((p) => p.id !== projectId);
    setProjects(remaining);
    if (activeProjectId === projectId && remaining[0]) {
      handleSelectActiveProject(remaining[0].id);
    }
    if (authUser) {
      void deleteCloudProject(authUser.uid, projectId).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleAddCharacter = (char: CharacterProfile) => {
    setCharacters((prev) => [char, ...prev]);
    if (authUser) {
      void saveCloudCharacter(authUser.uid, char, false).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleUpdateCharacter = (updatedChar: CharacterProfile) => {
    setCharacters((prev) => prev.map((c) => (c.id === updatedChar.id ? updatedChar : c)));
    if (authUser) {
      void saveCloudCharacter(authUser.uid, updatedChar, true).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleUpdateShowBible = (nextBible: ShowBible) => {
    const stamped = { ...nextBible, updatedAt: new Date().toISOString() };
    setShowBible(stamped);
    if (authUser) {
      void saveCloudShowBible(authUser.uid, stamped).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleDeleteCharacter = (charId: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== charId));
    if (authUser) {
      void deleteCloudCharacter(authUser.uid, charId).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleSaveCreation = (creation: StudioCreation) => {
    setCreations((prev) => [creation, ...prev]);
    if (authUser) {
      void saveCloudCreation(authUser.uid, creation).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleDeleteCreation = (creationId: string) => {
    setCreations((prev) => prev.filter((c) => c.id !== creationId));
    if (authUser) {
      void deleteCloudCreation(authUser.uid, creationId).catch((err) => {
        handleCloudSyncError(err);
      });
    }
  };

  const handleAttachVoiceToScene = (
    sceneId: string,
    audioBase64: string,
    voiceName: GeminiVoiceName
  ) => {
    handleUpdateProject({
      ...activeProject,
      scenes: activeProject.scenes.map((sc) =>
        sc.id === sceneId ? { ...sc, voiceAudioBase64: audioBase64, voiceName } : sc
      ),
    });
  };

  const handleAddClipToEpisode = (clip: {
    videoUrl: string;
    prompt: string;
    dialogue?: string;
  }) => {
    const nextNumber = activeProject.scenes.length + 1;
    handleUpdateProject({
      ...activeProject,
      scenes: [
        ...activeProject.scenes,
        {
          id: `sc-talk-${Date.now()}`,
          sceneNumber: nextNumber,
          title: clip.dialogue ? 'Talking Scene' : `Scene ${nextNumber}`,
          durationSeconds: 8,
          cameraAngle: 'Medium Close-Up',
          cameraMotion: 'Zoom In',
          lightingMood: 'Cinematic',
          actionDescription: clip.prompt,
          visualPrompt: clip.prompt,
          narration: clip.dialogue ?? '',
          dialogueLines: [],
          sfxCue: '',
          transition: 'Cut',
          generatedVideoUrl: clip.videoUrl,
          generatedVideoMode: 'lipsync',
        },
      ],
    });
    setStoryInitialStep(2);
    setActiveSection('story');
    setNotice({
      type: 'success',
      text: `Added clip as Scene ${nextNumber} in "${activeProject.title}".`,
    });
  };

  const handleSelectSidebarSection = (section: SidebarSectionId) => {
    setActiveSection(section);
    if (section === 'story') {
      setStoryInitialStep(1);
    } else if (section === 'text-to-image') {
      setPendingCreatePreset({ mode: 'image', openAttachPicker: false });
    } else if (section === 'text-to-video') {
      setPendingCreatePreset({ mode: 'video', openAttachPicker: false });
    } else if (section === 'image-to-video') {
      setPendingCreatePreset({ mode: 'video', openAttachPicker: true });
    }
  };

  const handleLogoutOrAccount = async () => {
    if (!authUser) return;
    try {
      await signOut(auth);
      setNotice(null);
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not sign out.',
      });
    }
  };

  const handleExportAhiProject = (projectId?: string) => {
    const target =
      projects.find((p) => p.id === (projectId ?? activeProject.id)) ?? activeProject;
    exportProjectAsAhiFile(target, characters);
    setNotice({
      type: 'success',
      text: `Saved "${target.title}" backup (.ahi file).`,
    });
  };

  const handleImportAhiFile = async (file: File) => {
    try {
      const { project: imported, castCharacters } = await parseAhiProjectFile(file);
      const existsLocally = projects.some((p) => p.id === imported.id);
      setProjects((prev) =>
        existsLocally
          ? prev.map((p) => (p.id === imported.id ? imported : p))
          : [imported, ...prev]
      );
      if (authUser) {
        void saveCloudProject(authUser.uid, imported, existsLocally).catch((err) => {
          handleCloudSyncError(err);
        });
      }

      if (castCharacters.length > 0) {
        const existingIds = new Set(characters.map((c) => c.id));
        const additions = castCharacters.filter((c) => !existingIds.has(c.id));
        if (additions.length > 0) {
          setCharacters((prev) => [...additions, ...prev]);
          for (const char of additions) {
            if (authUser) {
              void saveCloudCharacter(authUser.uid, char, false).catch((err) => {
                handleCloudSyncError(err);
              });
            }
          }
        }
      }

      handleSelectActiveProject(imported.id);
      setStoryInitialStep(2);
      setActiveSection('story');
      setNotice({
        type: 'success',
        text: `Loaded "${imported.title}" (${imported.scenes.length} scenes).`,
      });
    } catch (err) {
      setNotice({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not load project file.',
      });
    }
  };

  const handleUpdateDisplayName = async (nextName: string) => {
    const clean = nextName.trim() || 'Creator';
    if (!authUser) return;
    await updateProfile(authUser, { displayName: clean });
    await updateUserWorkspaceDisplayName(authUser.uid, clean, authUser.photoURL || '');
    setCloudDisplayName(clean);
  };

  const handleSendPasswordReset = async (): Promise<string> => {
    if (!authUser?.email) {
      throw new Error('No email address is associated with this session.');
    }
    await sendPasswordResetEmail(auth, authUser.email);
    return authUser.email;
  };

  const handleDownloadAllProjects = async (): Promise<number> => {
    exportAllProjectsAsAhiFile(projects, characters, showBible);
    setNotice({
      type: 'success',
      text: `Downloaded backup of ${projects.length} project${projects.length === 1 ? '' : 's'} (.ahi file).`,
    });
    return projects.length;
  };

  const handleDeleteAccount = async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No signed-in account found.');
    }
    await deleteCloudWorkspace(currentUser.uid);
    try {
      await deleteUser(currentUser);
    } catch (err) {
      const code =
        typeof err === 'object' && err !== null && 'code' in err
          ? String((err as { code?: string }).code)
          : '';
      if (code === 'auth/requires-recent-login') {
        throw new Error(
          'For security, please sign out, sign back in, and try deleting your account again.'
        );
      }
      throw err;
    }
    try {
      await signOut(auth);
    } catch {
      // deleteUser already clears the session in most browsers
    }
  };

  const isCreateFamily =
    activeSection === 'create' ||
    activeSection === 'text-to-image' ||
    activeSection === 'text-to-video' ||
    activeSection === 'image-to-video';

  return (
    <div className="min-h-screen bg-[#07090E] text-[#F8FAFC] flex relative overflow-x-hidden">
      {/* Matte-Obsidian & Mint-Cyan Calligraphic Signature Splash Screen */}
      <AhiSplashScreen
        visible={splashVisible || !authReady}
        fadingOut={authReady && splashFadingOut}
        onSkip={authReady ? handleSkipSplash : undefined}
        statusLabel={
          !authReady
            ? 'Checking studio session...'
            : authUser
            ? 'Syncing cloud workspace...'
            : 'Preparing studio sign-in...'
        }
      />

      {/* Subtle Ambient Electric Mint-Cyan Radial Glow Behind Center Workspace */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            'radial-gradient(ellipse 68% 54% at 54% 46%, rgba(45, 212, 191, 0.06), transparent 72%)',
        }}
      />

      {/* Strict Auth Gate: Show ONLY the Circular Frosted-Glass 3D Flip Login & Sign-Up Card when !authUser */}
      {authReady && !authUser && (
        <ProfileModal
          isOpen={true}
          authUser={null}
          displayName=""
          projectCount={0}
          characterCount={0}
          creationCount={0}
          onClose={() => undefined}
          onUpdateDisplayName={handleUpdateDisplayName}
          onExportBackup={() => undefined}
          onImportBackup={() => undefined}
        />
      )}

      {/* Unlocked Studio Workspace (Only mounted once authUser is signed in) */}
      {authReady && authUser && (
        <>
          {/* Interactive Curved Frosted-Glass Sidebar */}
          <CurvedFrostedSidebar
            activeSection={activeSection}
            authUser={authUser}
            displayName={cloudDisplayName || 'Creator'}
            turboLive={false}
            onSelectSection={handleSelectSidebarSection}
            onOpenProfile={() => setProfileModalOpen(true)}
            onOpenSettings={() => setSettingsModalOpen(true)}
            onLogout={() => void handleLogoutOrAccount()}
            onExpandedChange={setSidebarExpanded}
          />

          {/* Main Content Area Cleared Cleanly to the Right of the Curved Sidebar */}
          <main
            className={`relative z-10 flex-1 min-w-0 pr-4 sm:pr-8 pt-6 transition-[padding-left] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
              sidebarExpanded
                ? 'pl-[92px] sm:pl-[104px] md:pl-[292px]'
                : 'pl-[92px] sm:pl-[104px]'
            }`}
          >
            <div className="max-w-6xl mx-auto">
              {notice && (
                <div
                  className={`max-w-4xl mx-auto mb-5 rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3 border backdrop-blur-2xl shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] ${
                    notice.type === 'error'
                      ? 'bg-red-950/50 border-red-500/40 text-red-200'
                      : 'bg-[rgba(17,22,33,0.72)] border-[#2DD4BF]/35 text-[#F8FAFC]'
                  }`}
                >
                  <span>{notice.text}</span>
                  <button
                    type="button"
                    onClick={() => setNotice(null)}
                    className="text-[#94A3B8] hover:text-[#F8FAFC] cursor-pointer shrink-0"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              {isCreateFamily && (
                <SimpleCreateView
                  characters={characters}
                  creations={creations}
                  preselectedCharacter={preselectedCharacter}
                  onClearPreselectedCharacter={() => setPreselectedCharacter(null)}
                  pendingPreset={pendingCreatePreset}
                  onClearPendingPreset={() => setPendingCreatePreset(null)}
                  onSaveCreation={handleSaveCreation}
                  onAddClipToEpisode={handleAddClipToEpisode}
                  sidebarExpanded={sidebarExpanded}
                  defaultAspectRatio={studioPrefs.defaultAspectRatio}
                />
              )}

              {activeSection === 'story' && (
                <StoryEpisodesView
                  activeProject={activeProject}
                  projects={projects}
                  characters={characters}
                  showBible={showBible}
                  initialStep={storyInitialStep}
                  defaultAspectRatio={studioPrefs.defaultAspectRatio}
                  onUpdateProject={handleUpdateProject}
                  onCreateProject={handleCreateProject}
                  onSelectProject={handleSelectActiveProject}
                  onUpdateShowBible={handleUpdateShowBible}
                />
              )}

              {activeSection === 'characters' && (
                <SimpleCharactersView
                  characters={characters}
                  onAddCharacter={handleAddCharacter}
                  onUpdateCharacter={handleUpdateCharacter}
                  onDeleteCharacter={handleDeleteCharacter}
                  onUseInCreate={(char) => {
                    setPreselectedCharacter(char);
                    setActiveSection('create');
                  }}
                />
              )}

              {activeSection === 'voice' && (
                <div className="pb-16">
                  <VoiceMusicStudioView
                    activeProject={activeProject}
                    characters={characters}
                    voiceClips={voiceClips}
                    onAddVoiceClip={(clip) => setVoiceClips((prev) => [clip, ...prev])}
                    onAttachVoiceToScene={handleAttachVoiceToScene}
                    onUpdateProject={handleUpdateProject}
                  />
                </div>
              )}

              {activeSection === 'projects' && (
                <SimpleProjectsView
                  projects={projects}
                  creations={creations}
                  activeProjectId={activeProject.id}
                  onOpenStory={(projectId, step = 2) => {
                    handleSelectActiveProject(projectId);
                    setStoryInitialStep(step);
                    setActiveSection('story');
                  }}
                  onCreateNewStory={() => {
                    setStoryInitialStep(1);
                    setActiveSection('story');
                  }}
                  onDeleteProject={handleDeleteProject}
                  onExportAhiProject={handleExportAhiProject}
                  onImportAhiFile={(file) => void handleImportAhiFile(file)}
                  onOpenCreationInCreate={(creation) => {
                    setPendingCreatePreset({
                      prompt: creation.prompt,
                      mode: creation.mode,
                      style: creation.style,
                      aspectRatio: creation.aspectRatio,
                      resultUrl: creation.mediaUrl,
                    });
                    setActiveSection('create');
                  }}
                  onDeleteCreation={handleDeleteCreation}
                />
              )}
            </div>
          </main>

          <AccountSettingsModal
            isOpen={settingsModalOpen}
            authUser={authUser}
            displayName={cloudDisplayName || 'Creator'}
            preferences={studioPrefs}
            projectCount={projects.length}
            onClose={() => setSettingsModalOpen(false)}
            onUpdateDisplayName={handleUpdateDisplayName}
            onSendPasswordReset={handleSendPasswordReset}
            onUpdatePreferences={handleUpdatePreferences}
            onDownloadAllProjects={handleDownloadAllProjects}
            onDeleteAccount={handleDeleteAccount}
          />

          <ProfileModal
            isOpen={profileModalOpen}
            authUser={authUser}
            displayName={cloudDisplayName || 'Creator'}
            projectCount={projects.length}
            characterCount={characters.length}
            creationCount={creations.length}
            onClose={() => setProfileModalOpen(false)}
            onUpdateDisplayName={handleUpdateDisplayName}
            onExportBackup={() => handleExportAhiProject(activeProject.id)}
            onImportBackup={(file) => void handleImportAhiFile(file)}
          />
        </>
      )}

      {!isOnline && (
        <div
          role="status"
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-xl backdrop-blur-2xl bg-[rgba(17,22,33,0.9)] border border-amber-400/40 px-3.5 py-2 text-xs font-medium text-amber-200 shadow-[0_12px_32px_rgba(0,0,0,0.6)]"
        >
          <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Offline Mode — Cached shell active</span>
        </div>
      )}
    </div>
  );
}
