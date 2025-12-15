
import React, { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { TimelineManager } from './components/TimelineManager';
import { VideoAudioHub } from './components/VideoAudioHub';
import { SettingsPanel } from './components/SettingsPanel';
import { PatrickAssistant } from './components/PatrickAssistant';
import { telegramService } from './services/telegramService';
import { loadProjectFromIDB, saveProjectToIDB } from './services/storageService';
import { generateProjectPDF } from './services/pdfService';
import { generateProjectPPTX } from './services/pptxService';
import { generateDaVinciXML, generateEDL, generateDaVinciPythonScript } from './services/davinciService';
import { generateSRT } from './services/srtService';
import { hasValidKey, saveApiKey } from './services/geminiService';
import { INITIAL_PROJECT_STATE, THEME_PRESETS, MODEL_IMAGE_FLASH, INITIAL_VALERA_MESSAGES } from './constants';
import { ProjectData, AppSettings, TimelineFrame, Character, TimelineSettings, ChatMessage, LabAssetSuggestion, TimelineSuggestion, DirectorAction, GenerationLogEntry } from './types';
import { Clapperboard, Monitor, Settings as SettingsIcon, Film, Loader2, Download, Maximize, FileText, Presentation, Package, Captions, ListVideo, Code, Send, Bot, Key, ArrowRight, ExternalLink } from 'lucide-react';

const App: React.FC = () => {
  const [projectData, setProjectData] = useState<ProjectData>(INITIAL_PROJECT_STATE);
  const [settings, setSettings] = useState<AppSettings>({
    themeId: 'canvas-dark',
    fontFamily: "'Inter', sans-serif",
    imageModel: MODEL_IMAGE_FLASH,
    showAssistant: true,
    chatFontSize: 12
  });
  const [activeTab, setActiveTab] = useState<'studio' | 'hub' | 'settings'>('studio');
  const [isDriveConnected, setIsDriveConnected] = useState(false); // Mock state
  const [isLoading, setIsLoading] = useState(true);
  const [hasKey, setHasKey] = useState(false);
  const [inputKey, setInputKey] = useState('');
  const [notification, setNotification] = useState<{msg: string, type: 'info' | 'success'} | null>(null);
  const [isDirectorFullScreen, setIsDirectorFullScreen] = useState(false);

  // Init
  useEffect(() => {
    telegramService.init();
    
    // 1. Check API Key first
    if (!hasValidKey()) {
        setIsLoading(false); // Stop generic loading, show Auth Screen
        setHasKey(false);
        return;
    }
    
    setHasKey(true);

    // 2. Load Data if Key Exists
    loadProjectFromIDB().then(data => {
      if (data) {
          // RESTORE GREETING FIX: 
          const isDemoProject = data.timeline.length === 1 && data.timeline[0].title === "Demo Scene";
          const hasEmptyHistory = !data.directorHistory || data.directorHistory.length === 0;

          if (isDemoProject || hasEmptyHistory) {
              data.directorHistory = INITIAL_VALERA_MESSAGES;
          }
          setProjectData(data);
      } else {
          setProjectData(INITIAL_PROJECT_STATE);
      }
      
      setTimeout(() => {
          setIsLoading(false);
      }, 2000);
    });
  }, []);

  // Autosave
  useEffect(() => {
    if (!isLoading && hasKey) {
      saveProjectToIDB(projectData);
    }
  }, [projectData, isLoading, hasKey]);

  // Apply Theme
  useEffect(() => {
    const theme = THEME_PRESETS.find(t => t.id === settings.themeId) || THEME_PRESETS[0];
    const root = document.documentElement;
    root.style.setProperty('--bg-main', theme.colors.bgMain);
    root.style.setProperty('--bg-card', theme.colors.bgCard);
    root.style.setProperty('--bg-header', theme.colors.bgHeader);
    root.style.setProperty('--bg-input', theme.colors.bgInput);
    root.style.setProperty('--text-main', theme.colors.textMain);
    root.style.setProperty('--text-muted', theme.colors.textMuted);
    root.style.setProperty('--border-color', theme.colors.border);
    root.style.setProperty('--accent', theme.colors.accent);
    root.style.setProperty('--accent-text', theme.colors.accentText);
    document.body.style.fontFamily = settings.fontFamily;
  }, [settings.themeId, settings.fontFamily]);

  const showNotify = (msg: string, type: 'info' | 'success') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleSaveKey = () => {
      if (inputKey.trim().length > 10) {
          saveApiKey(inputKey);
          window.location.reload(); // Reload to initialize with new key
      } else {
          alert("Please enter a valid Google AI API Key.");
      }
  };

  const downloadBlob = (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
  };

  // State Updaters
  const updateTimeline = (updated: TimelineFrame[] | ((prev: TimelineFrame[]) => TimelineFrame[])) => {
    setProjectData(prev => ({
      ...prev,
      timeline: typeof updated === 'function' ? updated(prev.timeline) : updated
    }));
  };

  const updateCharacters = (updated: Character[] | ((prev: Character[]) => Character[])) => {
    setProjectData(prev => ({
      ...prev,
      references: typeof updated === 'function' ? updated(prev.references) : updated
    }));
  };

  // --- MASTER EXPORT HANDLER ---
  const handleExportZip = async () => {
    showNotify("Generating Export Package...", "info");
    try {
        const zip = new JSZip();
        
        // 1. Assets & Frames Images
        const imgFolder = zip.folder("images");
        projectData.references.forEach(char => {
            if (char.image) {
                const safeName = (char.name || "Asset").replace(/[^a-z0-9]/gi, '_');
                imgFolder?.file(`${safeName}.png`, char.image.split(',')[1], {base64: true});
            }
        });
        projectData.timeline.forEach((frame, idx) => {
            if (frame.image) {
                const safeTitle = (frame.title || `Scene_${idx+1}`).replace(/[^a-z0-9]/gi, '_');
                imgFolder?.file(`Scene_${idx+1}_${safeTitle}.png`, frame.image.split(',')[1], {base64: true});
            }
        });
        
        // 2. Project Data (JSON)
        zip.file("project_data.json", JSON.stringify(projectData, null, 2));
        
        // 3. DaVinci: Python Automation Script (Recommended)
        const pyScript = generateDaVinciPythonScript(projectData);
        zip.file("import_project.py", pyScript);

        // 4. DaVinci: XML (Fallback 1)
        const daVinciXML = generateDaVinciXML(projectData);
        zip.file("timeline.fcpxml", daVinciXML);

        // 5. DaVinci: EDL (Fallback 2 - Universal)
        const edl = generateEDL(projectData);
        zip.file("timeline.edl", edl);

        // 6. Subtitles (SRT)
        const srtContent = generateSRT(projectData);
        zip.file("subtitles.srt", srtContent);

        // 7. Instructions
        const installText = `
VALERA PRE-PRODUCTION - MASTER EXPORT PACKAGE
=============================================

This ZIP contains everything you need for editing in DaVinci Resolve, Premiere Pro, or Final Cut.

----------------------------------------------------------------
OPTION 1: AUTOMATED IMPORT (DaVinci Resolve - FASTEST)
----------------------------------------------------------------
1. Extract this ZIP file to a folder.
2. Open DaVinci Resolve.
3. In the top menu, go to "Workspace" -> "Console".
4. Select "Py3" (Python 3) at the top of the console window.
5. Drag and drop the 'import_project.py' file into the console area.
   OR: Open the file in a text editor, copy the code, and paste it into the console.
   
   -> This will automatically import all images, create a sequence, and place clips with correct duration.

----------------------------------------------------------------
OPTION 2: MANUAL IMPORT (XML / FCPXML)
----------------------------------------------------------------
1. Extract the ZIP.
2. In DaVinci, go to File -> Import -> Timeline...
3. Select 'timeline.fcpxml'.
4. When asked for media, point to the 'images' folder.

----------------------------------------------------------------
OPTION 3: UNIVERSAL IMPORT (EDL)
----------------------------------------------------------------
1. Import all images from the 'images' folder into your Media Pool manually.
2. Go to File -> Import -> Timeline...
3. Select 'timeline.edl'.

----------------------------------------------------------------
SUBTITLES
----------------------------------------------------------------
- Drag 'subtitles.srt' into your timeline to get a subtitle track with all dialogue.
`;
        zip.file("README_IMPORT.txt", installText);

        const content = await zip.generateAsync({ type: "blob" });
        downloadBlob(content, `Valera_Project_${new Date().toISOString().slice(0,10)}.zip`);
        showNotify("Master Package Exported", "success");
    } catch(e) {
        console.error(e);
        showNotify("Export Failed (Check Console)", "info");
    }
  };

  const handleExportPDF = async () => {
      showNotify("Generating PDF Report...", "info");
      try {
          const doc = await generateProjectPDF(projectData);
          doc.save('valera_report.pdf'); // jspdf handles download
          showNotify("PDF Exported", "success");
      } catch (e) {
          console.error(e);
          showNotify("PDF Generation Failed", "info");
      }
  };

  const handleExportPPTX = async () => {
      showNotify("Generating Presentation...", "info");
      try {
          await generateProjectPPTX(projectData);
          showNotify("PPTX Exported", "success");
      } catch (e) {
          console.error(e);
          showNotify("PPTX Generation Failed", "info");
      }
  };

  // Determine current project ratio for new assets
  const getRatioFromSettings = (s: TimelineSettings) => {
      const w = s.width;
      const h = s.height;
      if (w === h) return "1:1";
      if (Math.abs(w/h - 4/3) < 0.05) return "4:3";
      if (Math.abs(w/h - 3/4) < 0.05) return "3:4";
      if (w < h) return "9:16";
      return "16:9";
  };
  const currentAspectRatio = getRatioFromSettings(projectData.timelineSettings);

  // --- RENDERING AUTH SCREEN ---
  if (!isLoading && !hasKey) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-[#000000] text-white flex-col relative overflow-hidden p-6">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-[#0f172a] z-0"></div>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] z-0 opacity-30"></div>

            <div className="z-10 w-full max-w-md bg-[#1e1e1e] border border-[#333] rounded-2xl shadow-2xl p-8 flex flex-col gap-6 animate-fade-in-up">
                <div className="flex flex-col items-center text-center gap-2">
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.4)] mb-2">
                        <span className="text-3xl font-black text-white">V</span>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">ACCESS REQUIRED</h1>
                    <p className="text-sm text-gray-400">
                        Valera runs on Google Gemini AI. <br/> To continue, please enter your API Key.
                    </p>
                </div>

                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                            <Key size={18} />
                        </div>
                        <input 
                            type="password" 
                            placeholder="Paste your Gemini API Key here..." 
                            value={inputKey}
                            onChange={(e) => setInputKey(e.target.value)}
                            className="w-full bg-[#111] border border-[#333] rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500 transition-colors"
                        />
                    </div>
                    <button 
                        onClick={handleSaveKey}
                        className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:brightness-110 text-white font-bold uppercase tracking-wider rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform active:scale-95"
                    >
                        Enter Studio <ArrowRight size={16}/>
                    </button>
                </div>

                <div className="text-center pt-4 border-t border-[#333]">
                    <a 
                        href="https://aistudio.google.com/app/apikey" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center justify-center gap-1 font-medium"
                    >
                        Get a free key at aistudio.google.com <ExternalLink size={10}/>
                    </a>
                    <p className="text-[10px] text-gray-600 mt-2">
                        Your key is stored locally in your browser. We do not see it.
                    </p>
                </div>
            </div>
        </div>
      );
  }

  // --- RENDERING SPLASH SCREEN ---
  if (isLoading) {
    return (
        <div className="flex h-screen w-full items-center justify-center bg-black text-white flex-col relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-[#0f172a] z-0"></div>
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] z-0 opacity-50"></div>

            <div className="z-10 flex flex-col items-center gap-6 animate-fade-in-up">
                <div className="relative">
                    <div className="w-24 h-24 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-[0_0_40px_rgba(6,182,212,0.4)] animate-pulse">
                        <span className="text-5xl font-black text-white tracking-tighter">V</span>
                    </div>
                    <div className="absolute -top-2 -right-2 w-6 h-6 border-t-2 border-r-2 border-white/50"></div>
                    <div className="absolute -bottom-2 -left-2 w-6 h-6 border-b-2 border-l-2 border-white/50"></div>
                </div>

                <div className="text-center space-y-2">
                    <h1 className="text-4xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                        VALERA
                    </h1>
                    <div className="text-[10px] font-bold uppercase tracking-[0.3em] text-cyan-400">
                        Pre-Production Suite
                    </div>
                </div>

                <div className="mt-8 flex items-center gap-3">
                    <Loader2 className="animate-spin text-gray-500" size={16} />
                    <span className="text-xs font-mono text-gray-500">INITIALIZING STUDIO...</span>
                </div>
            </div>
        </div>
    );
  }

  // --- MAIN APP ---
  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--bg-main)] text-[var(--text-main)] overflow-hidden font-sans">
        {/* Top Navigation Bar - Professional Program Style */}
        {!isDirectorFullScreen && (
            <div className="h-12 border-b border-[var(--border-color)] bg-[var(--bg-header)] flex items-center justify-between px-3 shrink-0 z-50 select-none">
                
                {/* Left: Branding & Assistant */}
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setSettings(s => ({ ...s, showAssistant: !s.showAssistant }))}
                        className={`w-8 h-8 rounded-md flex items-center justify-center font-bold shadow-sm transition-all hover:scale-105 ${settings.showAssistant ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-input)] text-[var(--text-muted)] border border-[var(--border-color)]'}`}
                        title={settings.showAssistant ? "Hide Vel Assistant" : "Show Vel Assistant"}
                    >
                        {settings.showAssistant ? "V" : <Bot size={16} />}
                    </button>
                    <div className="flex flex-col justify-center">
                        <span className="font-bold text-sm tracking-tight leading-none">VALERA</span>
                        <span className="text-[9px] text-[var(--text-muted)] font-medium leading-none mt-0.5">PRE-PRODUCTION</span>
                    </div>
                </div>
                
                {/* Center: Tabs */}
                <div id="ui-main-tabs" className="flex bg-[var(--bg-input)] p-0.5 rounded-lg border border-[var(--border-color)] absolute left-1/2 -translate-x-1/2 hidden md:flex">
                    <button onClick={() => setActiveTab('studio')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 ${activeTab === 'studio' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-header)]'}`}>
                        <Clapperboard size={14}/> Studio
                    </button>
                    <div className="w-px bg-[var(--border-color)] my-1"></div>
                    <button onClick={() => setActiveTab('hub')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 ${activeTab === 'hub' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-header)]'}`}>
                        <Monitor size={14}/> Hub
                    </button>
                    <div className="w-px bg-[var(--border-color)] my-1"></div>
                    <button onClick={() => setActiveTab('settings')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase transition-all flex items-center gap-1.5 ${activeTab === 'settings' ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-header)]'}`}>
                        <SettingsIcon size={14}/> Settings
                    </button>
                </div>

                {/* Right: Export & Tools */}
                <div id="ui-header-export" className="flex items-center gap-1">
                    <a href="https://t.me/derni108" target="_blank" rel="noopener noreferrer" className="p-1.5 text-blue-400 hover:text-white hover:bg-blue-500/20 rounded-md transition-all flex items-center justify-center mr-2" title="Contact Developer">
                        <Send size={16} />
                    </a>
                    
                    {/* MASTER EXPORT BUTTON */}
                    <button 
                        onClick={handleExportZip} 
                        className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent)] text-[var(--accent-text)] hover:brightness-110 rounded-md transition-all shadow-sm font-bold text-[11px] uppercase tracking-wide border border-transparent" 
                        title="Export Project Package"
                    >
                        <Package size={14} /> Export
                    </button>

                    <div className="w-px h-5 bg-[var(--border-color)] mx-1"></div>

                    {/* Documentation Exports */}
                    <button onClick={handleExportPDF} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-input)] rounded-md transition-all" title="Export PDF Report">
                        <FileText size={16} />
                    </button>
                    <button onClick={handleExportPPTX} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--accent)] hover:bg-[var(--bg-input)] rounded-md transition-all" title="Export PPTX Deck">
                        <Presentation size={16} />
                    </button>
                    
                    <div className="w-px h-5 bg-[var(--border-color)] mx-1"></div>
                    
                    <button onClick={() => {
                        if (!document.fullscreenElement) {
                            document.documentElement.requestFullscreen().catch(e => console.log(e));
                        } else {
                            document.exitFullscreen();
                        }
                    }} className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-input)] rounded-md transition-all" title="Full Screen">
                        <Maximize size={16} />
                    </button>
                </div>
            </div>
        )}

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative">
            {activeTab === 'studio' && (
                <TimelineManager 
                    frames={projectData.timeline}
                    characters={projectData.references}
                    settings={projectData.timelineSettings}
                    onUpdate={updateTimeline}
                    onUpdateSettings={(s) => setProjectData(p => ({...p, timelineSettings: s}))}
                    onUpdateAssets={updateCharacters}
                    imageModel={settings.imageModel}
                    isDriveConnected={isDriveConnected}
                    onNotify={showNotify}
                    directorMessages={projectData.directorHistory || []}
                    onUpdateDirectorMessages={(updater) => {
                        setProjectData(prev => ({
                            ...prev,
                            directorHistory: typeof updater === 'function' ? updater(prev.directorHistory || []) : updater
                        }));
                    }}
                    onDirectorAddAsset={(asset) => {
                        const newChar: Character = {
                            id: Date.now().toString(),
                            type: asset.type,
                            name: asset.name,
                            description: asset.description,
                            triggerWord: asset.triggerWord,
                            image: null,
                            aspectRatio: currentAspectRatio // Enforce project ratio
                        };
                        updateCharacters(prev => [...prev, newChar]);
                        showNotify(`Added ${asset.type}: ${asset.name}`, "success");
                    }}
                    onDirectorAddTimeline={(scenes) => {
                       const newFrames: TimelineFrame[] = scenes.map((s, i) => ({
                           id: Date.now().toString() + i,
                           title: s.title,
                           description: s.visualDescription,
                           duration: s.duration || 4,
                           shotType: s.shotType,
                           dialogue: s.dialogue,
                           speechPrompt: s.speechPrompt,
                           musicMood: s.musicMood,
                           sunoPrompt: s.sunoPrompt,
                           assignedAssetIds: [],
                           image: null,
                           aspectRatio: currentAspectRatio // Enforce project ratio
                       }));
                       updateTimeline(prev => [...prev, ...newFrames]);
                       showNotify(`Added ${newFrames.length} scenes to Timeline`, "success");
                    }}
                    directorStyleId={projectData.activeDirectorStyleId || 'cinema-classic'}
                    onDirectorStyleChange={(id) => setProjectData(p => ({...p, activeDirectorStyleId: id}))}
                    directorDraft={projectData.directorDraft || ""}
                    onDirectorDraftChange={(txt) => setProjectData(p => ({...p, directorDraft: txt}))}
                    onHandleDirectorAction={(action) => {
                        console.log("Director Action", action);
                    }}
                    chatFontSize={settings.chatFontSize}
                    onLogGeneration={(entry) => setProjectData(p => ({...p, generationLog: [entry, ...(p.generationLog || [])]}))}
                    generationLog={projectData.generationLog}
                    isDirectorFullScreen={isDirectorFullScreen}
                    onToggleDirectorFullScreen={setIsDirectorFullScreen}
                />
            )}
            
            {activeTab === 'hub' && <VideoAudioHub />}
            
            {activeTab === 'settings' && (
                <SettingsPanel 
                    settings={settings}
                    onUpdate={setSettings}
                    onExportZip={handleExportZip}
                    onExportPDF={handleExportPDF}
                    onExportPPTX={handleExportPPTX}
                    onSaveDB={() => saveProjectToIDB(projectData).then(() => showNotify("Saved to DB", "success"))}
                    onLoadDB={() => loadProjectFromIDB().then(d => { if(d) setProjectData(d); showNotify("Loaded from DB", "success"); })}
                    isDriveConnected={isDriveConnected}
                    onConnectDrive={() => setIsDriveConnected(true)}
                />
            )}
        </div>

        {/* Notifications */}
        {notification && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1e1e1e] border border-[var(--border-color)] text-white px-4 py-2 rounded-lg shadow-2xl z-[100] animate-fade-in-up flex items-center gap-3">
                {notification.type === 'success' ? <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div> : <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>}
                <span className="text-xs font-medium tracking-wide">{notification.msg}</span>
            </div>
        )}

        {/* Vel Assistant */}
        {settings.showAssistant && activeTab === 'studio' && !isDirectorFullScreen && (
            <PatrickAssistant 
                onClose={() => setSettings(s => ({...s, showAssistant: false}))} 
                walkGif={settings.assistantWalkImage}
                idleGif={settings.assistantIdleImage}
                sittingGif={settings.assistantSitImage}
            />
        )}
    </div>
  );
};

export default App;
