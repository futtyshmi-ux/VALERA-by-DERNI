
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { generateImage, enhancePrompt } from '../services/geminiService';
import { driveService } from '../services/driveService';
import { 
  X, Save, RefreshCw, Wand2, PenTool, Type, Undo, Image as ImageIcon, Sparkles, 
  Download, Eraser, MousePointer, Square, Circle, Paperclip, ArrowRight, 
  ZoomIn, ZoomOut, Move, Trash, Shapes, Plus, PanelLeftClose, PanelLeftOpen, 
  Brush, Crop, Maximize, Scaling, Percent, LayoutTemplate, Monitor, Smartphone, 
  Grid, Layers, Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, ChevronDown, 
  ChevronUp, Lasso, Maximize2, Minimize2, Scissors, ScanLine, Combine, 
  BoxSelect, Focus, Grid3X3, Ruler, PanelRightClose, PanelRightOpen, Anchor, Search,
  Sliders, Check, Ratio, Aperture, Activity, Sun, Moon, Droplet, Thermometer, CircleDashed, Hash, Triangle, EyeIcon, Menu, LogOut, Filter, Film
} from 'lucide-react';
import { EDITOR_FONTS } from '../constants';

interface Props {
  imageUrl: string | null;
  historyImages?: string[];
  globalHistory?: string[];
  onImageChange?: (newUrl: string) => void;
  isOpen: boolean;
  onClose: () => void;
  onSave: (newImage: string) => void;
  imageModel: string;
  isDriveConnected?: boolean;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
  initialPrompt?: string;
  initialAspectRatio?: string;
  huggingFaceToken?: string;
}

type ToolType = 'select' | 'brush' | 'inpaint' | 'eraser' | 'lasso' | 'text' | 'rect' | 'circle' | 'arrow' | 'hand' | 'pen' | 'frame';
type HandleType = 'tl' | 'tr' | 'bl' | 'br' | null;
type OverlayType = 'none' | 'thirds' | 'cross' | 'golden' | 'safe-zones' | 'cinema-235';

interface Point { x: number; y: number; }

interface FilterState {
    exposure: number;   // 100 default
    contrast: number;   // 100 default
    saturation: number; // 100 default
    warmth: number;     // 0 default (sepia/hue shift)
    highlights: number; // 0
    shadows: number;    // 0
    vignette: number;   // 0 to 100
    grain: number;      // 0 to 100
    sharpen: number;    // 0 to 100
    blur: number;       // 0
}

interface BaseObject { 
    id: string; 
    type: string; 
    name: string;
    color: string; 
    lineWidth: number; 
    visible: boolean;
    locked: boolean;
    filters: FilterState;
}

interface PathObject extends BaseObject { type: 'path'; points: Point[]; isEraser: boolean; isInpaint?: boolean; isLasso?: boolean; isPen?: boolean; opacity: number; }
interface ShapeObject extends BaseObject { type: 'rect' | 'circle'; x: number; y: number; w: number; h: number; filled?: boolean; }
interface ArrowObject extends BaseObject { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; }
interface ImageObj extends BaseObject { type: 'image'; x: number; y: number; w: number; h: number; src: string; }
interface TextObject extends BaseObject { type: 'text'; x: number; y: number; text: string; fontFamily: string; fontSize: number; }
interface MaskObject extends BaseObject { type: 'mask'; points: Point[]; mode: 'erase' | 'isolate'; }
interface RefItem { id: string; src: string; orientation: 'portrait' | 'landscape' | 'square'; }

type CanvasObject = PathObject | ShapeObject | TextObject | ArrowObject | ImageObj | MaskObject;

const hexToRgba = (hex: string, alpha: number) => {
    let c: any;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){ c= [c[0], c[0], c[1], c[1], c[2], c[2]]; }
        c= '0x'+c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return `rgba(255, 255, 255, ${alpha})`;
}

const DEFAULT_FILTERS: FilterState = {
    exposure: 100, contrast: 100, saturation: 100, warmth: 0,
    highlights: 0, shadows: 0, vignette: 0, grain: 0, sharpen: 0, blur: 0
};

// MATCHING TIMELINE RESOLUTIONS EXACTLY
const RESOLUTION_PRESETS = [
    { label: "1080p HD (16:9)", w: 1920, h: 1080, icon: <Monitor size={12}/> },
    { label: "Vertical HD (9:16)", w: 1080, h: 1920, icon: <Smartphone size={12}/> },
    { label: "Square (1:1)", w: 1080, h: 1080, icon: <Square size={12}/> },
    { label: "TV Standard (4:3)", w: 1440, h: 1080, icon: <Ratio size={12}/> },
    { label: "Portrait 3:4", w: 1080, h: 1440, icon: <Ratio size={12}/> },
    { label: "4K UHD (16:9)", w: 3840, h: 2160, icon: <LayoutTemplate size={12}/> },
    { label: "Cinema 4K", w: 4096, h: 2160, icon: <Film size={12}/> }
];

const ToolButton = ({ icon, active, onClick, title }: { icon: React.ReactNode, active: boolean, onClick: () => void, title?: string }) => (
    <button onClick={onClick} title={title} className={`p-3 rounded-xl transition-all w-12 h-12 flex items-center justify-center shrink-0 ${active ? 'bg-[var(--accent)] text-white shadow-lg scale-110' : 'text-gray-400 hover:text-white hover:bg-[#333]'}`}>
        {icon}
    </button>
);

