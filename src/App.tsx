import { useCallback, useEffect, useState } from 'react';
import { LogIn } from 'lucide-react';
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
import { auth } from './firebase';
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
  syncGuestItemsToCloud,
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
  deleteGuestCharacter,
  deleteGuestCreation,
  deleteGuestProject,
  loadGuestWorkspace,
  saveGuestActiveProjectId,
  saveGuestCharacter,
  saveGuestCreation,
  saveGuestProject,
  saveGuestShowBible,
} from './utils/guestIndexedDb';
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

  // Firebase Auth & Workspace State
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [guestWorkspaceReady, setGuestWorkspaceReady] = useState(false);
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
    setSplashFadingOut(true);
    window.setTimeout(() => {
      setSplashVisible(false);
    }, 320);
  }, []);

  // Load IndexedDB Guest Workspace immediately so visitors can create before signing in
  const refreshFromGuestIndexedDb = useCallback(async () => {
    try {
      const snap = await loadGuestWorkspace();
      setProjects(snap.projects);
      setCharacters(snap.characters);
      setCreations(snap.creations);
      setShowBible(snap.showBible);
      setActiveProjectId(snap.activeProjectId);
    } finally {
      setGuestWorkspaceReady(true);
    }
  }, []);

  useEffect(() => {
    void refreshFromGuestIndexedDb();
  }, [refreshFromGuestIndexedDb]);

  // Smooth fade-out once auth & initial workspace state settle
  useEffect(() => {
    if (!authReady || !guestWorkspaceReady || !minSplashDone || splashFadingOut) return;
    setSplashFadingOut(true);
    const hideTimer = window.setTimeout(() => {
      setSplashVisible(false);
    }, 480);
    return () => window.clearTimeout(hideTimer);
  }, [authReady, guestWorkspaceReady, minSplashDone, splashFadingOut]);

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      setAuthReady(true);
      if (!user) {
        setCloudDisplayName(loadStudioPreferences().guestDisplayName || 'Creator');
        void refreshFromGuestIndexedDb();
      } else {
        setCloudDisplayName(
          user.displayName?.trim() || user.email?.split('@')[0] || 'Creator'
        );
      }
    });
    return () => unsub();
  }, [refreshFromGuestIndexedDb]);

  const workspaceMode: 'cloud' | 'guest-unverified' | 'guest' = authUser
    ? authUser.emailVerified
      ? 'cloud'
      : 'guest-unverified'
    : 'guest';

  // Attach Firestore workspace listeners only when auth is ready, signed in, and email-verified
  useEffect(() => {
    if (!authReady || !authUser || !authUser.emailVerified) return;

    let cancelled = false;
    let unsubCloud: (() => void) | null = null;

    void (async () => {
      try {
        const profile = await ensureUserWorkspaceProfile(authUser);
        if (cancelled) return;
        setCloudDisplayName(profile.displayName);

        unsubCloud = subscribeToCloudWorkspace(authUser.uid, {
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
      } catch (err) {
        if (!cancelled) {
          setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubCloud?.();
    };
  }, [authReady, authUser, authUser?.emailVerified]);

  const handleUpdatePreferences = (next: StudioPreferences) => {
    setStudioPrefs(next);
    saveStudioPreferences(next);
  };

  const activeProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? SEED_PROJECTS[0];

  const handleSelectActiveProject = (projectId: string) => {
    setActiveProjectId(projectId);
    void saveGuestActiveProjectId(projectId);
  };

  const handleUpdateProject = (updated: VideoProject) => {
    const stamped = { ...updated, updatedAt: new Date().toISOString() };
    setProjects((prev) => prev.map((p) => (p.id === stamped.id ? stamped : p)));
    void saveGuestProject(stamped);
    if (workspaceMode === 'cloud' && authUser) {
      void saveCloudProject(authUser.uid, stamped, true).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleCreateProject = (newProj: VideoProject) => {
    setProjects((prev) => [newProj, ...prev]);
    handleSelectActiveProject(newProj.id);
    void saveGuestProject(newProj);
    if (workspaceMode === 'cloud' && authUser) {
      void saveCloudProject(authUser.uid, newProj, false).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
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
    void deleteGuestProject(projectId);
    if (workspaceMode === 'cloud' && authUser) {
      void deleteCloudProject(authUser.uid, projectId).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleAddCharacter = (char: CharacterProfile) => {
    setCharacters((prev) => [char, ...prev]);
    void saveGuestCharacter(char);
    if (workspaceMode === 'cloud' && authUser) {
      void saveCloudCharacter(authUser.uid, char, false).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleUpdateCharacter = (updatedChar: CharacterProfile) => {
    setCharacters((prev) => prev.map((c) => (c.id === updatedChar.id ? updatedChar : c)));
    void saveGuestCharacter(updatedChar);
    if (workspaceMode === 'cloud' && authUser) {
      void saveCloudCharacter(authUser.uid, updatedChar, true).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleUpdateShowBible = (nextBible: ShowBible) => {
    const stamped = { ...nextBible, updatedAt: new Date().toISOString() };
    setShowBible(stamped);
    void saveGuestShowBible(stamped);
    if (workspaceMode === 'cloud' && authUser) {
      void saveCloudShowBible(authUser.uid, stamped).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleDeleteCharacter = (charId: string) => {
    setCharacters((prev) => prev.filter((c) => c.id !== charId));
    void deleteGuestCharacter(charId);
    if (workspaceMode === 'cloud' && authUser) {
      void deleteCloudCharacter(authUser.uid, charId).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleSaveCreation = (creation: StudioCreation) => {
    setCreations((prev) => [creation, ...prev]);
    void saveGuestCreation(creation);
    if (workspaceMode === 'cloud' && authUser) {
      void saveCloudCreation(authUser.uid, creation).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
      });
    }
  };

  const handleDeleteCreation = (creationId: string) => {
    setCreations((prev) => prev.filter((c) => c.id !== creationId));
    void deleteGuestCreation(creationId);
    if (workspaceMode === 'cloud' && authUser) {
      void deleteCloudCreation(authUser.uid, creationId).catch((err) => {
        setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
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
    if (authUser) {
      try {
        await signOut(auth);
        setNotice({
          type: 'success',
          text: 'Signed out cleanly. Guest Mode local storage remains active.',
        });
      } catch (err) {
        setNotice({
          type: 'error',
          text: err instanceof Error ? err.message : 'Could not sign out.',
        });
      }
    } else {
      setProfileModalOpen(true);
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
      void saveGuestProject(imported);
      if (workspaceMode === 'cloud' && authUser) {
        void saveCloudProject(authUser.uid, imported, existsLocally).catch((err) => {
          setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
        });
      }

      if (castCharacters.length > 0) {
        const existingIds = new Set(characters.map((c) => c.id));
        const additions = castCharacters.filter((c) => !existingIds.has(c.id));
        if (additions.length > 0) {
          setCharacters((prev) => [...additions, ...prev]);
          for (const char of additions) {
            void saveGuestCharacter(char);
            if (workspaceMode === 'cloud' && authUser) {
              void saveCloudCharacter(authUser.uid, char, false).catch((err) => {
                setFatalWorkspaceError(err instanceof Error ? err : new Error(String(err)));
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

  const handleRefreshVerification = async () => {
    if (!auth.currentUser) return;
    await auth.currentUser.reload();
    await auth.currentUser.getIdToken(true);
    setAuthUser(auth.currentUser);
  };

  const handleSyncGuestToCloud = async () => {
    if (!authUser || !authUser.emailVerified) return;
    const snap = await loadGuestWorkspace();
    const { syncedCount } = await syncGuestItemsToCloud(
      authUser.uid,
      snap.projects,
      snap.characters,
      snap.creations
    );
    setNotice({
      type: 'success',
      text:
        syncedCount > 0
          ? `Synced ${syncedCount} local item${syncedCount > 1 ? 's' : ''} to your cloud workspace.`
          : 'Your cloud workspace is already up to date.',
    });
  };

  const handleUpdateDisplayName = async (nextName: string) => {
    const clean = nextName.trim() || 'Creator';
    if (!authUser) {
      const updatedPrefs = { ...studioPrefs, guestDisplayName: clean };
      handleUpdatePreferences(updatedPrefs);
      setCloudDisplayName(clean);
      return;
    }
    await updateProfile(authUser, { displayName: clean });
    if (authUser.emailVerified) {
      await updateUserWorkspaceDisplayName(authUser.uid, clean, authUser.photoURL || '');
    }
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
    const snap = await loadGuestWorkspace();
    const mergedProjectsMap = new Map<string, VideoProject>();
    for (const p of snap.projects) mergedProjectsMap.set(p.id, p);
    for (const p of projects) mergedProjectsMap.set(p.id, p);

    const mergedCharsMap = new Map<string, CharacterProfile>();
    for (const c of snap.characters) mergedCharsMap.set(c.id, c);
    for (const c of characters) mergedCharsMap.set(c.id, c);

    const allProjects = Array.from(mergedProjectsMap.values());
    const allChars = Array.from(mergedCharsMap.values());
    exportAllProjectsAsAhiFile(allProjects, allChars, showBible);
    setNotice({
      type: 'success',
      text: `Downloaded backup of ${allProjects.length} project${allProjects.length === 1 ? '' : 's'} (.ahi file).`,
    });
    return allProjects.length;
  };

  const handleDeleteAccount = async (): Promise<void> => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No signed-in account found.');
    }
    if (currentUser.emailVerified) {
      await deleteCloudWorkspace(currentUser.uid);
    }
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
    setNotice({
      type: 'success',
      text: 'Your account and saved cloud projects have been permanently deleted.',
    });
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
        visible={splashVisible}
        fadingOut={splashFadingOut}
        onSkip={handleSkipSplash}
        statusLabel={
          !authReady
            ? 'Initializing A.H.I Studio...'
            : authUser?.emailVerified
            ? 'Syncing cloud workspace...'
            : 'Preparing your studio workspace...'
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

      {/* Interactive Curved Frosted-Glass Sidebar */}
      <CurvedFrostedSidebar
        activeSection={activeSection}
        authUser={authUser}
        displayName={cloudDisplayName || studioPrefs.guestDisplayName || 'Creator'}
        turboLive={false}
        onSelectSection={handleSelectSidebarSection}
        onOpenProfile={() => setProfileModalOpen(true)}
        onOpenSettings={() => setSettingsModalOpen(true)}
        onLogout={() => void handleLogoutOrAccount()}
        onExpandedChange={setSidebarExpanded}
      />

      {/* Subtle Top-Right Sign In Pill for Guests */}
      {!authUser && (
        <button
          type="button"
          onClick={() => setProfileModalOpen(true)}
          className="fixed top-4 right-4 sm:right-6 z-30 inline-flex items-center gap-2 px-4 py-2 rounded-full backdrop-blur-2xl bg-[rgba(17,22,33,0.72)] hover:bg-white/[0.09] border border-white/15 hover:border-[#2DD4BF]/55 text-xs font-semibold text-[#F8FAFC] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_12px_32px_rgba(0,0,0,0.45)] hover:shadow-[0_0_22px_rgba(45,212,191,0.22)] transition-all cursor-pointer"
        >
          <LogIn className="w-3.5 h-3.5 text-[#2DD4BF]" />
          <span>Sign In</span>
        </button>
      )}

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
        displayName={cloudDisplayName || studioPrefs.guestDisplayName || 'Creator'}
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
        workspaceMode={workspaceMode}
        displayName={cloudDisplayName || studioPrefs.guestDisplayName || 'Creator'}
        projectCount={projects.length}
        characterCount={characters.length}
        creationCount={creations.length}
        onClose={() => setProfileModalOpen(false)}
        onRefreshVerification={handleRefreshVerification}
        onSyncGuestToCloud={handleSyncGuestToCloud}
        onUpdateDisplayName={handleUpdateDisplayName}
        onExportBackup={() => handleExportAhiProject(activeProject.id)}
        onImportBackup={(file) => void handleImportAhiFile(file)}
      />
    </div>
  );
}
