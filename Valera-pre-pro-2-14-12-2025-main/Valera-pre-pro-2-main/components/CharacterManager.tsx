
import React, { useState, useCallback, memo } from 'react';
import { Character } from '../types';
import { generateImage, enhancePrompt } from '../services/geminiService';
import { driveService } from '../services/driveService';
import { Trash2, Plus, User, Sparkles, Upload, Box, MapPin, Image as ImageIcon, Download, Wand2, RefreshCw, Paperclip, X, Pencil, Maximize2, Minimize2, Expand, Info, Tag, Monitor, Star, LayoutGrid, Backpack, MoreHorizontal, Settings2, Eraser, Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { ImageEditorModal } from './ImageEditorModal';
import { ASPECT_RATIOS, MODEL_IMAGE_PRO, IMAGE_SIZES } from '../constants';

interface Props {
  characters: Character[];
  onUpdate: (updated: Character[] | ((prev: Character[]) => Character[])) => void;
  imageModel: string;
  isDriveConnected?: boolean;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
  huggingFaceToken?: string;
  isSidebarMode?: boolean;
  currentProjectRatio?: string;
}

// --- ASSET CARD COMPONENT ---
const AssetCard = memo(({ 
    char, 
    isExpanded, 
    isGenerating, 
    isEnhancing, 
    uploadStatus, 
    imageModel, 
    onToggleExpand, 
    onUpdateField, 
    onDelete, 
    onGenerate, 
    onEditImage,
    onDownload,
    onFillFrame,
    onEnhance,
    onMainUpload,
    onRefUpload,
    onRemoveRef,
    onApplyPreset,
    isSidebarMode
}: {
    char: Character;
    isExpanded: boolean;
    isGenerating: boolean;
    isEnhancing: boolean;
    uploadStatus: string | null;
    imageModel: string;
    onToggleExpand: (id: string) => void;
    onUpdateField: (id: string, field: keyof Character, value: any) => void;
    onDelete: (id: string, e: React.MouseEvent) => void;
    onGenerate: (char: Character) => void;
    onEditImage: (char: Character) => void;
    onDownload: (char: Character) => void;
    onFillFrame: (char: Character) => void;
    onEnhance: (char: Character) => void;
    onMainUpload: (charId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
    onRefUpload: (charId: string, e: React.ChangeEvent<HTMLInputElement>) => void;
    onRemoveRef: (charId: string, idx: number) => void;
    onApplyPreset: (char: Character, template: string) => void;
    isSidebarMode?: boolean;
}) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [isPromptExpanded, setIsPromptExpanded] = useState(false);
    
    // DRAG START HANDLER
    const handleDragStart = (e: React.DragEvent) => {
        if (!char.image) return;
        // Set standard image data
        e.dataTransfer.setData('text/plain', char.image);
        // Set custom JSON data for the app to recognize this as an "Asset Drop"
        const assetData = JSON.stringify({
            type: 'ASSET_DROP',
            id: char.id,
            image: char.image,
            name: char.name
        });
        e.dataTransfer.setData('application/react-dnd-asset', assetData);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const getAspectStyle = (ratio?: string) => {
        switch(ratio) {
            case "9:16": return { aspectRatio: '9/16' };
            case "1:1": return { aspectRatio: '1/1' };
            case "4:3": return { aspectRatio: '4/3' };
            case "3:4": return { aspectRatio: '3/4' };
            default: return { aspectRatio: '16/9' };
        }
    };

    const navigateHistory = (direction: 'prev' | 'next') => {
        const history = char.imageHistory || (char.image ? [char.image] : []);
        if (history.length <= 1) return;
        const currentIndex = history.findIndex(img => img === char.image);
        let newIndex = currentIndex;
        if (direction === 'prev') {
            newIndex = currentIndex > 0 ? currentIndex - 1 : history.length - 1;
        } else {
            newIndex = currentIndex < history.length - 1 ? currentIndex + 1 : 0;
        }
        onUpdateField(char.id, 'image', history[newIndex]);
    };

    return (
        <div className={`bg-[#252525] rounded-lg border border-[#333] shadow-sm overflow-hidden flex flex-col transition-all duration-300 group hover:border-[#444] ${isExpanded && !isSidebarMode ? 'col-span-1 md:col-span-2 lg:col-span-2 2xl:col-span-2 ring-1 ring-[var(--accent)] z-10' : ''}`}>
            
            {/* 1. HEADER BAR */}
            <div className="h-10 border-b border-[#333] flex items-center justify-between px-3 bg-[#2a2a2a]">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`px-1.5 py-0.5 rounded-sm text-[9px] font-bold uppercase tracking-wider flex items-center gap-1
                        ${char.type === 'character' ? 'bg-blue-500/20 text-blue-400' : 
                          char.type === 'location' ? 'bg-green-500/20 text-green-400' : 'bg-orange-500/20 text-orange-400'}`}>
                        {char.type === 'character' ? <User size={10}/> : char.type === 'location' ? <MapPin size={10}/> : <Box size={10}/>}
                        {char.type}
                    </div>
                    <input 
                        value={char.name}
                        onChange={(e) => onUpdateField(char.id, 'name', e.target.value)}
                        className="bg-transparent text-xs font-bold text-gray-200 focus:outline-none focus:text-[var(--accent)] w-full truncate placeholder-gray-600"
                        placeholder="Asset Name..."
                    />
                </div>
                <div className="flex items-center gap-1">
                    {!isSidebarMode && (
                        <button onClick={() => onToggleExpand(char.id)} className="p-1.5 text-gray-500 hover:text-white hover:bg-[#333] rounded-md transition-colors">
                            {isExpanded ? <Minimize2 size={14}/> : <Maximize2 size={14}/>}
                        </button>
                    )}
                    <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if (confirmDelete) {
                                onDelete(char.id, e);
                            } else {
                                setConfirmDelete(true);
                                setTimeout(() => setConfirmDelete(false), 3000);
                            }
                        }} 
                        className={`p-1.5 rounded-md transition-all cursor-pointer relative z-20 flex items-center justify-center gap-1
                        ${confirmDelete ? 'bg-red-500 text-white w-16 px-1' : 'text-gray-500 hover:text-red-400 hover:bg-[#333] w-7'}`}
                        title="Delete Asset"
                        type="button"
                    >
                        {confirmDelete ? <span className="text-[10px] font-bold">Confirm</span> : <Trash2 size={14}/>}
                    </button>
                </div>
            </div>

            <div className={`flex flex-col ${isExpanded && !isSidebarMode ? 'md:flex-row h-[500px]' : ''}`}>
                
                {/* 2. IMAGE PREVIEW AREA (DRAGGABLE) */}
                <div 
                    className={`relative bg-[#111] group/image flex items-center justify-center overflow-hidden border-b md:border-b-0 md:border-r border-[#333]
                    ${isExpanded && !isSidebarMode ? 'w-full md:w-2/3 h-full' : ''} ${char.image ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    style={!(isExpanded && !isSidebarMode) ? getAspectStyle(char.aspectRatio) : {}}
                    draggable={!!char.image}
                    onDragStart={handleDragStart}
                >
                    
                    {char.image ? (
                        <>
                            <img src={char.image} alt={char.name} className="w-full h-full object-contain" />
                            {/* Overlay Controls */}
                            <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover/image:opacity-100 transition-all translate-x-2 group-hover/image:translate-x-0 z-20">
                                <button onClick={() => onEditImage(char)} className="p-2 bg-black/70 text-white rounded-md hover:bg-[var(--accent)] backdrop-blur-md shadow-lg" title="Edit in Canvas"><Pencil size={14}/></button>
                                <button onClick={() => onDownload(char)} className="p-2 bg-black/70 text-white rounded-md hover:bg-[var(--accent)] backdrop-blur-md shadow-lg" title="Download"><Download size={14}/></button>
                                <button onClick={() => onFillFrame(char)} className="p-2 bg-black/70 text-white rounded-md hover:bg-[var(--accent)] backdrop-blur-md shadow-lg" title="AI Fill Frame"><Expand size={14}/></button>
                            </div>
                            
                            {/* Navigation Arrows (History) */}
                            {char.imageHistory && char.imageHistory.length > 1 && (
                                <>
                                    <button 
                                        onClick={() => navigateHistory('prev')} 
                                        className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity"
                                    >
                                        <ChevronLeft size={16}/>
                                    </button>
                                    <button 
                                        onClick={() => navigateHistory('next')} 
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 hover:bg-black/80 text-white rounded-full opacity-0 group-hover/image:opacity-100 transition-opacity"
                                    >
                                        <ChevronRight size={16}/>
                                    </button>
                                    <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 rounded text-[9px] text-gray-400 font-mono backdrop-blur-md pointer-events-none">
                                        {char.imageHistory.indexOf(char.image) + 1} / {char.imageHistory.length}
                                    </div>
                                </>
                            )}
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center text-[#444] gap-2 w-full h-full">
                            <ImageIcon size={32} strokeWidth={1} />
                            <span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Empty Slot</span>
                            <button onClick={() => onEditImage(char)} className="mt-2 px-3 py-1.5 bg-[#222] hover:bg-[var(--accent)] text-gray-400 hover:text-white rounded-md text-[10px] font-bold uppercase transition-colors border border-[#333]">
                                Open Canvas
                            </button>
                        </div>
                    )}

                    {/* Upload Overlay */}
                    <div className="absolute top-2 left-2 z-20 opacity-0 group-hover/image:opacity-100 transition-all -translate-x-2 group-hover/image:translate-x-0">
                       <label className="p-2 bg-black/70 hover:bg-[var(--accent)] text-white rounded-md cursor-pointer backdrop-blur-md shadow-lg flex items-center justify-center">
                            <Upload size={14} />
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => onMainUpload(char.id, e)} />
                       </label>
                    </div>

                    {/* Loading State */}
                    {(isGenerating || uploadStatus) && (
                        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center z-30 backdrop-blur-sm">
                            <RefreshCw size={24} className="text-[var(--accent)] animate-spin mb-2" />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[var(--accent)]">
                                {uploadStatus ? 'Syncing...' : 'Rendering...'}
                            </span>
                        </div>
                    )}
                </div>

                {/* 3. CONTROLS AREA */}
                <div className={`flex flex-col p-3 gap-3 bg-[#1e1e1e] ${isExpanded && !isSidebarMode ? 'w-full md:w-1/3 overflow-y-auto custom-scrollbar' : 'flex-1'}`}>
                    
                    {/* Prompt Input */}
                    <div className={`flex-1 flex flex-col gap-1 min-h-[80px] relative group/prompt transition-all duration-300 ${isPromptExpanded ? 'z-50' : ''}`}>
                        <div className="flex justify-between items-center">
                            <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1"><Info size={10}/> Prompt</label>
                            <button onClick={() => onEnhance(char)} disabled={isEnhancing || !char.description} className="text-[9px] font-bold uppercase text-purple-400 hover:text-purple-300 flex items-center gap-1 disabled:opacity-50">
                                {isEnhancing ? <RefreshCw size={10} className="animate-spin"/> : <Wand2 size={10}/>} Enhance
                            </button>
                        </div>
                        <div className="relative h-full">
                            <textarea 
                                value={char.description}
                                onChange={(e) => onUpdateField(char.id, 'description', e.target.value)}
                                placeholder={`Describe ${char.type}...`}
                                className={`w-full bg-[#151515] text-gray-300 text-xs p-2 rounded-md border border-[#333] focus:border-[var(--accent)] focus:outline-none resize-y custom-scrollbar leading-relaxed
                                ${isPromptExpanded ? 'h-64 absolute top-0 left-0 z-50 shadow-2xl' : 'h-full'}`}
                            />
                            {/* Expand/Clear Controls */}
                            <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover/prompt:opacity-100 transition-opacity bg-[#252525] rounded-md border border-[#333] z-50 shadow-sm overflow-hidden">
                                <button 
                                    onClick={() => setIsPromptExpanded(!isPromptExpanded)} 
                                    className="p-1.5 text-gray-400 hover:text-white hover:bg-[#333]"
                                    title={isPromptExpanded ? "Collapse" : "Expand"}
                                >
                                    {isPromptExpanded ? <Minimize2 size={12}/> : <Maximize2 size={12}/>}
                                </button>
                                {char.description && (
                                    <button 
                                        onClick={() => onUpdateField(char.id, 'description', '')} 
                                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-[#333]"
                                        title="Clear Text"
                                    >
                                        <Eraser size={12}/>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Settings Row */}
                    <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1"><Tag size={10}/> Trigger</label>
                            <input 
                                value={char.triggerWord || ''}
                                onChange={(e) => onUpdateField(char.id, 'triggerWord', e.target.value)}
                                placeholder="keyword"
                                className="bg-[#151515] text-gray-300 text-xs px-2 py-1.5 rounded-md border border-[#333] focus:border-[var(--accent)] focus:outline-none"
                            />
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-bold text-gray-500 uppercase flex items-center gap-1"><Monitor size={10}/> Ratio</label>
                            <select 
                                value={char.aspectRatio || "16:9"}
                                onChange={(e) => onUpdateField(char.id, 'aspectRatio', e.target.value)}
                                className="bg-[#151515] text-gray-300 text-xs px-2 py-1.5 rounded-md border border-[#333] focus:border-[var(--accent)] focus:outline-none"
                            >
                                {ASPECT_RATIOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                        </div>
                    </div>

                    {/* References & Actions Toolbar */}
                    <div className="flex items-center gap-2 pt-1">
                        <label className="p-2 bg-[#252525] hover:bg-[#333] border border-[#333] rounded-md cursor-pointer text-gray-400 hover:text-white transition-colors" title="Add Reference Image">
                            <Paperclip size={14} />
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => onRefUpload(char.id, e)} />
                        </label>
                        
                        <button 
                            onClick={() => onGenerate(char)}
                            disabled={isGenerating || !char.description}
                            className={`flex-1 py-2 rounded-md font-bold uppercase text-[10px] tracking-wide flex items-center justify-center gap-2 shadow-sm transition-all
                            ${isGenerating ? 'bg-[#333] text-gray-500 cursor-not-allowed' : 'bg-[var(--accent)] text-white hover:brightness-110'}`}
                        >
                            {isGenerating ? 'Painting...' : <><Sparkles size={12} fill="currentColor"/> Generate</>}
                        </button>
                    </div>

                    {/* Refs Strip (Only if refs exist) */}
                    {char.additionalReferences && char.additionalReferences.length > 0 && (
                        <div className="flex gap-1.5 overflow-x-auto pb-1 custom-scrollbar border-t border-[#333] pt-2">
                            {char.additionalReferences.map((ref, idx) => (
                                <div key={idx} className="relative group flex-shrink-0 w-8 h-8 rounded border border-[#333] overflow-hidden">
                                    <img src={ref} className="w-full h-full object-cover" alt="ref" />
                                    <button onClick={() => onRemoveRef(char.id, idx)} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
                                        <X size={10} />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

export const CharacterManager: React.FC<Props> = ({ characters, onUpdate, imageModel, isDriveConnected, onNotify, huggingFaceToken, isSidebarMode, currentProjectRatio }) => {
  const [activeCategory, setActiveCategory] = useState<'all' | 'character' | 'location' | 'item'>('all');
  const [isGenerating, setIsGenerating] = useState<string | null>(null);
  const [isEnhancing, setIsEnhancing] = useState<string | null>(null);
  const [editingChar, setEditingChar] = useState<Character | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const addNew = useCallback((type: 'character' | 'location' | 'item') => {
      const newChar: Character = {
        id: Date.now().toString(),
        type,
        name: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
        description: "",
        image: null,
        imageHistory: [],
        aspectRatio: currentProjectRatio || "16:9",
        imageSize: "1K"
      };
      onUpdate(prev => [newChar, ...prev]);
      if (!isSidebarMode) setExpandedCardId(newChar.id);
  }, [onUpdate, isSidebarMode, currentProjectRatio]);

  const updateChar = useCallback((id: string, field: keyof Character, value: any) => {
    onUpdate(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  }, [onUpdate]);

  const deleteChar = useCallback((id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onUpdate(prev => prev.filter(c => c.id !== id));
  }, [onUpdate]);

  const handleGenerate = useCallback(async (char: Character) => {
    setIsGenerating(char.id);
    try {
      let promptToUse = char.description;
      if (char.triggerWord) promptToUse = `${char.triggerWord}, ${promptToUse}`;
      
      // CREATIVE CREW INJECTION FOR MANUAL GENERATION
      // Enforces the "Role" logic even when manually clicking generate.
      if (char.type === 'character') {
          promptToUse += ". Character sheet, showing 3 angles: Front view, Side view, Back view. Neutral white background. Full body.";
      } else if (char.type === 'item') {
          promptToUse += ". Macro product shot, isolated on white background, studio lighting, hyper-detailed texture.";
      } else if (char.type === 'location') {
          promptToUse += ". Wide cinematic establishing shot, atmospheric lighting, high detail environment concept art, NO PEOPLE.";
      } else {
          // Fallback for vague descriptions
          if (promptToUse.length < 50) promptToUse += ", highly detailed, cinematic lighting.";
      }

      const refs = [char.image, ...(char.additionalReferences || [])].filter(Boolean) as string[];
      const imageUrl = await generateImage(promptToUse, refs.length ? refs : undefined, char.aspectRatio || "16:9", imageModel, char.imageSize);
      
      onUpdate(current => current.map(c => {
          if (c.id === char.id) {
              const hist = c.imageHistory ? [...c.imageHistory] : (c.image ? [c.image] : []);
              return { ...c, image: imageUrl, imageHistory: [...hist, imageUrl] };
          }
          return c;
      }));
      if (isDriveConnected && imageUrl) {
          setUploadStatus(char.id);
          const fname = `${char.name.replace(/\s+/g, '_')}_${Date.now()}.png`;
          await driveService.uploadImage(imageUrl, fname, 'Characters');
          onNotify?.("Saved to Drive", "success");
          setUploadStatus(null);
      }
    } catch (e) { alert("Gen failed: " + e); } finally { setIsGenerating(null); }
  }, [imageModel, isDriveConnected, onNotify, onUpdate]);

  const filteredChars = characters.filter(c => {
      const matchCat = activeCategory === 'all' || c.type === activeCategory;
      const matchSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchCat && matchSearch;
  });

  const QuickCreateButton = ({ type, icon, label, colorClass, desc }: any) => (
      <button 
        onClick={() => addNew(type)}
        className={`relative group flex flex-col items-center justify-center p-3 rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] hover:bg-[var(--bg-card)] transition-all overflow-hidden ${isSidebarMode ? 'aspect-square' : 'flex-1 h-20'}`}
      >
          <div className={`absolute inset-0 opacity-0 group-hover:opacity-10 transition-opacity ${colorClass}`}></div>
          <div className={`mb-1 ${colorClass.replace('bg-', 'text-').replace('/10', '')}`}>{icon}</div>
          <span className="text-[10px] font-bold uppercase z-10">{label}</span>
          {!isSidebarMode && <span className="text-[9px] text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity absolute bottom-1">{desc}</span>}
      </button>
  );

  return (
    <div className={`animate-fade-in ${isSidebarMode ? '' : 'pb-20'}`}>
      
      {/* 1. TOP TOOLBAR (Redesigned) */}
      <div className="flex flex-col gap-3 mb-4">
          
          {/* Creation Grid */}
          <div className={`grid gap-2 ${isSidebarMode ? 'grid-cols-3' : 'grid-cols-3'}`}>
              <QuickCreateButton type="character" icon={<User size={isSidebarMode ? 18 : 20}/>} label={isSidebarMode ? "Char" : "Character"} colorClass="bg-blue-500/10 text-blue-400" desc="Cast & Actors" />
              <QuickCreateButton type="location" icon={<MapPin size={isSidebarMode ? 18 : 20}/>} label={isSidebarMode ? "Loc" : "Location"} colorClass="bg-green-500/10 text-green-400" desc="Sets & Environments" />
              <QuickCreateButton type="item" icon={<Box size={isSidebarMode ? 18 : 20}/>} label={isSidebarMode ? "Item" : "Item"} colorClass="bg-orange-500/10 text-orange-400" desc="Props & Objects" />
          </div>

          {/* Search & Filter Bar */}
          <div className="flex items-center gap-2 bg-[var(--bg-input)] p-1 rounded-lg border border-[var(--border-color)]">
              <div className="pl-2 text-[var(--text-muted)]"><Search size={14}/></div>
              <input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter assets..." 
                  className="bg-transparent text-xs text-[var(--text-main)] w-full focus:outline-none placeholder-[var(--text-muted)]"
              />
              <div className="w-px h-4 bg-[var(--border-color)] mx-1"></div>
              <div className="flex gap-1">
                  {['all', 'character', 'location', 'item'].map(cat => {
                      const isActive = activeCategory === cat;
                      let icon = <Filter size={12}/>;
                      if (cat === 'character') icon = <User size={12}/>;
                      if (cat === 'location') icon = <MapPin size={12}/>;
                      if (cat === 'item') icon = <Box size={12}/>;

                      return (
                        <button
                            key={cat}
                            onClick={() => setActiveCategory(cat as any)}
                            className={`p-1.5 rounded-md transition-all ${isActive ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                            title={cat}
                        >
                            {icon}
                        </button>
                      );
                  })}
              </div>
          </div>
      </div>

      {/* 2. ASSET GRID */}
      <div className={isSidebarMode ? "flex flex-col gap-4" : "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-6"}>
        {filteredChars.length === 0 && (
            <div className="col-span-full py-8 flex flex-col items-center justify-center text-gray-600 opacity-50 border-2 border-dashed border-[#333] rounded-lg bg-[#1a1a1a]">
                <LayoutGrid size={isSidebarMode ? 24 : 48} className="mb-2 text-[#333]"/>
                <span className="text-[10px] font-bold uppercase">No Assets Found</span>
            </div>
        )}
        
        {filteredChars.map((char) => (
            <AssetCard 
                key={char.id}
                char={char}
                isExpanded={expandedCardId === char.id}
                isGenerating={isGenerating === char.id}
                isEnhancing={isEnhancing === char.id}
                uploadStatus={uploadStatus === char.id ? uploadStatus : null}
                imageModel={imageModel}
                onToggleExpand={(id) => setExpandedCardId(prev => prev === id ? null : id)}
                onUpdateField={updateChar}
                onDelete={deleteChar}
                onGenerate={handleGenerate}
                onEditImage={setEditingChar}
                onDownload={(c) => { 
                    const a = document.createElement('a'); a.href = c.image!; a.download = 'asset.png'; a.click(); 
                }}
                onFillFrame={(c) => {
                    const desc = c.description + ", full frame zoom out";
                    updateChar(c.id, 'description', desc);
                    setTimeout(() => handleGenerate({...c, description: desc}), 100);
                }}
                onEnhance={async (c) => {
                    setIsEnhancing(c.id);
                    try { const res = await enhancePrompt(c.description); updateChar(c.id, 'description', res); }
                    catch(e) { console.error(e); } finally { setIsEnhancing(null); }
                }}
                onMainUpload={(id, e) => {
                    const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = ev => {
                        const res = ev.target?.result as string; 
                        onUpdate(chars => chars.map(x => x.id === id ? {...x, image: res, imageHistory: [...(x.imageHistory||[]), res]} : x));
                    }; r.readAsDataURL(f); }
                }}
                onRefUpload={(id, e) => {
                    const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = ev => {
                        updateChar(id, 'additionalReferences', [...(char.additionalReferences||[]), ev.target?.result]);
                    }; r.readAsDataURL(f); }
                }}
                onRemoveRef={(id, idx) => {
                    updateChar(id, 'additionalReferences', char.additionalReferences?.filter((_, i) => i !== idx));
                }}
                onApplyPreset={(c, t) => updateChar(c.id, 'description', t.replace('[DESC]', c.description))}
                isSidebarMode={isSidebarMode}
            />
        ))}
      </div>

      {editingChar && (
        <ImageEditorModal 
          imageUrl={editingChar.image}
          historyImages={editingChar.imageHistory || (editingChar.image ? [editingChar.image] : [])}
          isOpen={!!editingChar}
          onClose={() => setEditingChar(null)}
          onSave={(newImg) => {
              onUpdate(prev => prev.map(c => {
                  if (c.id === editingChar.id) return { ...c, image: newImg, imageHistory: [...(c.imageHistory||[]), newImg] };
                  return c;
              }));
          }}
          imageModel={imageModel}
          isDriveConnected={isDriveConnected}
          onNotify={onNotify}
          initialPrompt={editingChar.description}
          initialAspectRatio={editingChar.aspectRatio} 
          huggingFaceToken={huggingFaceToken}
        />
      )}
    </div>
  );
};