export const ImageEditorModal: React.FC<Props> = ({ imageUrl, historyImages = [], globalHistory = [], onImageChange, isOpen, onClose, onSave, imageModel, isDriveConnected, onNotify, initialPrompt, initialAspectRatio = "16:9", huggingFaceToken }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null); 
  
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolType>('select');
  const [isShapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showTools, setShowTools] = useState(true); // Default hidden on mobile handled by css media query or logic? Let's default true and toggle
  const [showResMenu, setShowResMenu] = useState(false);
  const [showColorPanel, setShowColorPanel] = useState(false);
  const [showMobileAdjustments, setShowMobileAdjustments] = useState(false);
  
  const [overlayType, setOverlayType] = useState<OverlayType>('none');
  const [showRulers, setShowRulers] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [localAssetHistory, setLocalAssetHistory] = useState<string[]>([]);

  const [color, setColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(20); 
  const [brushOpacity, setBrushOpacity] = useState(1.0);
  const [isShapeFilled, setIsShapeFilled] = useState(false);
  
  const [fontSize, setFontSize] = useState(48);
  const [selectedFont, setSelectedFont] = useState(EDITOR_FONTS[0].value);
  const [textInput, setTextInput] = useState<{ x: number; y: number, id?: string } | null>(null);
  const [inputValue, setInputValue] = useState("");
  const inputValueRef = useRef(""); 

  const [docSize, setDocSize] = useState({ w: 1920, h: 1080 });
  const [view, setView] = useState({ scale: 0.5, x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);
  const [prevTool, setPrevTool] = useState<ToolType>('select');

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentShape, setCurrentShape] = useState<ShapeObject | null>(null);
  const [currentArrow, setCurrentArrow] = useState<ArrowObject | null>(null);
  const [currentPath, setCurrentPath] = useState<PathObject | null>(null);
  
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [activeLasso, setActiveLasso] = useState<{ points: Point[] } | null>(null);
  const [activeFrame, setActiveFrame] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [originalBounds, setOriginalBounds] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [originalObjStates, setOriginalObjStates] = useState<Record<string, CanvasObject>>({});
  const [imageCache] = useState<Map<string, HTMLImageElement>>(new Map());
  const [noisePattern, setNoisePattern] = useState<CanvasPattern | null>(null);

  const [prompt, setPrompt] = useState(initialPrompt || "");
  const [references, setReferences] = useState<RefItem[]>([]);
  const [enlargedRef, setEnlargedRef] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [genStatusMsg, setGenStatusMsg] = useState("Generating...");
  const [isIsolateMode, setIsIsolateMode] = useState(false);
  const [isCropMode, setIsCropMode] = useState(false);

  // --- TRIGGER VEL TOUR ---
  useEffect(() => {
      if (isOpen) {
          window.dispatchEvent(new CustomEvent('VEL_CANVAS_OPEN'));
          // Auto-hide tools on mobile initially to show canvas
          if (window.innerWidth < 768) setShowTools(false);
      }
      return () => {
          if (isOpen) {
              window.dispatchEvent(new CustomEvent('VEL_CANVAS_CLOSE'));
          }
      }
  }, [isOpen]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
        const root = document.documentElement;
        const computed = getComputedStyle(root);
        if (!computed.getPropertyValue('--tg-theme-bg-color')) {
            root.style.setProperty('--tg-theme-bg-color', '#1e1e1e');
            root.style.setProperty('--tg-theme-text-color', '#ffffff');
            root.style.setProperty('--tg-theme-button-color', '#3390ec');
            root.style.setProperty('--accent', '#3b82f6');
        }
    }
  }, []);

  useEffect(() => { setLocalAssetHistory([...(historyImages || [])]); }, [historyImages]);
  useEffect(() => { inputValueRef.current = inputValue; }, [inputValue]);

  
  // Generate Noise Pattern for Grain
  useEffect(() => {
      const noiseCanvas = document.createElement('canvas');
      noiseCanvas.width = 200; noiseCanvas.height = 200;
      const ctx = noiseCanvas.getContext('2d');
      if (ctx) {
          const idata = ctx.createImageData(200, 200);
          const buffer32 = new Uint32Array(idata.data.buffer);
          for (let i = 0; i < buffer32.length; i++) {
              if (Math.random() < 0.5) buffer32[i] = 0xff000000;
          }
          ctx.putImageData(idata, 0, 0);
          const canvas = canvasRef.current?.getContext('2d');
          if (canvas) setNoisePattern(canvas.createPattern(noiseCanvas, 'repeat'));
      }
  }, []);

  useEffect(() => {
    const families = EDITOR_FONTS.filter(f => !f.value.includes('Arial') && !f.value.includes('Impact')).map(f => {
        const match = f.value.match(/'([^']+)'/);
        return match ? match[1].replace(/\s+/g, '+') : null;
    }).filter(Boolean).join('&family=');
    if (families) {
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }
  }, []);

  const deleteLayer = useCallback((id: string) => { 
      setObjects(prev => prev.filter(o => o.id !== id)); 
      if (selectedIds.includes(id)) setSelectedIds(prev => prev.filter(sid => sid !== id));
  }, [selectedIds]);

  const toggleLayerVis = (id: string) => {
      setObjects(prev => prev.map(o => o.id === id ? { ...o, visible: !o.visible } : o));
  };

  const moveLayer = (id: string, direction: 'up' | 'down') => {
      setObjects(prev => {
          const index = prev.findIndex(o => o.id === id);
          if (index < 0) return prev;
          const newArr = [...prev];
          if (direction === 'up' && index < newArr.length - 1) {
              [newArr[index], newArr[index + 1]] = [newArr[index + 1], newArr[index]];
          } else if (direction === 'down' && index > 0) {
              [newArr[index], newArr[index - 1]] = [newArr[index - 1], newArr[index]];
          }
          return newArr;
      });
  };

  const addEmptyLayer = () => {
      const newLayer: ShapeObject = {
          id: Date.now().toString(), type: 'rect', name: 'Empty Layer', 
          color: 'transparent', lineWidth: 0, x: 0, y: 0, w: docSize.w, h: docSize.h, 
          visible: true, locked: false, filters: { ...DEFAULT_FILTERS }
      };
      setObjects(prev => [...prev, newLayer]);
      setSelectedIds([newLayer.id]);
  };

  const updateObjectFilter = (key: keyof FilterState, value: any) => {
      if (selectedIds.length === 0) return;
      setObjects(prev => prev.map(obj => 
          selectedIds.includes(obj.id) 
          ? { ...obj, filters: { ...obj.filters, [key]: value } } 
          : obj
      ));
  };

  const cycleOverlay = () => {
      const modes: OverlayType[] = ['none', 'thirds', 'cross', 'golden', 'safe-zones', 'cinema-235'];
      const nextIdx = (modes.indexOf(overlayType) + 1) % modes.length;
      setOverlayType(modes[nextIdx]);
  };

  // --- INIT CANVAS FIX: Respect image size ---
  useEffect(() => {
    if (isOpen && objects.length === 0) {
      const initCanvas = () => {
          if (!containerRef.current) { setTimeout(initCanvas, 50); return; }
          if (imageUrl) {
              const img = new Image(); img.crossOrigin = "anonymous"; img.src = imageUrl;
              img.onload = () => {
                if (!containerRef.current) return;
                
                let initW = img.naturalWidth;
                let initH = img.naturalHeight;
                
                if (initW < 100) initW = 1920; 
                if (initH < 100) initH = 1080;

                setDocSize({ w: initW, h: initH });
                
                const cw = containerRef.current.clientWidth; const ch = containerRef.current.clientHeight; const padding = 60; 
                const scale = Math.min((cw - padding) / initW, (ch - padding) / initH, 1);
                setView({ scale, x: (cw - initW * scale) / 2, y: (ch - initH * scale) / 2 });
                
                const newImgObj: ImageObj = { 
                    id: 'main-image', type: 'image', name: 'Main Image', 
                    color: '#fff', lineWidth: 0, visible: true, locked: false, 
                    src: imageUrl, 
                    x: 0, 
                    y: 0, 
                    w: initW, h: initH,
                    filters: { ...DEFAULT_FILTERS }
                };
                setObjects([newImgObj]); imageCache.set('main-image', img);
              };
          }
      };
      initCanvas();
    }
  }, [isOpen, imageUrl]);

  const handleFitView = useCallback(() => {
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth; const ch = containerRef.current.clientHeight;
        const padding = 60;
        const scale = Math.min((cw - padding) / docSize.w, (ch - padding) / docSize.h, 1);
        setView({ scale, x: (cw - docSize.w * scale) / 2, y: (ch - docSize.h * scale) / 2 });
      }
  }, [docSize]);

  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') return;
          if (e.code === 'Space' && !e.repeat) { e.preventDefault(); setPrevTool(tool); setTool('hand'); }
          if (e.key === 'Enter' && tool === 'pen') { finishPenPath(); }
          if (e.key === 'Escape') { 
              if (tool === 'pen') finishPenPath();
              else { setActiveLasso(null); setActiveFrame(null); setSelectedIds([]); if (textInput) commitText(); setIsIsolateMode(false); setShowResMenu(false); setShowColorPanel(false); setShowMobileAdjustments(false); }
          }
          if ((e.key === 'Delete' || e.key === 'Backspace') && !e.repeat && selectedIds.length > 0 && !textInput) { e.preventDefault(); selectedIds.forEach(id => deleteLayer(id)); }
          if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); setView(v => ({...v, scale: Math.min(v.scale * 1.1, 10)})); }
          if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); setView(v => ({...v, scale: Math.max(v.scale * 0.9, 0.05)})); }
          if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); handleFitView(); }
      };
      const handleKeyUp = (e: KeyboardEvent) => { if (e.code === 'Space' && tool === 'hand') { e.preventDefault(); setTool(prevTool); } };
      window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
      return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [tool, prevTool, selectedIds, deleteLayer, handleFitView, textInput]);

  useEffect(() => { 
      let animationFrameId: number;
      const loop = () => { renderCanvas(); if (activeLasso || activeFrame) { animationFrameId = requestAnimationFrame(loop); } };
      loop();
      return () => { cancelAnimationFrame(animationFrameId); };
  }, [objects, selectedIds, currentPath, currentShape, currentArrow, selectionBox, tool, activeHandle, view, isCropMode, docSize, activeLasso, activeFrame, overlayType, showRulers, textInput, isIsolateMode]);

  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale });
  const worldToScreen = (wx: number, wy: number) => ({ x: wx * view.scale + view.x, y: wy * view.scale + view.y });

  const getObjectBounds = (obj: CanvasObject) => {
    if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'image') { const s = obj as ShapeObject | ImageObj; return { x: s.x, y: s.y, w: s.w, h: s.h }; }
    else if (obj.type === 'arrow') { const a = obj as ArrowObject; const minX = Math.min(a.x1, a.x2); const minY = Math.min(a.y1, a.y2); return { x: minX, y: minY, w: Math.abs(a.x2 - a.x1), h: Math.abs(a.y2 - a.y1) }; }
    else if (obj.type === 'text') { const t = obj as TextObject; const ctx = canvasRef.current?.getContext('2d'); if (ctx) { const fontName = t.fontFamily.split(',')[0].replace(/['"]/g, ''); ctx.font = `bold ${t.fontSize}px "${fontName}"`; const metrics = ctx.measureText(t.text); return { x: t.x, y: t.y, w: metrics.width, h: t.fontSize * 1.2 }; } return { x: t.x, y: t.y, w: t.text.length * (t.fontSize*0.6), h: t.fontSize }; }
    else if (obj.type === 'path' || obj.type === 'mask') { const p = obj as PathObject | MaskObject; if (p.points.length === 0) return null; let minX = p.points[0].x, maxX = p.points[0].x; let minY = p.points[0].y, maxY = p.points[0].y; p.points.forEach(pt => { if (pt.x < minX) minX = pt.x; if (pt.x > maxX) maxX = pt.x; if (pt.y < minY) minY = pt.y; if (pt.y > maxY) maxY = pt.y; }); return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }; }
    return null;
  };

  const getCombinedBounds = (ids: string[]) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasBounds = false;
      ids.forEach(id => {
          const obj = objects.find(o => o.id === id);
          if (!obj) return;
          const bounds = getObjectBounds(obj);
          if (bounds) {
              hasBounds = true;
              minX = Math.min(minX, bounds.x);
              minY = Math.min(minY, bounds.y);
              maxX = Math.max(maxX, bounds.x + bounds.w);
              maxY = Math.max(maxY, bounds.y + bounds.h);
          }
      });
      if (!hasBounds) return null;
      return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current; if (!canvas || !containerRef.current) return;
    const dpr = window.devicePixelRatio || 1; const rect = containerRef.current.getBoundingClientRect();
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) { canvas.width = rect.width * dpr; canvas.height = rect.height * dpr; }
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.scale(dpr, dpr); ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.fillStyle = '#1e1e1e'; ctx.fillRect(0, 0, rect.width, rect.height);

    if (showRulers) {
        ctx.save();
        ctx.fillStyle = '#111'; ctx.fillRect(0, 0, rect.width, 20); ctx.fillRect(0, 0, 20, rect.height); 
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1; ctx.font = '9px sans-serif'; ctx.fillStyle = '#aaa';
        const startX = -view.x / view.scale; const endX = startX + rect.width / view.scale; const stepX = view.scale > 2 ? 10 : view.scale > 0.5 ? 50 : 100;
        for(let x=Math.floor(startX/stepX)*stepX; x<endX; x+=stepX) { const sx = (x * view.scale) + view.x; if(sx > 20) { ctx.beginPath(); ctx.moveTo(sx, 15); ctx.lineTo(sx, 20); ctx.stroke(); if (x % 100 === 0) ctx.fillText(x.toString(), sx+2, 12); } }
        const startY = -view.y / view.scale; const endY = startY + rect.height / view.scale; const stepY = view.scale > 2 ? 10 : view.scale > 0.5 ? 50 : 100;
        for(let y=Math.floor(startY/stepY)*stepY; y<endY; y+=stepY) { const sy = (y * view.scale) + view.y; if(sy > 20) { ctx.beginPath(); ctx.moveTo(15, sy); ctx.lineTo(20, sy); ctx.stroke(); if (y % 100 === 0) { ctx.save(); ctx.translate(12, sy+2); ctx.rotate(-Math.PI/2); ctx.fillText(y.toString(), 0, 0); ctx.restore(); } } }
        ctx.restore();
    }

    ctx.save(); ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);
    
    ctx.strokeStyle = '#444'; ctx.lineWidth = 2 / view.scale; ctx.strokeRect(0, 0, docSize.w, docSize.h);
    ctx.fillStyle = '#151515'; ctx.fillRect(0, 0, docSize.w, docSize.h);

    const allObjects = [...objects];
    if (currentPath) allObjects.push(currentPath);
    if (currentShape) allObjects.push(currentShape);
    if (currentArrow) allObjects.push(currentArrow);

    allObjects.forEach(obj => {
        if (!obj.visible) return;
        if (isIsolateMode && selectedIds.length > 0 && !selectedIds.includes(obj.id)) {
             return;
        }
        
        ctx.save();
        
        if (obj.filters) { 
            const f = obj.filters; 
            ctx.filter = `brightness(${f.exposure}%) contrast(${f.contrast}%) saturate(${f.saturation}%) sepia(${f.warmth}%) blur(${f.blur}px)`; 
        }

        if (obj.type === 'mask') {
            const m = obj as MaskObject;
            if (m.points.length > 2) {
                ctx.beginPath();
                if (m.mode === 'isolate') {
                    ctx.rect(-20000, -20000, 40000, 40000); ctx.moveTo(m.points[0].x, m.points[0].y); for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y); ctx.closePath(); ctx.globalCompositeOperation = 'destination-out'; ctx.fill('evenodd');
                } else {
                    ctx.moveTo(m.points[0].x, m.points[0].y); for (let i = 1; i < m.points.length; i++) ctx.lineTo(m.points[i].x, m.points[i].y); ctx.closePath(); ctx.globalCompositeOperation = 'destination-out'; ctx.fill();
                }
            }
        }
        else if (obj.type === 'path') {
            const path = obj as PathObject; 
            if (path.points.length > 0) {
                if ((obj as PathObject).isEraser) ctx.globalCompositeOperation = 'destination-out'; else ctx.globalCompositeOperation = 'source-over';
                let strokeColor = path.color; if (path.isInpaint) strokeColor = hexToRgba(path.color, 0.5); else if (path.opacity < 1.0) strokeColor = hexToRgba(path.color, path.opacity);
                ctx.strokeStyle = strokeColor; ctx.lineWidth = path.lineWidth;
                if (path.isPen) {
                    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1.5 / view.scale; ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y); for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y); if (tool !== 'pen' || (path.id !== currentPath?.id)) ctx.closePath(); ctx.fillStyle = hexToRgba(path.color, 0.2); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; const nodeSize = 6 / view.scale; path.points.forEach(p => { ctx.fillRect(p.x - nodeSize/2, p.y - nodeSize/2, nodeSize, nodeSize); });
                } else {
                    if (path.isLasso) { ctx.setLineDash([5 / view.scale, 5 / view.scale]); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 / view.scale; } else { ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
                    ctx.beginPath(); ctx.moveTo(path.points[0].x, path.points[0].y); for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
                    if (path.isLasso) { ctx.closePath(); ctx.stroke(); ctx.strokeStyle = '#000000'; ctx.setLineDash([5 / view.scale, 5 / view.scale]); ctx.lineDashOffset = 5 / view.scale; ctx.stroke(); } else { ctx.stroke(); }
                }
            }
        } 
        else if (obj.type === 'rect') { const s = obj as ShapeObject; ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth; if(s.filled){ ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, s.w, s.h); } ctx.strokeRect(s.x, s.y, s.w, s.h); }
        else if (obj.type === 'circle') { const s = obj as ShapeObject; ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth; ctx.beginPath(); ctx.ellipse(s.x + s.w/2, s.y + s.h/2, Math.abs(s.w/2), Math.abs(s.h/2), 0, 0, 2*Math.PI); if(s.filled){ ctx.fillStyle = s.color; ctx.fill(); } ctx.stroke(); }
        else if (obj.type === 'arrow') { const arrow = obj as ArrowObject; const headlen = arrow.lineWidth * 3; const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1); ctx.strokeStyle = arrow.color; ctx.lineWidth = arrow.lineWidth; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(arrow.x1, arrow.y1); ctx.lineTo(arrow.x2, arrow.y2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(arrow.x2 - headlen * Math.cos(angle - Math.PI / 6), arrow.y2 - headlen * Math.sin(angle - Math.PI / 6)); ctx.lineTo(arrow.x2, arrow.y2); ctx.lineTo(arrow.x2 - headlen * Math.cos(angle + Math.PI / 6), arrow.y2 - headlen * Math.sin(angle + Math.PI / 6)); ctx.stroke(); }
        else if (obj.type === 'image') { const imgObj = obj as ImageObj; let img = imageCache.get(imgObj.id); if (!img) { img = new Image(); img.crossOrigin = "anonymous"; img.src = imgObj.src; imageCache.set(imgObj.id, img); } if (img.complete) { ctx.drawImage(img, imgObj.x, imgObj.y, imgObj.w, imgObj.h); } }
        else if (obj.type === 'text') { const t = obj as TextObject; if(textInput && textInput.id === obj.id) return; ctx.fillStyle = t.color; const fontName = t.fontFamily.split(',')[0].replace(/['"]/g, ''); ctx.font = `bold ${t.fontSize}px "${fontName}"`; ctx.textBaseline = 'top'; ctx.fillText(t.text, t.x, t.y); }
        
        if (obj.filters && (obj.filters.vignette > 0 || obj.filters.grain > 0 || obj.type === 'image')) {
            const bounds = getObjectBounds(obj);
            if (bounds) {
                if (obj.filters.vignette > 0) {
                    ctx.globalCompositeOperation = 'source-over'; 
                    const cx = bounds.x + bounds.w/2;
                    const cy = bounds.y + bounds.h/2;
                    const radius = Math.max(bounds.w, bounds.h) * 0.8;
                    const grad = ctx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
                    grad.addColorStop(0, 'rgba(0,0,0,0)');
                    grad.addColorStop(1, `rgba(0,0,0,${obj.filters.vignette/150})`); 
                    ctx.fillStyle = grad;
                    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
                }
                if (obj.filters.grain > 0 && noisePattern) {
                    ctx.globalCompositeOperation = 'overlay';
                    ctx.globalAlpha = obj.filters.grain / 200; 
                    ctx.fillStyle = noisePattern;
                    ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
                    ctx.globalAlpha = 1.0;
                }
            }
        }

        ctx.restore();
    });
    
    if (overlayType !== 'none') {
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)'; 
        ctx.lineWidth = 1 / view.scale; 
        ctx.beginPath();

        if (overlayType === 'thirds') { 
            ctx.moveTo(docSize.w / 3, 0); ctx.lineTo(docSize.w / 3, docSize.h); 
            ctx.moveTo(docSize.w * 2 / 3, 0); ctx.lineTo(docSize.w * 2 / 3, docSize.h); 
            ctx.moveTo(0, docSize.h / 3); ctx.lineTo(docSize.w, docSize.h / 3); 
            ctx.moveTo(0, docSize.h * 2 / 3); ctx.lineTo(docSize.w, docSize.h * 2 / 3); 
        } else if (overlayType === 'cross') { 
            ctx.moveTo(docSize.w / 2, 0); ctx.lineTo(docSize.w / 2, docSize.h); 
            ctx.moveTo(0, docSize.h / 2); ctx.lineTo(docSize.w, docSize.h / 2); 
        } else if (overlayType === 'golden') {
            const phi = 0.618;
            ctx.moveTo(docSize.w * phi, 0); ctx.lineTo(docSize.w * phi, docSize.h);
            ctx.moveTo(docSize.w * (1-phi), 0); ctx.lineTo(docSize.w * (1-phi), docSize.h);
            ctx.moveTo(0, docSize.h * phi); ctx.lineTo(docSize.w, docSize.h * phi);
            ctx.moveTo(0, docSize.h * (1-phi)); ctx.lineTo(docSize.w, docSize.h * (1-phi));
        } else if (overlayType === 'safe-zones') {
            const w90 = docSize.w * 0.9, h90 = docSize.h * 0.9;
            const x90 = (docSize.w - w90)/2, y90 = (docSize.h - h90)/2;
            ctx.rect(x90, y90, w90, h90);
            
            const w80 = docSize.w * 0.8, h80 = docSize.h * 0.8;
            const x80 = (docSize.w - w80)/2, y80 = (docSize.h - h80)/2;
            ctx.rect(x80, y80, w80, h80);
            
            ctx.setLineDash([5/view.scale, 5/view.scale]);
        } else if (overlayType === 'cinema-235') {
            const targetH = docSize.w / 2.35;
            const barH = (docSize.h - targetH) / 2;
            ctx.fillStyle = 'rgba(0,0,0,0.9)';
            ctx.fillRect(0, 0, docSize.w, barH);
            ctx.fillRect(0, docSize.h - barH, docSize.w, barH);
        }
        
        if (overlayType !== 'cinema-235') ctx.stroke();
        ctx.restore();
    }

    if (activeLasso) {
        ctx.save(); ctx.beginPath(); ctx.moveTo(activeLasso.points[0].x, activeLasso.points[0].y); for (let i = 1; i < activeLasso.points.length; i++) ctx.lineTo(activeLasso.points[i].x, activeLasso.points[i].y); ctx.closePath();
        const offset = (Date.now() / 50) % 16; ctx.lineWidth = 2 / view.scale; ctx.strokeStyle = 'white'; ctx.setLineDash([8 / view.scale, 8 / view.scale]); ctx.lineDashOffset = -offset / view.scale; ctx.stroke(); ctx.strokeStyle = 'black'; ctx.setLineDash([8 / view.scale, 8 / view.scale]); ctx.lineDashOffset = -(offset - 8) / view.scale; ctx.stroke(); ctx.fillStyle = 'rgba(0, 229, 255, 0.1)'; ctx.fill(); ctx.restore();
    }
    
    if (activeFrame) {
        const offset = (Date.now() / 50) % 16; ctx.fillStyle = 'rgba(128, 0, 255, 0.1)'; ctx.strokeStyle = '#a855f7'; ctx.lineWidth = 2 / view.scale; ctx.setLineDash([10 / view.scale, 5 / view.scale]); ctx.lineDashOffset = -offset / view.scale;
        const rx = activeFrame.w < 0 ? activeFrame.x + activeFrame.w : activeFrame.x; const ry = activeFrame.h < 0 ? activeFrame.y + activeFrame.h : activeFrame.y; const rw = Math.abs(activeFrame.w); const rh = Math.abs(activeFrame.h);
        ctx.fillRect(rx, ry, rw, rh); ctx.strokeRect(rx, ry, rw, rh);
        ctx.fillStyle = '#a855f7'; ctx.fillRect(rx, ry - (20/view.scale), 100/view.scale, 20/view.scale); ctx.fillStyle = '#fff'; ctx.font = `bold ${11/view.scale}px sans-serif`; ctx.textBaseline = 'middle'; ctx.fillText("Generative Fill", rx + 5/view.scale, ry - 10/view.scale);
    }

    if (selectionBox) { ctx.fillStyle = 'rgba(0, 229, 255, 0.15)'; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 1 / view.scale; ctx.fillRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h); ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h); }
    
    if (selectedIds.length > 0) {
        const bounds = getCombinedBounds(selectedIds);
        if (bounds) {
            ctx.save(); ctx.filter = 'none'; ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2 / view.scale; ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h); 
            ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 0; const hSz = 8 / view.scale; 
            const drawHandle = (x: number, y: number) => { ctx.beginPath(); ctx.rect(x - hSz/2, y - hSz/2, hSz, hSz); ctx.fill(); ctx.stroke(); }; 
            drawHandle(bounds.x, bounds.y); drawHandle(bounds.x + bounds.w, bounds.y); drawHandle(bounds.x, bounds.y + bounds.h); drawHandle(bounds.x + bounds.w, bounds.y + bounds.h); 
            ctx.restore();
        }
    }
    
    ctx.save(); ctx.fillStyle = '#666'; ctx.font = `${12 / view.scale}px sans-serif`; ctx.fillText(`${docSize.w} x ${docSize.h}`, 0, -15 / view.scale); ctx.restore();

    ctx.restore(); 
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const isPointInRect = (wx: number, wy: number, r: {x:number, y:number, w:number, h:number}) => { const rx = r.w < 0 ? r.x + r.w : r.x; const ry = r.h < 0 ? r.y + r.h : r.y; return wx >= rx && wx <= rx + Math.abs(r.w) && wy >= ry && wy <= ry + Math.abs(r.h); };

  const getHandleUnderMouse = (wx: number, wy: number, bounds: {x:number, y:number, w:number, h:number}): HandleType => {
      const handleSize = 10 / view.scale; const hitBuffer = handleSize * 2;
      if (Math.abs(wx - bounds.x) < hitBuffer && Math.abs(wy - bounds.y) < hitBuffer) return 'tl';
      if (Math.abs(wx - (bounds.x + bounds.w)) < hitBuffer && Math.abs(wy - bounds.y) < hitBuffer) return 'tr';
      if (Math.abs(wx - bounds.x) < hitBuffer && Math.abs(wy - (bounds.y + bounds.h)) < hitBuffer) return 'bl';
      if (Math.abs(wx - (bounds.x + bounds.w)) < hitBuffer && Math.abs(wy - (bounds.y + bounds.h)) < hitBuffer) return 'br';
      return null;
  };

  const handleWheel = (e: React.WheelEvent) => {
      e.preventDefault();
      const zoomIn = e.deltaY < 0;
      const zoomFactor = zoomIn ? 1.1 : 0.9;
      const newScale = Math.min(Math.max(view.scale * zoomFactor, 0.05), 10);
      const rect = containerRef.current!.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const wx = (mx - view.x) / view.scale;
      const wy = (my - view.y) / view.scale;
      setView({ scale: newScale, x: mx - wx * newScale, y: my - wy * newScale });
  };

  const commitText = () => { 
      const val = inputValueRef.current.trim();
      if (!textInput || !val) { setTextInput(null); setInputValue(""); return; } 
      if (textInput.id) {
          setObjects(prev => prev.map(o => o.id === textInput.id ? { ...o, text: val, color, fontFamily: selectedFont, fontSize } : o) as CanvasObject[]);
          setSelectedIds([textInput.id]);
      } else {
          const newText: TextObject = { id: Date.now().toString(), type: 'text', name: val.substring(0, 10), color: color, lineWidth: 1, x: textInput.x, y: textInput.y, text: val, fontFamily: selectedFont, fontSize: fontSize, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }; 
          setObjects(prev => [...prev, newText]); setSelectedIds([newText.id]); 
      }
      setTextInput(null); setInputValue(""); setTool('select');
  };

  const startEditingText = (id: string) => {
      const obj = objects.find(o => o.id === id);
      if (obj && obj.type === 'text') {
          const t = obj as TextObject;
          setTextInput({ x: t.x, y: t.y, id: t.id });
          setInputValue(t.text);
          setColor(t.color);
          setFontSize(t.fontSize);
          setSelectedFont(t.fontFamily);
          setTimeout(() => { const inputEl = document.getElementById('char-floating-input'); if(inputEl) inputEl.focus(); }, 50); 
      }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault();
    const screenCoords = getCoordinates(e); const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);
    if (activeLasso && tool !== 'lasso') setActiveLasso(null); if (activeLasso && tool === 'lasso') setActiveLasso(null);
    if (activeFrame && tool !== 'frame') setActiveFrame(null); 
    if (tool === 'hand' || (e as React.MouseEvent).button === 1 || (e as React.MouseEvent).buttons === 4) { setIsPanning(true); setPanStart(screenCoords); return; }
    
    if (tool === 'text') { 
        if (textInput) { commitText(); return; } 
        setTextInput({ x: worldCoords.x, y: worldCoords.y }); setInputValue(""); 
        setTimeout(() => { const inputEl = document.getElementById('char-floating-input'); if(inputEl) inputEl.focus(); }, 50); 
        return; 
    }

    if (tool === 'pen') {
        if (!currentPath) { setCurrentPath({ id: Date.now().toString(), type: 'path', name: 'Mask Poly', color: '#00e5ff', lineWidth: 1, isEraser: false, isPen: true, opacity: 1.0, points: [worldCoords], visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }); } 
        else { setCurrentPath(prev => prev ? { ...prev, points: [...prev.points, worldCoords] } : null); }
        return;
    }

    if (tool === 'frame') { setActiveFrame({ x: worldCoords.x, y: worldCoords.y, w: 0, h: 0 }); setIsDragging(true); setDragStart(worldCoords); return; }

    if (tool === 'select') {
        if (textInput) { commitText(); return; }
        const isMulti = (e as React.MouseEvent).shiftKey;
        if (selectedIds.length > 0) {
            const bounds = getCombinedBounds(selectedIds);
            if (bounds) {
                const handle = getHandleUnderMouse(worldCoords.x, worldCoords.y, bounds);
                if (handle) { setActiveHandle(handle); setOriginalBounds(bounds); const states: Record<string, CanvasObject> = {}; selectedIds.forEach(id => { const obj = objects.find(o => o.id === id); if (obj) states[id] = JSON.parse(JSON.stringify(obj)); }); setOriginalObjStates(states); setDragStart(worldCoords); setIsDragging(true); return; }
            }
        }
        let foundId = null;
        for (let i = objects.length - 1; i >= 0; i--) { const obj = objects[i]; if (!obj.visible || obj.locked) continue; const bounds = getObjectBounds(obj); if (bounds && isPointInRect(worldCoords.x, worldCoords.y, bounds)) { foundId = obj.id; break; } }
        
        if (foundId && (e as React.MouseEvent).detail === 2) {
            const obj = objects.find(o => o.id === foundId);
            if (obj && obj.type === 'text') {
                startEditingText(obj.id);
                return;
            }
        }

        if (foundId) { if (isMulti) { if (selectedIds.includes(foundId)) { setSelectedIds(prev => prev.filter(id => id !== foundId)); } else { setSelectedIds(prev => [...prev, foundId]); } } else { if (!selectedIds.includes(foundId)) { setSelectedIds([foundId]); } } setIsDragging(true); setDragStart(worldCoords); } 
        else { if (!isMulti) setSelectedIds([]); setIsDragging(true); setDragStart(worldCoords); setSelectionBox({ x: worldCoords.x, y: worldCoords.y, w: 0, h: 0 }); }
        return;
    }
    setIsDragging(true); setDragStart(worldCoords);
    if (tool === 'brush' || tool === 'eraser' || tool === 'inpaint' || tool === 'lasso') { setCurrentPath({ id: Date.now().toString(), type: 'path', name: tool, color: color, lineWidth: tool === 'eraser' ? brushSize * 4 : brushSize * 2, isEraser: tool === 'eraser', isInpaint: tool === 'inpaint', isLasso: tool === 'lasso', isPen: false, opacity: tool === 'brush' ? brushOpacity : 1.0, points: [worldCoords], visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }); } 
    else if (tool === 'rect' || tool === 'circle') { setCurrentShape({ id: Date.now().toString(), type: tool, name: tool, color: color, lineWidth: brushSize, filled: isShapeFilled, x: worldCoords.x, y: worldCoords.y, w: 0, h: 0, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }); } 
    else if (tool === 'arrow') { setCurrentArrow({ id: Date.now().toString(), type: 'arrow', name: 'Arrow', color: color, lineWidth: brushSize, x1: worldCoords.x, y1: worldCoords.y, x2: worldCoords.x, y2: worldCoords.y, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }); }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault();
    const screenCoords = getCoordinates(e);
    if (cursorRef.current && containerRef.current) {
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        if (['brush', 'eraser', 'inpaint', 'lasso', 'pen'].includes(tool)) { cursorRef.current.style.transform = `translate(${clientX}px, ${clientY}px)`; const visualSize = (tool === 'eraser' ? brushSize * 4 : brushSize * 2) * view.scale; cursorRef.current.style.width = `${visualSize}px`; cursorRef.current.style.height = `${visualSize}px`; cursorRef.current.style.display = 'block'; } else { cursorRef.current.style.display = 'none'; }
    }
    const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);
    if (isPanning && panStart) { const dx = screenCoords.x - panStart.x; const dy = screenCoords.y - panStart.y; setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy })); setPanStart(screenCoords); return; }
    if (!isDragging || !dragStart) return;
    
    if (tool === 'frame' && activeFrame) {
        setActiveFrame(prev => prev ? { ...prev, w: worldCoords.x - prev.x, h: worldCoords.y - prev.y } : null);
        return;
    }

    if (tool === 'select' && selectedIds.length === 1 && !activeHandle) {
        if (Math.abs(worldCoords.x - 0) < 10) worldCoords.x = 0;
        if (Math.abs(worldCoords.x - docSize.w) < 10) worldCoords.x = docSize.w;
        if (Math.abs(worldCoords.y - 0) < 10) worldCoords.y = 0;
        if (Math.abs(worldCoords.y - docSize.h) < 10) worldCoords.y = docSize.h;
    }

    if (activeHandle && selectedIds.length > 0 && originalBounds) {
        const dx = worldCoords.x - dragStart.x; const dy = worldCoords.y - dragStart.y; let newX = originalBounds.x, newY = originalBounds.y, newW = originalBounds.w, newH = originalBounds.h;
        if (activeHandle.includes('r')) newW += dx; if (activeHandle.includes('b')) newH += dy; if (activeHandle.includes('l')) { newX += dx; newW -= dx; } if (activeHandle.includes('t')) { newY += dy; newH -= dy; }
        
        const firstObj = objects.find(o => o.id === selectedIds[0]);
        if (firstObj && firstObj.type === 'image') {
             const ratio = originalBounds.w / originalBounds.h;
             if (activeHandle.includes('r') || activeHandle.includes('l')) newH = newW / ratio;
             else newW = newH * ratio;
        }

        const scaleX = newW / originalBounds.w; const scaleY = newH / originalBounds.h;
        setObjects(prev => prev.map(obj => {
            if (!selectedIds.includes(obj.id)) return obj; const orig = originalObjStates[obj.id]; if (!orig) return obj;
            if (orig.type === 'rect' || orig.type === 'circle' || orig.type === 'image') { const s = orig as ShapeObject | ImageObj; const relX = s.x - originalBounds.x; const relY = s.y - originalBounds.y; return { ...obj, x: newX + (relX * scaleX), y: newY + (relY * scaleY), w: s.w * scaleX, h: s.h * scaleY } as ShapeObject | ImageObj; }
            return obj;
        })); return;
    }
    if (tool === 'select') {
        if (selectionBox) { setSelectionBox({ x: Math.min(dragStart.x, worldCoords.x), y: Math.min(dragStart.y, worldCoords.y), w: Math.abs(worldCoords.x - dragStart.x), h: Math.abs(worldCoords.y - dragStart.y) }); } 
        else if (selectedIds.length > 0) { const dx = worldCoords.x - dragStart.x; const dy = worldCoords.y - dragStart.y; setObjects(prev => prev.map(obj => { if (!selectedIds.includes(obj.id)) return obj; if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'image') { const s = obj as ShapeObject | ImageObj; return { ...s, x: s.x + dx, y: s.y + dy }; } else if (obj.type === 'text') { const t = obj as TextObject; return { ...t, x: t.x + dx, y: t.y + dy }; } else if (obj.type === 'path') { const p = obj as PathObject; return { ...p, points: p.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) }; } else if (obj.type === 'arrow') { const a = obj as ArrowObject; return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }; } else if (obj.type === 'mask') { const m = obj as MaskObject; return { ...m, points: m.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) }; } return obj; })); setDragStart(worldCoords); }
        return;
    }
    if ((tool === 'brush' || tool === 'eraser' || tool === 'inpaint' || tool === 'lasso' || tool === 'pen') && currentPath) { setCurrentPath(prev => prev ? { ...prev, points: [...prev.points, worldCoords] } : null); } else if ((tool === 'rect' || tool === 'circle') && currentShape) { setCurrentShape(prev => prev ? { ...prev, w: worldCoords.x - prev.x, h: worldCoords.y - prev.y } : null); } else if (tool === 'arrow' && currentArrow) { setCurrentArrow(prev => prev ? { ...prev, x2: worldCoords.x, y2: worldCoords.y } : null); }
  };

  const handleMouseUp = () => {
    if (isPanning) { setIsPanning(false); setPanStart(null); return; }
    if (isDragging) {
        if (selectionBox) {
            const foundIds: string[] = [];
            for (let i = objects.length - 1; i >= 0; i--) { const obj = objects[i]; if (!obj.visible || obj.locked) continue; const bounds = getObjectBounds(obj); if (bounds) { const intersect = !(bounds.x > selectionBox.x + selectionBox.w || bounds.x + bounds.w < selectionBox.x || bounds.y > selectionBox.y + selectionBox.h || bounds.y + bounds.h < selectionBox.y); if (intersect) foundIds.push(obj.id); } }
            setSelectedIds(foundIds); setSelectionBox(null);
        }
        if (tool === 'lasso' && currentPath && currentPath.points.length > 2) { setActiveLasso({ points: currentPath.points }); setCurrentPath(null); setIsDragging(false); return; }
        if (tool === 'frame' && activeFrame) { setIsDragging(false); return; } 
        
        if (currentPath) { setObjects(prev => [...prev, currentPath]); setCurrentPath(null); } if (currentShape) { if (Math.abs(currentShape.w) > 5) setObjects(prev => [...prev, currentShape]); setCurrentShape(null); } if (currentArrow) { setObjects(prev => [...prev, currentArrow]); setCurrentArrow(null); }
        setIsDragging(false); setActiveHandle(null); setOriginalBounds(null); setOriginalObjStates({});
    }
  };

  const finishPenPath = () => {
      if (currentPath && currentPath.points.length > 2) {
          if (tool === 'pen') {
              setActiveLasso({ points: currentPath.points }); 
              setCurrentPath(null);
          } else {
              setObjects(prev => [...prev, currentPath]);
              setCurrentPath(null);
          }
      }
  };

  const applyLassoAction = (mode: 'erase' | 'isolate') => {
      if (!activeLasso) return;
      const newMask: MaskObject = { id: Date.now().toString(), type: 'mask', name: mode === 'erase' ? 'Pixel Erase' : 'Isolate', color: '#000', lineWidth: 0, visible: true, locked: false, points: activeLasso.points, mode: mode, filters: { ...DEFAULT_FILTERS } };
      setObjects(prev => [...prev, newMask]); setActiveLasso(null);
  };

  const getMaskDataURL = (points: Point[], width: number, height: number): string | null => {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); if (!ctx) return null;
      ctx.fillStyle = 'black'; ctx.fillRect(0, 0, width, height); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y); ctx.closePath(); ctx.fillStyle = 'white'; ctx.fill(); return canvas.toDataURL('image/png');
  };

  const handleMergeLayers = async () => {
      if (selectedIds.length < 2) return;
      const bounds = getCombinedBounds(selectedIds); if (!bounds) return;
      const tempCanvas = document.createElement('canvas'); tempCanvas.width = bounds.w; tempCanvas.height = bounds.h; const tCtx = tempCanvas.getContext('2d'); if (!tCtx) return;
      tCtx.translate(-bounds.x, -bounds.y);
      objects.forEach(obj => { if (!selectedIds.includes(obj.id)) return; if (obj.type === 'image') { const i = obj as ImageObj; const img = imageCache.get(i.id); if (img) tCtx.drawImage(img, i.x, i.y, i.w, i.h); } else if (obj.type === 'rect') { const s = obj as ShapeObject; tCtx.strokeStyle = s.color; tCtx.lineWidth = s.lineWidth; tCtx.strokeRect(s.x, s.y, s.w, s.h); } });
      const mergedUrl = tempCanvas.toDataURL('image/png');
      const newImgObj: ImageObj = { id: Date.now().toString(), type: 'image', name: 'Merged Layer', color: '#fff', lineWidth: 0, src: mergedUrl, x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } };
      setObjects(prev => { const kept = prev.filter(o => !selectedIds.includes(o.id)); return [...kept, newImgObj]; }); setSelectedIds([newImgObj.id]);
  };

  const handleLassoMagicErase = async () => {
      if (!activeLasso) return; setIsGenerating(true); setGenStatusMsg("AI Patching...");
      try {
          const tempCanvas = document.createElement('canvas'); tempCanvas.width = docSize.w; tempCanvas.height = docSize.h; const tCtx = tempCanvas.getContext('2d'); if(!tCtx) throw new Error("Canvas Error");
          objects.forEach(obj => { if (!obj.visible) return; if (obj.type === 'image') { const i = obj as ImageObj; const img = imageCache.get(i.id); if(img) tCtx.drawImage(img, i.x, i.y, i.w, i.h); } });
          const sourceImage = tempCanvas.toDataURL('image/png');
          const maskImage = getMaskDataURL(activeLasso.points, docSize.w, docSize.h); if (!maskImage) throw new Error("Mask Generation Failed");
          const prompt = "Remove the object highlighted by the white area in the second image (mask) from the first image. Fill the removed area with logical background context, seamless texture, and lighting matching the surroundings. High quality, photorealistic inpainting.";
          const resultUrl = await generateImage(prompt, [sourceImage, maskImage], initialAspectRatio || "16:9", imageModel);
          const img = new Image(); img.src = resultUrl;
          img.onload = () => { 
              const newImgObj: ImageObj = { id: Date.now().toString(), type: 'image', name: 'Patch Layer', color: '#fff', lineWidth: 0, src: resultUrl, x: 0, y: 0, w: docSize.w, h: docSize.h, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }; 
              setObjects(prev => [...prev, newImgObj]); 
              setActiveLasso(null);
              // Auto-switch to select mode and select new layer
              setTool('select');
              setSelectedIds([newImgObj.id]);
          };
      } catch (e) { alert("Magic Erase Failed: " + e); } finally { setIsGenerating(false); setGenStatusMsg("Generating..."); setActiveLasso(null); }
  };

  const handleSmartCutAndHeal = async () => {
      if (!activeLasso) return; setIsGenerating(true); setGenStatusMsg("Splitting Object...");
      try {
          const cutoutCanvas = document.createElement('canvas'); cutoutCanvas.width = docSize.w; cutoutCanvas.height = docSize.h; const cCtx = cutoutCanvas.getContext('2d'); if(!cCtx) throw new Error("Canvas Error");
          cCtx.beginPath(); cCtx.moveTo(activeLasso.points[0].x, activeLasso.points[0].y); for(let i=1; i<activeLasso.points.length; i++) cCtx.lineTo(activeLasso.points[i].x, activeLasso.points[i].y); cCtx.closePath(); cCtx.clip();
          objects.forEach(obj => { if (!obj.visible || obj.type !== 'image') return; const i = obj as ImageObj; const img = imageCache.get(i.id); if(img) cCtx.drawImage(img, i.x, i.y, i.w, i.h); });
          const cutoutUrl = cutoutCanvas.toDataURL('image/png');
          const tempCanvas = document.createElement('canvas'); tempCanvas.width = docSize.w; tempCanvas.height = docSize.h; const tCtx = tempCanvas.getContext('2d'); if(!tCtx) throw new Error("Canvas Error");
          objects.forEach(obj => { if (!obj.visible) return; if (obj.type === 'image') { const i = obj as ImageObj; const img = imageCache.get(i.id); if(img) tCtx.drawImage(img, i.x, i.y, i.w, i.h); } });
          const sourceImage = tempCanvas.toDataURL('image/png');
          const maskImage = getMaskDataURL(activeLasso.points, docSize.w, docSize.h); if(!maskImage) throw new Error("Mask Error");
          
          const prompt = "Remove the masked object completely. Fill the area with appropriate background (floor, walls, scenery) to look natural and empty. Seamless blending.";
          const backgroundUrl = await generateImage(prompt, [sourceImage, maskImage], initialAspectRatio || "16:9", imageModel);
          
          const bgObj: ImageObj = { id: Date.now().toString(), type: 'image', name: 'Background Patch', color: '#fff', lineWidth: 0, src: backgroundUrl, x: 0, y: 0, w: docSize.w, h: docSize.h, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } };
          const cutObj: ImageObj = { id: (Date.now() + 1).toString(), type: 'image', name: 'Extracted Object', color: '#fff', lineWidth: 0, src: cutoutUrl, x: 0, y: 0, w: docSize.w, h: docSize.h, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } };
          
          setObjects(prev => [...prev, bgObj, cutObj]); 
          setLocalAssetHistory(prev => [backgroundUrl, cutoutUrl, ...prev]);
          setActiveLasso(null); setTool('select'); setSelectedIds([cutObj.id]); 
      } catch (e) { alert("Smart Cut Failed: " + e); setActiveLasso(null); } finally { setIsGenerating(false); setGenStatusMsg("Generating..."); setActiveLasso(null); }
  };

  const handleFrameGenerate = async () => {
      if (!activeFrame) return;
      setIsGenerating(true); setGenStatusMsg("Outpainting...");
      try {
          const fx = activeFrame.w < 0 ? activeFrame.x + activeFrame.w : activeFrame.x;
          const fy = activeFrame.h < 0 ? activeFrame.y + activeFrame.h : activeFrame.y;
          const fw = Math.abs(activeFrame.w);
          const fh = Math.abs(activeFrame.h);
          if (fw < 10 || fh < 10) return; 

          const tempCanvas = document.createElement('canvas'); tempCanvas.width = fw; tempCanvas.height = fh; const ctx = tempCanvas.getContext('2d'); if (!ctx) return;
          ctx.translate(-fx, -fy);
          
          objects.forEach(obj => {
             if (!obj.visible) return;
             if (obj.type === 'image') { const i = obj as ImageObj; const img = imageCache.get(i.id); if (img) ctx.drawImage(img, i.x, i.y, i.w, i.h); }
             else if (obj.type === 'rect') { const s = obj as ShapeObject; ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth; if(s.filled){ctx.fillStyle=s.color;ctx.fillRect(s.x,s.y,s.w,s.h);} ctx.strokeRect(s.x, s.y, s.w, s.h); }
          });

          const srcImg = tempCanvas.toDataURL('image/png');
          const genPrompt = prompt ? `${prompt}. Seamlessly fill transparent areas.` : "Outpainting. Fill the empty space seamlessly. High resolution.";
          const newImageUrl = await generateImage(genPrompt, [srcImg], initialAspectRatio || "16:9", imageModel);

          const newImgObj: ImageObj = { id: Date.now().toString(), type: 'image', name: 'Frame Gen', color: '#fff', lineWidth: 0, src: newImageUrl, x: fx, y: fy, w: fw, h: fh, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } };
          setObjects(prev => [...prev, newImgObj]); setLocalAssetHistory(prev => [newImageUrl, ...prev]);
          setActiveFrame(null); setTool('select'); setSelectedIds([newImgObj.id]);
      } catch(e) { console.error(e); alert("Frame Gen Failed"); } finally { setIsGenerating(false); setGenStatusMsg("Generating..."); }
  };

  const handleSaveAndClose = async () => {
      const tempCanvas = document.createElement('canvas'); 
      tempCanvas.width = docSize.w; 
      tempCanvas.height = docSize.h; 
      const tCtx = tempCanvas.getContext('2d'); 
      if(!tCtx) return;
      tCtx.fillStyle = '#000000'; tCtx.fillRect(0,0,docSize.w, docSize.h);
      
      objects.forEach(obj => {
         if (!obj.visible) return;
         if (obj.type === 'mask') { const m = obj as MaskObject; tCtx.save(); tCtx.beginPath(); if (m.mode === 'isolate') { tCtx.rect(-20000, -20000, 40000, 40000); tCtx.moveTo(m.points[0].x, m.points[0].y); for (let i = 1; i < m.points.length; i++) tCtx.lineTo(m.points[i].x, m.points[i].y); tCtx.closePath(); tCtx.globalCompositeOperation = 'destination-out'; tCtx.fill('evenodd'); } else { tCtx.moveTo(m.points[0].x, m.points[0].y); for (let i = 1; i < m.points.length; i++) tCtx.lineTo(m.points[i].x, m.points[i].y); tCtx.closePath(); tCtx.globalCompositeOperation = 'destination-out'; tCtx.fill(); } tCtx.restore(); return; }
         
         tCtx.save();
         if (obj.filters) {
             const { exposure, contrast, saturation, warmth, blur } = obj.filters;
             tCtx.filter = `brightness(${exposure}%) contrast(${contrast}%) saturate(${saturation}%) sepia(${warmth}%) blur(${blur}px)`;
         }

         if (obj.type === 'text') { const t = obj as TextObject; tCtx.fillStyle = t.color; const fontName = t.fontFamily.split(',')[0].replace(/['"]/g, ''); tCtx.font = `bold ${t.fontSize}px "${fontName}"`; tCtx.textBaseline = 'top'; tCtx.fillText(t.text, t.x, t.y); } else if (obj.type === 'image') { const i = obj as ImageObj; const img = imageCache.get(i.id) || new Image(); if(!img.src) img.src = i.src; tCtx.drawImage(img, i.x, i.y, i.w, i.h); } else if (obj.type === 'rect') { const s = obj as ShapeObject; tCtx.strokeStyle = s.color; tCtx.lineWidth = s.lineWidth; if(s.filled) {tCtx.fillStyle=s.color; tCtx.fillRect(s.x, s.y, s.w, s.h);} tCtx.strokeRect(s.x, s.y, s.w, s.h); } else if (obj.type === 'circle') { const s = obj as ShapeObject; tCtx.strokeStyle = s.color; tCtx.lineWidth = s.lineWidth; tCtx.beginPath(); tCtx.ellipse(s.x + s.w/2, s.y + s.h/2, Math.abs(s.w/2), Math.abs(s.h/2), 0, 0, 2*Math.PI); if(s.filled) {tCtx.fillStyle=s.color; tCtx.fill();} tCtx.stroke(); } else if (obj.type === 'path') { const p = obj as PathObject; if (p.points.length > 1) { tCtx.beginPath(); let strokeColor = p.color; if(p.isInpaint) strokeColor = hexToRgba(p.color, 0.5); else if(p.opacity < 1.0) strokeColor = hexToRgba(p.color, p.opacity); tCtx.strokeStyle = strokeColor; tCtx.lineWidth = p.lineWidth; if (p.isLasso) { tCtx.setLineDash([5, 5]); } else { tCtx.lineCap = 'round'; tCtx.lineJoin = 'round'; } tCtx.moveTo(p.points[0].x, p.points[0].y); for (let i = 1; i < p.points.length; i++) tCtx.lineTo(p.points[i].x, p.points[i].y); if (p.isLasso) tCtx.closePath(); tCtx.stroke(); } }
         
         // Apply complex overlays (Grain/Vignette)
         if (obj.filters && (obj.filters.vignette > 0 || obj.filters.grain > 0)) {
             const bounds = { x: (obj as any).x, y: (obj as any).y, w: (obj as any).w, h: (obj as any).h };
             if (bounds.w) {
                 if (obj.filters.vignette > 0) {
                     tCtx.globalCompositeOperation = 'source-over';
                     const cx = bounds.x + bounds.w/2;
                     const cy = bounds.y + bounds.h/2;
                     const radius = Math.max(bounds.w, bounds.h) * 0.8;
                     const grad = tCtx.createRadialGradient(cx, cy, radius * 0.4, cx, cy, radius);
                     grad.addColorStop(0, 'rgba(0,0,0,0)');
                     grad.addColorStop(1, `rgba(0,0,0,${obj.filters.vignette/150})`);
                     tCtx.fillStyle = grad;
                     tCtx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
                 }
                 if (obj.filters.grain > 0 && noisePattern) {
                     tCtx.globalCompositeOperation = 'overlay';
                     tCtx.globalAlpha = obj.filters.grain / 200;
                     tCtx.fillStyle = noisePattern;
                     tCtx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
                     tCtx.globalAlpha = 1.0;
                 }
             }
         }

         tCtx.restore();
      });
      const finalImage = tempCanvas.toDataURL('image/png');
      onSave(finalImage);
      if (isDriveConnected) { onNotify?.("Uploading Edit...", "info"); const filename = `project_${Date.now()}.psd`; await driveService.uploadImage(finalImage, filename, 'Characters'); onNotify?.("Saved to Drive", "success"); }
      onClose();
  };
  
  const handleEnhancePrompt = async () => { setIsEnhancing(true); try { setPrompt(await enhancePrompt(prompt)); } catch (e) { console.error(e); } finally { setIsEnhancing(false); } };
  
  const handleGenerateNew = async () => { 
      if (!prompt) return; 
      setIsGenerating(true); 
      try { 
          const refUrls = references.map(r => r.src);
          const refs = [imageUrl || "", ...refUrls].filter(Boolean); 
          let finalPrompt = prompt; 
          
          if (selectedIds.length === 1) {
              const selectedObj = objects.find(o => o.id === selectedIds[0]);
              if (selectedObj && selectedObj.type === 'image') {
                  finalPrompt = `[Edit Context: Focusing on selected layer]. ${prompt}`;
                  refs.unshift((selectedObj as ImageObj).src);
              }
          }
          const newImageUrl = await generateImage(finalPrompt, refs, initialAspectRatio || "16:9", imageModel); 
          const img = new Image(); img.crossOrigin = "anonymous"; img.src = newImageUrl; 
          img.onload = () => { 
              const newImgObj: ImageObj = { id: Date.now().toString(), type: 'image', name: 'Gen Result', color: '#fff', lineWidth: 0, src: newImageUrl, x: (docSize.w - img.naturalWidth)/2, y: (docSize.h - img.naturalHeight)/2, w: img.naturalWidth, h: img.naturalHeight, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }; 
              setObjects(prev => [...prev, newImgObj]); setLocalAssetHistory(prev => [newImageUrl, ...prev]);
          }; 
      } catch (e) { alert("Generation failed: " + e); } finally { setIsGenerating(false); } 
  };

  const handleDocPreset = (w: number, h: number) => { 
      setDocSize({ w, h }); 
      if (containerRef.current) { 
          const cw = containerRef.current.clientWidth; const ch = containerRef.current.clientHeight; const padding = 60; const scale = Math.min((cw - padding) / w, (ch - padding) / h, 1); 
          setView({ scale, x: (cw - w * scale) / 2, y: (ch - h * scale) / 2 }); 
      }
      setShowResMenu(false);
  };

  const getLassoMenuPos = () => { if (!activeLasso || activeLasso.points.length === 0) return null; let minX = activeLasso.points[0].x, maxX = activeLasso.points[0].x; let minY = activeLasso.points[0].y, maxY = activeLasso.points[0].y; activeLasso.points.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; }); const centerX = (minX + maxX) / 2; const topY = minY; return worldToScreen(centerX, topY); };
  const getFrameMenuPos = () => { if (!activeFrame) return null; const centerX = activeFrame.x + (activeFrame.w/2); const bottomY = activeFrame.h > 0 ? activeFrame.y + activeFrame.h : activeFrame.y; return worldToScreen(centerX, bottomY); };
  
  const lassoPos = getLassoMenuPos();
  const framePos = getFrameMenuPos();
  const selectedObject = selectedIds.length === 1 ? objects.find(o => o.id === selectedIds[0]) : null;
  const inputScreenPos = textInput ? worldToScreen(textInput.x, textInput.y) : null;

  const handleClearAll = () => {
      if (objects.length === 0) return;
      if (window.confirm("Are you sure you want to clear all layers?")) {
          setObjects([]);
          setSelectedIds([]);
      }
  };

  return createPortal(
    <div 
        className="fixed inset-0 z-[60] flex flex-col bg-[#1e1e1e] text-[#f1f5f9]"
        onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'copy'; }}
        onDrop={(e) => { 
            e.preventDefault(); e.stopPropagation(); 
            const assetJson = e.dataTransfer.getData('application/react-dnd-asset');
            if (assetJson) {
                try {
                    const asset = JSON.parse(assetJson);
                    if (asset.image) {
                        const img = new Image(); img.src = asset.image; 
                        img.onload = () => { 
                            if (!containerRef.current) return;
                            const newImg: ImageObj = { id: Date.now().toString(), type: 'image', name: asset.name, color: '#fff', lineWidth: 0, src: asset.image, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }; 
                            setObjects(prev => [...prev, newImg]); setTool('select'); setSelectedIds([newImg.id]); 
                        };
                    }
                } catch(e) { console.error(e); }
                return;
            }
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) { const file = e.dataTransfer.files[0]; if (file.type.startsWith('image/')) { const reader = new FileReader(); reader.onload = ev => { const src = ev.target?.result as string; const img = new Image(); img.src = src; img.onload = () => { if (!containerRef.current) return; const newImg: ImageObj = { id: Date.now().toString(), type: 'image', name: file.name || 'Image Layer', color: '#fff', lineWidth: 0, src: src, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }; setObjects(prev => [...prev, newImg]); setTool('select'); setSelectedIds([newImg.id]); }; }; reader.readAsDataURL(file); } } 
        }}
    >
        <div ref={cursorRef} style={{ position: 'fixed', top: 0, left: 0, pointerEvents: 'none', zIndex: 9999, borderRadius: '50%', border: '2px solid white', boxShadow: '0 0 4px rgba(0,0,0,0.8)', transform: 'translate(-50%, -50%)', display: 'none', backgroundColor: 'rgba(255, 255, 255, 0.1)' }} />
        {textInput && inputScreenPos && ( <input id="char-floating-input" type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') commitText(); e.stopPropagation(); }} autoFocus onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', left: inputScreenPos.x, top: inputScreenPos.y, color: color, fontFamily: selectedFont, fontSize: `${fontSize * view.scale}px`, fontWeight: 'bold', zIndex: 2000, transform: 'translateY(-50%)', width: 'auto', minWidth: '100px', maxWidth: '80vw' }} className="bg-[var(--bg-card)] border border-[var(--accent)] rounded px-2 py-1 outline-none shadow-xl text-[var(--text-main)] backdrop-blur-md" /> )}
        
        {/* Lasso Menu */}
        {activeLasso && lassoPos && (
            <div className="absolute z-[2000] flex flex-col gap-1 items-center animate-fade-in-up" style={{ left: lassoPos.x, top: lassoPos.y, transform: 'translate(-50%, -110%)' }}>
                <div className="bg-[var(--bg-card)] text-[var(--text-main)] rounded-xl shadow-2xl p-1 flex gap-1 border border-[var(--border-color)] pointer-events-auto cursor-default backdrop-blur-md" onMouseDown={e => e.stopPropagation()}>
                    <button onClick={() => applyLassoAction('erase')} className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors" title="Simple Pixel Eraser (Transparent)"><Eraser size={14} className="text-[var(--text-muted)]"/> Erase</button>
                    <div className="w-px bg-[var(--border-color)] my-1"></div>
                    <button onClick={handleLassoMagicErase} className="px-3 py-1.5 hover:bg-purple-500/20 text-purple-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors" title="AI Patch (Generative Fill)"><Sparkles size={14}/> Patch</button>
                    <div className="w-px bg-[var(--border-color)] my-1"></div>
                    <button onClick={handleSmartCutAndHeal} className="px-3 py-1.5 hover:bg-blue-500/20 text-blue-400 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors" title="Split Object & Heal Background"><Scissors size={14}/> Cut & Heal</button>
                    <div className="w-px bg-[var(--border-color)] my-1"></div>
                    <button onClick={() => applyLassoAction('isolate')} className="px-3 py-1.5 hover:bg-white/10 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors" title="Keep Selection, Erase Outside"><Crop size={14} className="text-orange-500"/> Crop</button>
                    <div className="w-px bg-[var(--border-color)] my-1"></div>
                    <button onClick={() => setActiveLasso(null)} className="px-3 py-1.5 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-bold transition-colors"><X size={14}/></button>
                </div>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] border-t-[var(--border-color)]"></div>
            </div>
        )}

        {/* Frame Generation Menu */}
        {activeFrame && framePos && !isDragging && (
            <div className="absolute z-[2000] flex flex-col gap-1 items-center animate-fade-in-up" style={{ left: framePos.x, top: framePos.y, transform: 'translate(-50%, 10px)' }}>
                <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-b-[8px] border-b-[var(--border-color)]"></div>
                <div className="bg-[#2a1a35] text-[var(--text-main)] rounded-xl shadow-2xl p-1.5 flex gap-2 border border-purple-500/50 pointer-events-auto cursor-default backdrop-blur-md" onMouseDown={e => e.stopPropagation()}>
                    <button onClick={handleFrameGenerate} className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 transition-all shadow-lg shadow-purple-900/50">
                        <Sparkles size={14} fill="currentColor"/> Generate Fill
                    </button>
                    <button onClick={() => setActiveFrame(null)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"><X size={14}/></button>
                </div>
            </div>
        )}

        {/* LAYERS PANEL */}
        {showLayers && (
            <div className="fixed inset-0 md:absolute md:inset-auto md:top-14 md:right-4 md:w-64 bg-[#1e1e1e] md:bg-[#252525] md:border md:border-[#444] md:rounded-xl shadow-2xl z-[200] flex flex-col animate-fade-in-up md:max-h-96">
                <div className="p-4 md:p-3 border-b border-[#333] flex justify-between items-center bg-[#252525]">
                    <span className="text-sm md:text-xs font-bold uppercase text-gray-200">Layers ({objects.length})</span>
                    <div className="flex gap-4 md:gap-2">
                        <button onClick={addEmptyLayer} className="text-[var(--accent)] hover:text-white text-xs md:text-[10px] font-bold uppercase px-2 py-1 bg-black/20 rounded">+ Empty</button>
                        <button onClick={() => setShowLayers(false)} className="p-1"><X size={18} className="text-gray-400 hover:text-white"/></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2">
                    {objects.slice().reverse().map((obj, i) => {
                        const index = objects.length - 1 - i;
                        const isSelected = selectedIds.includes(obj.id);
                        return (
                            <div 
                                key={obj.id} 
                                onClick={(e) => { 
                                    if (e.shiftKey) {
                                        if (isSelected) setSelectedIds(prev => prev.filter(id => id !== obj.id));
                                        else setSelectedIds(prev => [...prev, obj.id]);
                                    } else {
                                        setSelectedIds([obj.id]); 
                                    }
                                    setTool('select'); 
                                }}
                                className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border
                                ${isSelected ? 'bg-[var(--accent)]/20 border-[var(--accent)]' : 'hover:bg-[#333] border-transparent'}`}
                            >
                                <div className="w-8 h-8 bg-[#111] rounded border border-[#444] flex items-center justify-center overflow-hidden shrink-0">
                                    {obj.type === 'image' && <img src={(obj as ImageObj).src} className="w-full h-full object-cover"/>}
                                    {obj.type === 'text' && <Type size={14} className="text-gray-400"/>}
                                    {obj.type === 'rect' && <Square size={14} style={{color: obj.color}}/>}
                                    {obj.type === 'circle' && <Circle size={14} style={{color: obj.color}}/>}
                                    {obj.type === 'path' && <PenTool size={14} style={{color: obj.color}}/>}
                                    {obj.type === 'mask' && <Scissors size={14} className="text-red-400"/>}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-[10px] font-bold text-gray-200 truncate">{obj.name || obj.type}</div>
                                    <div className="text-[9px] text-gray-500 uppercase flex items-center gap-1">
                                        {obj.type} 
                                        {obj.filters && (obj.filters.vignette > 0 || obj.filters.grain > 0) && <span className="text-[var(--accent)]">• FX</span>}
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button onClick={(e) => { e.stopPropagation(); toggleLayerVis(obj.id); }} className={`p-1 rounded hover:bg-black/20 ${obj.visible ? 'text-gray-400' : 'text-gray-600'}`}>{obj.visible ? <Eye size={12}/> : <EyeOff size={12}/>}</button>
                                    <div className="flex flex-col">
                                        <button onClick={(e) => { e.stopPropagation(); moveLayer(obj.id, 'up'); }} className="text-gray-500 hover:text-white"><ChevronUp size={10}/></button>
                                        <button onClick={(e) => { e.stopPropagation(); moveLayer(obj.id, 'down'); }} className="text-gray-500 hover:text-white"><ChevronDown size={10}/></button>
                                    </div>
                                    <button onClick={(e) => { e.stopPropagation(); deleteLayer(obj.id); }} className="p-1 text-gray-500 hover:text-red-400"><Trash size={12}/></button>
                                </div>
                            </div>
                        );
                    })}
                    {objects.length === 0 && <div className="text-[10px] text-gray-600 text-center py-4">No Layers</div>}
                </div>
            </div>
        )}

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
            {/* TOOLBAR */}
            <div id="ui-canvas-tools" 
                 className={`bg-[#252525] border-r border-[#333] flex flex-col items-center py-4 gap-3 overflow-y-auto custom-scrollbar z-40 transition-all duration-300 ease-in-out
                 fixed md:relative left-0 top-0 bottom-0 md:top-auto md:bottom-auto h-full
                 ${showTools ? 'w-20 md:w-24 translate-x-0' : '-translate-x-full md:translate-x-0 md:w-0 md:overflow-hidden'} 
                 `}
            >
                <div className="flex flex-col gap-2 w-full px-2 items-center">
                    <ToolButton icon={<MousePointer size={20} />} active={tool === 'select'} onClick={() => setTool('select')} title="Select (V)" />
                    <ToolButton icon={<Move size={20} />} active={tool === 'hand'} onClick={() => setTool('hand')} title="Pan (Space)" />
                    <ToolButton icon={<Lasso size={20} />} active={tool === 'lasso'} onClick={() => setTool('lasso')} title="Lasso Select" />
                    <ToolButton icon={<ScanLine size={20} />} active={tool === 'frame'} onClick={() => setTool('frame')} title="Generative Frame (Outpainting)" />
                    <ToolButton icon={<Anchor size={20} />} active={tool === 'pen'} onClick={() => setTool('pen')} title="Poly Pen (Bezier Mask)" />
                    <ToolButton icon={<PenTool size={20} />} active={tool === 'brush'} onClick={() => setTool('brush')} title="Brush" />
                    <ToolButton icon={<Brush size={20} />} active={tool === 'inpaint'} onClick={() => setTool('inpaint')} title="Inpaint Mask" />
                    <ToolButton icon={<Eraser size={20} />} active={tool === 'eraser'} onClick={() => setTool('eraser')} title="Eraser" />
                    <ToolButton icon={<Type size={20} />} active={tool === 'text'} onClick={() => setTool('text')} title="Text" />
                    <button onClick={() => fileInputRef.current?.click()} className="p-3 rounded-xl transition-all w-12 h-12 flex items-center justify-center shrink-0 text-gray-400 hover:text-white hover:bg-[#333]" title="Add Image (Real Size)"><ImageIcon size={20} /><input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = ev => { const src = ev.target?.result as string; const img = new Image(); img.src = src; img.onload = () => { if (!containerRef.current) return; const newImg: ImageObj = { id: Date.now().toString(), type: 'image', name: file.name || 'Image Layer', color: '#fff', lineWidth: 0, src: src, x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight, visible: true, locked: false, filters: { ...DEFAULT_FILTERS } }; setObjects(prev => [...prev, newImg]); setTool('select'); setSelectedIds([newImg.id]); }; }; reader.readAsDataURL(file); e.target.value = ''; } }} /></button>

                    {/* Shapes Group */}
                    <div className="relative group/shapes flex flex-col items-center">
                        <button onClick={() => setShapeMenuOpen(!isShapeMenuOpen)} className={`p-3 rounded-xl transition-all w-12 h-12 flex items-center justify-center shrink-0 ${['rect', 'circle', 'arrow'].includes(tool) ? 'bg-[var(--accent)] text-white shadow-lg' : 'text-gray-400 hover:text-white hover:bg-[#333]'}`} title="Shapes"><Shapes size={20} /></button>
                        {(isShapeMenuOpen || ['rect', 'circle', 'arrow'].includes(tool)) && (
                            <div className="flex flex-col gap-1 mt-1 bg-[#333] p-1.5 rounded-xl border border-[#444] animate-fade-in-down absolute left-full top-0 ml-2 z-50 shadow-xl">
                                <button onClick={() => setTool('rect')} className={`p-2 rounded-lg ${tool === 'rect' ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white'}`}><Square size={16} /></button>
                                <button onClick={() => setTool('circle')} className={`p-2 rounded-lg ${tool === 'circle' ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white'}`}><Circle size={16} /></button>
                                <button onClick={() => setTool('arrow')} className={`p-2 rounded-lg ${tool === 'arrow' ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white'}`}><ArrowRight size={16} /></button>
                            </div>
                        )}
                    </div>
                </div>
                
                <div className="w-16 h-px bg-[#444] my-2 shrink-0"></div>

                {/* Settings Area */}
                <div className="flex flex-col gap-4 w-full px-2 items-center">
                    <div className="flex flex-col items-center gap-1 group relative">
                         <span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)] hidden md:block">Color</span>
                         <button onClick={() => setShowColorPanel(!showColorPanel)} className="w-10 h-10 rounded-full border-2 border-[#444] overflow-hidden cursor-pointer shadow-lg hover:scale-110 transition-transform" style={{ backgroundColor: color }}></button>
                         {showColorPanel && (
                             <div className="absolute left-full top-0 ml-2 bg-[#333] p-3 rounded-xl border border-[#444] shadow-xl z-50 flex flex-col gap-2 animate-fade-in-left">
                                 <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-full h-8 cursor-pointer rounded" />
                                 <div className="grid grid-cols-4 gap-1">
                                     {['#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#a855f7','#ec4899','#ffffff','#000000'].map(c => (
                                         <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full border border-white/20 hover:scale-110 transition-transform" style={{ backgroundColor: c }}></button>
                                     ))}
                                 </div>
                                 <div className="flex items-center gap-2 mt-1">
                                    <label className="text-[9px] text-gray-400">Fill</label>
                                    <input type="checkbox" checked={isShapeFilled} onChange={(e) => setIsShapeFilled(e.target.checked)} className="accent-[var(--accent)]"/>
                                 </div>
                             </div>
                         )}
                    </div>

                    {tool === 'text' && (
                        <>
                            <div className="flex flex-col gap-1 w-full px-1">
                                <label className="text-[9px] text-gray-500 font-bold uppercase hidden md:block">Font</label>
                                <select value={selectedFont} onChange={(e) => setSelectedFont(e.target.value)} className="w-full bg-[#333] text-[10px] text-white p-1 rounded border border-[#444] focus:border-[var(--accent)] outline-none cursor-pointer">
                                    {EDITOR_FONTS.map(f => (<option key={f.name} value={f.value} style={{ fontFamily: f.value }}>{f.name.split(' ')[0]}</option>))}
                                </select>
                            </div>
                            <div className="flex flex-col items-center gap-1 group w-full"><span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)] hidden md:block">Size</span><div className="w-6 h-32 py-2 bg-[#333] rounded-full border border-[#444] flex justify-center items-center"><input type="range" min="12" max="200" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="h-full w-1 accent-[var(--accent)] bg-gray-600 rounded-lg appearance-none cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical' }} /></div></div>
                        </>
                    )}

                    {['brush', 'rect', 'circle', 'arrow', 'inpaint', 'eraser', 'lasso', 'pen'].includes(tool) && (
                        <div className="flex flex-col items-center gap-1 group"><span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)] hidden md:block">Size</span><div className="w-6 h-32 py-2 bg-[#333] rounded-full border border-[#444] flex justify-center items-center"><input type="range" min="1" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="h-full w-1 accent-[var(--accent)] bg-gray-600 rounded-lg appearance-none cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical' }} /></div></div>
                    )}
                     {['brush'].includes(tool) && (
                        <div className="flex flex-col items-center gap-1 group"><span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)] hidden md:block">Opac</span><div className="w-6 h-32 py-2 bg-[#333] rounded-full border border-[#444] flex justify-center items-center"><input type="range" min="0.1" max="1.0" step="0.1" value={brushOpacity} onChange={(e) => setBrushOpacity(parseFloat(e.target.value))} className="h-full w-1 accent-[var(--accent)] bg-gray-600 rounded-lg appearance-none cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical' }} /></div></div>
                    )}
                </div>
            </div>
            
            <button onClick={() => setShowTools(!showTools)} className={`hidden md:block absolute top-1/2 z-50 p-1 bg-[#252525] border border-[#333] text-gray-400 hover:text-white rounded-r-lg transition-all duration-300 ${showTools ? 'left-20 md:left-24' : 'left-0'}`}> {showTools ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />} </button>

            {/* CENTER: CANVAS */}
            <div className="flex-1 bg-[#151515] relative flex flex-col min-w-0 order-1 md:order-2">
                
                {/* 1. MOBILE HEADER - NEW CONSOLIDATED LAYOUT */}
                <div className="md:hidden h-12 bg-[#252525] border-b border-[#333] flex items-center justify-between px-3 z-50">
                    <button onClick={() => setShowTools(!showTools)} className={`p-2 rounded-lg transition-all ${showTools ? 'text-[var(--accent)] bg-white/5' : 'text-gray-400'}`}><Menu size={20}/></button>
                    <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{tool}</div>
                    <div className="flex items-center gap-1">
                        <button onClick={() => setShowLayers(!showLayers)} className={`p-2 rounded-lg ${showLayers ? 'text-[var(--accent)]' : 'text-gray-400'}`}><Layers size={20}/></button>
                        <div className="w-px h-6 bg-[#444] mx-1"></div>
                        <button onClick={() => setObjects(prev => prev.slice(0, -1))} className="p-2 text-gray-400"><Undo size={20}/></button>
                        <button onClick={handleSaveAndClose} className="p-2 text-[var(--accent)]"><Save size={20}/></button>
                        <button onClick={() => onClose()} className="p-2 text-gray-400"><X size={20}/></button>
                    </div>
                </div>

                {/* 2. DESKTOP HEADER (Hidden on mobile) */}
                <div className="hidden md:flex h-12 border-b border-[#333] bg-[#252525] items-center justify-between px-4 shrink-0 z-10 relative">
                     <div className="flex items-center gap-4">
                         {selectedIds.length > 0 ? (
                             <>
                                <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest flex items-center gap-2">
                                    {selectedIds.length > 1 ? <Combine size={14}/> : <BoxSelect size={14}/>} <span className="hidden sm:inline">{selectedIds.length} Selected</span>
                                </span>
                                <div className="h-6 w-px bg-[#444]"></div>
                                {selectedIds.length === 1 && (objects.find(o => o.id === selectedIds[0])?.type === 'image') && (
                                    <>
                                        <button onClick={() => setIsCropMode(!isCropMode)} className={`p-1.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${isCropMode ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white hover:bg-[#333]'}`}><Crop size={12}/> <span className="hidden sm:inline">Crop</span></button>
                                        <button onClick={handleGenerateNew} className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded text-[10px] font-bold uppercase hover:brightness-110 shadow-lg"><Sparkles size={12} /> <span className="hidden sm:inline">Gen</span></button>
                                    </>
                                )}
                                {selectedIds.length > 1 && (
                                    <button onClick={handleMergeLayers} className="flex items-center gap-1 px-3 py-1.5 bg-[#333] hover:bg-white/10 text-white rounded text-[10px] font-bold uppercase transition-colors"><Combine size={12}/> <span className="hidden sm:inline">Merge</span></button>
                                )}
                             </>
                         ) : (
                             <span className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                 {tool === 'inpaint' ? 'INPAINT MASK' : tool === 'lasso' ? 'LASSO SELECT' : `${tool} TOOL`}
                             </span>
                         )}
                     </div>

                     <div className="flex items-center gap-1 pl-2 shrink-0">
                        <div className="flex items-center gap-1">
                            <button onClick={cycleOverlay} className={`p-2 rounded-lg transition-all ${overlayType !== 'none' ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-gray-400 hover:text-white'}`} title="Cycle Overlays (Grid, Safe Zones, Cinema)">{overlayType === 'cinema-235' ? <ScanLine size={18}/> : overlayType === 'safe-zones' ? <Maximize2 size={18}/> : <Grid3X3 size={18}/>}</button>
                            <button onClick={() => setShowRulers(!showRulers)} className={`p-2 rounded-lg transition-all ${showRulers ? 'text-[var(--accent)] bg-[var(--accent)]/10' : 'text-gray-400 hover:text-white'}`} title="Rulers"><Ruler size={18}/></button>
                            <button onClick={() => setShowLayers(!showLayers)} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold uppercase ${showLayers ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white'}`}><Layers size={18}/> <span className="hidden sm:inline">Layers</span></button>
                            <div className="w-px h-6 bg-[#444] mx-1"></div>
                            <button onClick={() => setObjects(prev => prev.slice(0, -1))} className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-lg transition-all" title="Undo"><Undo size={18}/></button>
                            <button onClick={() => handleClearAll()} className="p-2 text-gray-400 hover:text-red-400 hover:bg-[#333] rounded-lg transition-all" title="Clear All"><Trash size={18}/></button>
                            <div className="w-px h-6 bg-[#444] mx-1"></div>
                            <button onClick={handleSaveAndClose} className="p-2 bg-[var(--accent)] text-white hover:brightness-110 rounded-lg shadow-lg transition-all" title="Save"><Save size={18}/></button>
                            <button onClick={() => onClose()} className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-lg transition-all" title="Close"><X size={18}/></button>
                        </div>
                     </div>
                </div>

                {/* RESOLUTION PRESETS TOOLBAR */}
                {isCropMode && (
                    <div className="bg-[#1a1a1a] border-b border-[#333] flex items-center justify-center p-2 gap-2 animate-fade-in-down z-10 overflow-x-auto scrollbar-hide">
                        <span className="text-[9px] font-bold text-gray-500 uppercase mr-1 flex-shrink-0">Doc Size:</span>
                        {RESOLUTION_PRESETS.map(preset => (
                            <button 
                                key={preset.label}
                                onClick={() => handleDocPreset(preset.w, preset.h)}
                                className={`px-2 py-1 bg-[#333] hover:bg-[var(--accent)] hover:text-white rounded text-[10px] font-bold flex items-center gap-1 border border-[#444] whitespace-nowrap
                                ${docSize.w === preset.w && docSize.h === preset.h ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                            >
                                {preset.icon} {preset.label}
                            </button>
                        ))}
                        <div className="w-px h-4 bg-[#444] mx-1 flex-shrink-0"></div>
                        <span className="text-[9px] font-mono text-gray-400 flex-shrink-0">{docSize.w} x {docSize.h}</span>
                    </div>
                )}
                
                <div className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#111]" ref={containerRef}>
                     <canvas 
                        ref={canvasRef} 
                        onMouseDown={handleMouseDown} 
                        onMouseMove={handleMouseMove} 
                        onMouseUp={handleMouseUp} 
                        onMouseLeave={handleMouseUp}
                        onWheel={handleWheel}
                        onTouchStart={handleMouseDown} 
                        onTouchMove={handleMouseMove} 
                        onTouchEnd={handleMouseUp} 
                        className={`w-full h-full block ${['brush', 'eraser', 'inpaint', 'lasso', 'pen'].includes(tool) ? 'cursor-none' : 'cursor-default'}`} 
                     />
                     
                     <div className="absolute bottom-4 right-4 flex gap-2 z-20">
                         <button onClick={() => setView(v => ({...v, scale: v.scale * 1.1}))} className="p-2 bg-black/60 text-white rounded-full hover:bg-[var(--accent)] backdrop-blur-sm"><ZoomIn size={20}/></button>
                         <button onClick={() => setView(v => ({...v, scale: v.scale * 0.9}))} className="p-2 bg-black/60 text-white rounded-full hover:bg-[var(--accent)] backdrop-blur-sm"><ZoomOut size={20}/></button>
                         <button onClick={handleFitView} className="p-2 bg-black/60 text-white rounded-full hover:bg-[var(--accent)] backdrop-blur-sm"><Maximize size={20}/></button>
                     </div>
                     
                     {isGenerating && (<div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"><div className="flex flex-col items-center gap-3"><RefreshCw size={48} className="animate-spin text-[var(--accent)]" /><span className="text-sm font-bold uppercase tracking-widest text-white">{genStatusMsg}</span></div></div>)}
                </div>
            </div>
        </div>

        {/* --- BOTTOM BAR --- */}
        <div className="bg-[#202020] border-t border-[#333] flex flex-col z-30 shrink-0 relative p-3">
            <div className="flex items-end gap-2">
                <div className="flex-1 bg-[#151515] border border-[#333] rounded-2xl flex items-center p-1.5 focus-within:border-[var(--accent)] transition-colors relative">
                    <button onClick={() => setIsLibraryOpen(!isLibraryOpen)} className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-[#333] transition-all" title="Reference Image"><Paperclip size={20}/></button>
                    {isLibraryOpen && (
                        <div className="absolute bottom-full left-0 mb-2 w-64 bg-[#252525] border border-[#444] rounded-xl shadow-2xl p-2 flex flex-col gap-2 z-50 animate-fade-in-up">
                            <div className="text-[10px] font-bold text-gray-400 uppercase px-1">References</div>
                            <div className="grid grid-cols-4 gap-1 max-h-40 overflow-y-auto custom-scrollbar">
                                <label className="aspect-square bg-[#333] rounded flex items-center justify-center cursor-pointer hover:bg-[#444]">
                                    <Plus size={16} className="text-gray-400"/>
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => {
                                        const f = e.target.files?.[0]; if(f) { const r = new FileReader(); r.onload = ev => { setReferences(prev => [...prev, { id: Date.now().toString(), src: ev.target?.result as string, orientation: 'landscape' }]); }; r.readAsDataURL(f); }
                                    }}/>
                                </label>
                                {references.map(ref => (
                                    <div key={ref.id} className="relative aspect-square group cursor-pointer" onClick={() => setEnlargedRef(ref.src)}>
                                        <img src={ref.src} className="w-full h-full object-cover rounded"/>
                                        <button onClick={(e) => { e.stopPropagation(); setReferences(prev => prev.filter(r => r.id !== ref.id)); }} className="absolute top-0 right-0 bg-black/60 text-white p-0.5 rounded-bl opacity-0 group-hover:opacity-100"><X size={10}/></button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="relative flex-1">
                        <textarea 
                            value={prompt} 
                            onChange={(e) => setPrompt(e.target.value)} 
                            placeholder="Describe changes or new generation..." 
                            className="w-full bg-transparent text-sm text-gray-200 placeholder-gray-500 px-2 py-2 focus:outline-none resize-none max-h-32 min-h-[40px] leading-relaxed custom-scrollbar"
                            style={{ height: '40px' }} 
                        />
                    </div>
                    <button onClick={handleEnhancePrompt} disabled={isEnhancing} className="p-2 text-purple-400 hover:bg-purple-500/20 rounded-xl transition-all" title="Enhance"><Wand2 size={20}/></button>
                </div>
                
                <button 
                    onClick={handleGenerateNew} 
                    disabled={isGenerating || !prompt} 
                    className={`h-[52px] w-[52px] rounded-full flex items-center justify-center flex-shrink-0 transition-all shadow-lg border border-white/10
                    ${isGenerating || !prompt 
                        ? 'bg-[#333] text-gray-500 cursor-not-allowed' 
                        : 'bg-[var(--accent)] text-white hover:bg-[var(--accent)]/90 hover:scale-[1.05]'}`}
                >
                    {isGenerating ? <RefreshCw size={24} className="animate-spin"/> : <Sparkles size={24} fill="currentColor"/>}
                </button>
            </div>
        </div>

        {enlargedRef && (
            <div className="fixed inset-0 z-[2100] bg-black/80 flex items-center justify-center p-8 backdrop-blur-sm" onClick={() => setEnlargedRef(null)}>
                <img src={enlargedRef} className="max-w-full max-h-full rounded shadow-2xl"/>
            </div>
        )}
    </div>,
    document.body
  );
};
