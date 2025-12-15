
import React, { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Character } from '../types';
import { generateImage, enhancePrompt } from '../services/geminiService';
import { driveService } from '../services/driveService';
import { X, Save, RefreshCw, Wand2, PenTool, Type, Undo, Image as ImageIcon, Sparkles, Download, Eraser, MousePointer, Square, Circle, Paperclip, ArrowRight, ZoomIn, ZoomOut, Move, Trash, Shapes, Plus, PanelLeftClose, PanelLeftOpen, Brush, Crop, Maximize, Scaling, Percent, LayoutTemplate, Monitor, Smartphone, Grid, Layers, Eye, EyeOff, Lock, Unlock, ArrowUp, ArrowDown, ChevronDown, ChevronUp } from 'lucide-react';
import { EDITOR_FONTS } from '../constants';

interface Props {
  character: Character;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (updatedChar: Character) => void;
  imageModel: string;
  isDriveConnected?: boolean;
  onNotify?: (msg: string, type: 'info' | 'success') => void;
}

type ToolType = 'select' | 'brush' | 'inpaint' | 'eraser' | 'text' | 'rect' | 'circle' | 'arrow' | 'hand';
type HandleType = 'tl' | 'tr' | 'bl' | 'br' | null;

interface Point { x: number; y: number; }
interface BaseObject { 
    id: string; 
    type: string; 
    name: string;
    color: string; 
    lineWidth: number; 
    visible: boolean;
    locked: boolean;
}
interface PathObject extends BaseObject { type: 'path'; points: Point[]; isEraser: boolean; isInpaint?: boolean; opacity: number; }
interface ShapeObject extends BaseObject { type: 'rect' | 'circle'; x: number; y: number; w: number; h: number; }
interface ArrowObject extends BaseObject { type: 'arrow'; x1: number; y1: number; x2: number; y2: number; }
interface ImageObj extends BaseObject { 
    type: 'image'; 
    x: number; y: number; w: number; h: number; 
    src: string; 
    // Removed internal crop to prevent distortion. We use the DocSize as the crop frame.
}
interface TextObject extends BaseObject { type: 'text'; x: number; y: number; text: string; fontFamily: string; fontSize: number; }
type CanvasObject = PathObject | ShapeObject | TextObject | ArrowObject | ImageObj;

const hexToRgba = (hex: string, alpha: number) => {
    let c: any;
    if(/^#([A-Fa-f0-9]{3}){1,2}$/.test(hex)){
        c= hex.substring(1).split('');
        if(c.length== 3){
            c= [c[0], c[0], c[1], c[1], c[2], c[2]];
        }
        c= '0x'+c.join('');
        return 'rgba('+[(c>>16)&255, (c>>8)&255, c&255].join(',')+','+alpha+')';
    }
    return `rgba(255, 255, 255, ${alpha})`;
}

const RESOLUTION_PRESETS = [
    { label: 'HD Landscape', w: 1920, h: 1080, icon: <Monitor size={12}/> },
    { label: 'Vertical Reels', w: 1080, h: 1920, icon: <Smartphone size={12}/> },
    { label: 'Square Post', w: 1080, h: 1080, icon: <Square size={12}/> },
    { label: '4K Cinema', w: 3840, h: 2160, icon: <LayoutTemplate size={12}/> },
    { label: 'Portrait 4:5', w: 1080, h: 1350, icon: <Grid size={12}/> }
];

export const CharacterEditorModal: React.FC<Props> = ({ character, isOpen, onClose, onUpdate, imageModel, isDriveConnected, onNotify }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null); 
  
  const [objects, setObjects] = useState<CanvasObject[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tool, setTool] = useState<ToolType>('select');
  const [isShapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [showTools, setShowTools] = useState(true);
  
  const [color, setColor] = useState('#ef4444');
  const [brushSize, setBrushSize] = useState(20); 
  const [brushOpacity, setBrushOpacity] = useState(1.0);
  const [fontSize, setFontSize] = useState(48);
  const [selectedFont, setSelectedFont] = useState(EDITOR_FONTS[0].value);

  // Document / Artboard Size (Real Resolution)
  const [docSize, setDocSize] = useState({ w: 1920, h: 1080 });

  // Infinite Canvas State
  const [view, setView] = useState({ scale: 0.5, x: 50, y: 50 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<Point | null>(null);

  const [corrections, setCorrections] = useState({
      brightness: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0
  });

  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point | null>(null);
  const [currentShape, setCurrentShape] = useState<ShapeObject | null>(null);
  const [currentArrow, setCurrentArrow] = useState<ArrowObject | null>(null);
  const [currentPath, setCurrentPath] = useState<PathObject | null>(null);
  
  // Marquee Selection State
  const [selectionBox, setSelectionBox] = useState<{x: number, y: number, w: number, h: number} | null>(null);

  const [activeHandle, setActiveHandle] = useState<HandleType>(null);
  const [originalBounds, setOriginalBounds] = useState<{x: number, y: number, w: number, h: number} | null>(null);
  const [originalObjState, setOriginalObjState] = useState<CanvasObject | null>(null);

  const [imageCache] = useState<Map<string, HTMLImageElement>>(new Map());

  const [textInput, setTextInput] = useState<{ x: number; y: number } | null>(null);
  const [inputValue, setInputValue] = useState("");
  
  const [prompt, setPrompt] = useState(character.description || "");
  const [references, setReferences] = useState<string[]>(character.additionalReferences || []);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  const [isCropMode, setIsCropMode] = useState(false);

  // --- TRIGGER VEL TOUR ---
  useEffect(() => {
      if (isOpen) {
          window.dispatchEvent(new CustomEvent('VEL_CANVAS_OPEN'));
      }
      return () => {
          if (isOpen) {
              window.dispatchEvent(new CustomEvent('VEL_CANVAS_CLOSE'));
          }
      }
  }, [isOpen]);

  useEffect(() => {
    const families = EDITOR_FONTS
        .filter(f => !f.value.includes('Arial') && !f.value.includes('Impact'))
        .map(f => {
            const match = f.value.match(/'([^']+)'/);
            return match ? match[1].replace(/\s+/g, '+') : null;
        })
        .filter(Boolean)
        .join('&family=');

    if (families) {
        const link = document.createElement('link');
        link.href = `https://fonts.googleapis.com/css2?family=${families}&display=swap`;
        link.rel = 'stylesheet';
        document.head.appendChild(link);
    }
  }, []);

  // Initialize
  useEffect(() => {
    if (isOpen && character.image && objects.length === 0) {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = character.image;
      img.onload = () => {
        if (!containerRef.current) return;
        
        const initW = img.naturalWidth > 100 ? img.naturalWidth : 1920;
        const initH = img.naturalHeight > 100 ? img.naturalHeight : 1080;
        setDocSize({ w: initW, h: initH });

        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const padding = 60;
        const scale = Math.min((cw - padding) / initW, (ch - padding) / initH, 1);
        const centerX = (cw - initW * scale) / 2;
        const centerY = (ch - initH * scale) / 2;
        setView({ scale, x: centerX, y: centerY });

        const newImgObj: ImageObj = {
            id: 'main-image',
            type: 'image',
            name: 'Main Image',
            color: '#fff',
            lineWidth: 0,
            visible: true,
            locked: false,
            src: character.image!,
            x: 0, 
            y: 0,
            w: img.naturalWidth,
            h: img.naturalHeight
        };
        
        setObjects([newImgObj]);
        imageCache.set('main-image', img);
      };
    }
  }, [isOpen, character.image]);

  useEffect(() => {
    renderCanvas();
  }, [objects, selectedId, currentPath, currentShape, currentArrow, selectionBox, tool, activeHandle, corrections, view, isCropMode, docSize]);

  // Transform helpers
  const screenToWorld = (sx: number, sy: number) => {
      return {
          x: (sx - view.x) / view.scale,
          y: (sy - view.y) / view.scale
      };
  };

  const worldToScreen = (wx: number, wy: number) => {
      return {
          x: wx * view.scale + view.x,
          y: wy * view.scale + view.y
      };
  };

  const renderCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas || !containerRef.current) return;
    
    const dpr = window.devicePixelRatio || 1;
    const rect = containerRef.current.getBoundingClientRect();
    
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    
    // 1. Draw Infinite Void
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    // 2. Draw Artboard / Document
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, docSize.w, docSize.h);
    ctx.clip(); 

    // Draw Red Warning Pattern for Empty Space
    ctx.fillStyle = '#2a0a0a'; 
    ctx.fillRect(0, 0, docSize.w, docSize.h);
    ctx.strokeStyle = '#550000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -docSize.h; i < docSize.w; i += 40) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i + docSize.h, docSize.h);
    }
    ctx.stroke();

    // 3. Draw Objects
    const applyFilter = (ctx: CanvasRenderingContext2D) => {
         ctx.filter = `brightness(${corrections.brightness}%) contrast(${corrections.contrast}%) saturate(${corrections.saturation}%) sepia(${corrections.warmth}%)`;
    }

    const allObjects = [...objects];
    if (currentPath) allObjects.push(currentPath);
    if (currentShape) allObjects.push(currentShape);
    if (currentArrow) allObjects.push(currentArrow);

    allObjects.forEach(obj => {
        if (!obj.visible) return;

        ctx.beginPath();
        
        if (obj.type === 'path' && (obj as PathObject).isEraser) {
             ctx.globalCompositeOperation = 'destination-out'; 
        } else {
             ctx.globalCompositeOperation = 'source-over';
        }

        if (obj.type === 'path') {
            const path = obj as PathObject;
            if (path.points.length < 2) return;
            
            let strokeColor = path.color;
            if (path.isInpaint) {
                 strokeColor = hexToRgba(path.color, 0.5);
            } else if (path.opacity < 1.0) {
                 strokeColor = hexToRgba(path.color, path.opacity);
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = path.lineWidth;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(path.points[0].x, path.points[0].y);
            for (let i = 1; i < path.points.length; i++) ctx.lineTo(path.points[i].x, path.points[i].y);
            ctx.stroke();
        } else if (obj.type === 'rect') {
            const s = obj as ShapeObject; ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth;
            ctx.strokeRect(s.x, s.y, s.w, s.h);
        } else if (obj.type === 'circle') {
            const s = obj as ShapeObject; ctx.strokeStyle = s.color; ctx.lineWidth = s.lineWidth;
            ctx.beginPath(); ctx.ellipse(s.x + s.w/2, s.y + s.h/2, Math.abs(s.w/2), Math.abs(s.h/2), 0, 0, 2*Math.PI); ctx.stroke();
        } else if (obj.type === 'arrow') {
            const arrow = obj as ArrowObject;
            const headlen = arrow.lineWidth * 3; const angle = Math.atan2(arrow.y2 - arrow.y1, arrow.x2 - arrow.x1);
            ctx.strokeStyle = arrow.color; ctx.lineWidth = arrow.lineWidth; ctx.lineCap = 'round';
            ctx.moveTo(arrow.x1, arrow.y1); ctx.lineTo(arrow.x2, arrow.y2); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(arrow.x2 - headlen * Math.cos(angle - Math.PI / 6), arrow.y2 - headlen * Math.sin(angle - Math.PI / 6));
            ctx.lineTo(arrow.x2, arrow.y2); ctx.lineTo(arrow.x2 - headlen * Math.cos(angle + Math.PI / 6), arrow.y2 - headlen * Math.sin(angle + Math.PI / 6));
            ctx.stroke();
        } else if (obj.type === 'image') {
            const imgObj = obj as ImageObj;
            let img = imageCache.get(imgObj.id);
            if (!img) { 
                img = new Image(); 
                img.crossOrigin = "anonymous";
                img.src = imgObj.src; 
                imageCache.set(imgObj.id, img); 
            }
            if (img.complete) {
                ctx.save();
                applyFilter(ctx);
                ctx.drawImage(img, imgObj.x, imgObj.y, imgObj.w, imgObj.h);
                ctx.restore();
            }
        } else if (obj.type === 'text') {
            const t = obj as TextObject;
            ctx.fillStyle = t.color; 
            const fontName = t.fontFamily.split(',')[0].replace(/['"]/g, '');
            ctx.font = `bold ${t.fontSize}px "${fontName}"`; 
            ctx.textBaseline = 'top'; 
            ctx.fillText(t.text, t.x, t.y);
        }

        ctx.globalCompositeOperation = 'source-over';
    });

    // 4. Marquee Selection Box (Semi-transparent)
    if (selectionBox) {
        ctx.fillStyle = 'rgba(0, 229, 255, 0.15)'; // Semi-transparent Cyan Fill
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 1 / view.scale;
        ctx.fillRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
        ctx.strokeRect(selectionBox.x, selectionBox.y, selectionBox.w, selectionBox.h);
    }

    ctx.restore(); // End Clipping

    // 5. Draw Selection UI
    if (selectedId) {
        const obj = objects.find(o => o.id === selectedId);
        if (obj && obj.visible) {
            ctx.save();
            ctx.filter = 'none'; 
            ctx.strokeStyle = '#00e5ff'; 
            ctx.shadowColor = '#00e5ff';
            ctx.shadowBlur = 10;
            ctx.lineWidth = 2 / view.scale; 
            
            const bounds = getObjectBounds(obj);
            if (bounds) {
                // Fill Selection with Semi-Transparent Color
                ctx.fillStyle = 'rgba(0, 229, 255, 0.1)'; 
                ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
                
                ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
                
                ctx.fillStyle = '#ffffff'; 
                ctx.shadowBlur = 0;
                const hSz = 10 / view.scale;
                
                const drawHandle = (x: number, y: number) => {
                     ctx.beginPath();
                     ctx.arc(x, y, hSz/2, 0, Math.PI * 2);
                     ctx.fill();
                     ctx.stroke(); 
                };

                drawHandle(bounds.x, bounds.y); // TL
                drawHandle(bounds.x + bounds.w, bounds.y); // TR
                drawHandle(bounds.x, bounds.y + bounds.h); // BL
                drawHandle(bounds.x + bounds.w, bounds.y + bounds.h); // BR
            }
            ctx.restore();
        }
    }
    
    // Draw Artboard Border
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2 / view.scale;
    ctx.strokeRect(0, 0, docSize.w, docSize.h);
    
    ctx.fillStyle = '#666';
    ctx.font = `${12 / view.scale}px sans-serif`;
    ctx.fillText(`${docSize.w} x ${docSize.h}`, 0, -10 / view.scale);

    ctx.restore();
  };

  // ... (Keeping all existing handlers and JSX) ...
  // Since I just added the useEffect at line 88, and the component is large, I'm ensuring all existing code logic remains exactly as is.
  // The rest of the component is identical to previous version.

  const getObjectBounds = (obj: CanvasObject) => {
    if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'image') {
        const s = obj as ShapeObject | ImageObj;
        return { x: s.x, y: s.y, w: s.w, h: s.h };
    } else if (obj.type === 'arrow') {
        const a = obj as ArrowObject;
        const minX = Math.min(a.x1, a.x2);
        const minY = Math.min(a.y1, a.y2);
        const w = Math.abs(a.x2 - a.x1);
        const h = Math.abs(a.y2 - a.y1);
        return { x: minX, y: minY, w, h };
    } else if (obj.type === 'text') {
        const t = obj as TextObject;
        const ctx = canvasRef.current?.getContext('2d');
        if (ctx) {
             const fontName = t.fontFamily.split(',')[0].replace(/['"]/g, '');
             ctx.font = `bold ${t.fontSize}px "${fontName}"`;
             const metrics = ctx.measureText(t.text);
             return { x: t.x, y: t.y, w: metrics.width, h: t.fontSize * 1.2 };
        }
        return { x: t.x, y: t.y, w: t.text.length * (t.fontSize*0.6), h: t.fontSize };
    } else if (obj.type === 'path') {
        const p = obj as PathObject;
        if (p.points.length === 0) return null;
        let minX = p.points[0].x, maxX = p.points[0].x;
        let minY = p.points[0].y, maxY = p.points[0].y;
        p.points.forEach(pt => {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
        });
        return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    }
    return null;
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const isPointInRect = (wx: number, wy: number, r: {x:number, y:number, w:number, h:number}) => {
      const rx = r.w < 0 ? r.x + r.w : r.x;
      const ry = r.h < 0 ? r.y + r.h : r.y;
      const rw = Math.abs(r.w);
      const rh = Math.abs(r.h);
      return wx >= rx && wx <= rx + rw && wy >= ry && wy <= ry + rh;
  };

  const getHandleUnderMouse = (wx: number, wy: number, bounds: {x:number, y:number, w:number, h:number}): HandleType => {
      const handleSize = 10 / view.scale; 
      const hitBuffer = handleSize * 2;
      
      if (Math.abs(wx - bounds.x) < hitBuffer && Math.abs(wy - bounds.y) < hitBuffer) return 'tl';
      if (Math.abs(wx - (bounds.x + bounds.w)) < hitBuffer && Math.abs(wy - bounds.y) < hitBuffer) return 'tr';
      if (Math.abs(wx - bounds.x) < hitBuffer && Math.abs(wy - (bounds.y + bounds.h)) < hitBuffer) return 'bl';
      if (Math.abs(wx - (bounds.x + bounds.w)) < hitBuffer && Math.abs(wy - (bounds.y + bounds.h)) < hitBuffer) return 'br';
      return null;
  };

  const handleWheel = (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
          const newScale = Math.min(Math.max(view.scale * zoomFactor, 0.05), 10);
          
          const rect = containerRef.current!.getBoundingClientRect();
          const mx = e.clientX - rect.left;
          const my = e.clientY - rect.top;
          
          const wx = (mx - view.x) / view.scale;
          const wy = (my - view.y) / view.scale;
          
          const newX = mx - wx * newScale;
          const newY = my - wy * newScale;
          
          setView({ scale: newScale, x: newX, y: newY });
      } else {
          setView(prev => ({ ...prev, x: prev.x - e.deltaX, y: prev.y - e.deltaY }));
      }
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault();
    const screenCoords = getCoordinates(e);
    const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);

    if (tool === 'hand' || (e as React.MouseEvent).button === 1 || (e as React.MouseEvent).buttons === 4) {
        setIsPanning(true);
        setPanStart(screenCoords);
        return;
    }

    if (tool === 'text') {
        if (textInput) { commitText(); return; }
        setTextInput({ x: worldCoords.x, y: worldCoords.y });
        setInputValue("");
        setTimeout(() => {
            const inputEl = document.getElementById('char-floating-input');
            if(inputEl) inputEl.focus();
        }, 50);
        return;
    }

    if (tool === 'select') {
        if (selectedId) {
            const obj = objects.find(o => o.id === selectedId);
            if (obj && !obj.locked && obj.visible) {
                const bounds = getObjectBounds(obj);
                if (bounds) {
                    const handle = getHandleUnderMouse(worldCoords.x, worldCoords.y, bounds);
                    if (handle) {
                        setActiveHandle(handle);
                        setOriginalBounds(bounds);
                        setOriginalObjState(JSON.parse(JSON.stringify(obj))); 
                        setDragStart(worldCoords);
                        setIsDragging(true);
                        return;
                    }
                }
            }
        }
        
        // Hit detection top-down
        let foundId = null;
        for (let i = objects.length - 1; i >= 0; i--) {
            const obj = objects[i];
            if (!obj.visible || obj.locked) continue;
            const bounds = getObjectBounds(obj);
            if (bounds && isPointInRect(worldCoords.x, worldCoords.y, bounds)) {
                foundId = obj.id;
                break;
            }
        }
        
        setSelectedId(foundId);
        
        if (foundId) { 
            setIsDragging(true); 
            setDragStart(worldCoords); 
        } else {
            // MARQUEE SELECTION START
            setIsDragging(true);
            setDragStart(worldCoords);
            setSelectionBox({ x: worldCoords.x, y: worldCoords.y, w: 0, h: 0 });
        }
        return;
    }

    setIsDragging(true);
    setDragStart(worldCoords);

    if (tool === 'brush' || tool === 'eraser' || tool === 'inpaint') {
        setCurrentPath({
            id: Date.now().toString(), type: 'path', name: tool, color: color,
            lineWidth: tool === 'eraser' ? brushSize * 4 : brushSize * 2, 
            isEraser: tool === 'eraser',
            isInpaint: tool === 'inpaint',
            opacity: tool === 'brush' ? brushOpacity : 1.0,
            points: [worldCoords], visible: true, locked: false
        });
    } else if (tool === 'rect' || tool === 'circle') {
        setCurrentShape({
            id: Date.now().toString(), type: tool, name: tool, color: color, lineWidth: brushSize,
            x: worldCoords.x, y: worldCoords.y, w: 0, h: 0, visible: true, locked: false
        });
    } else if (tool === 'arrow') {
        setCurrentArrow({
            id: Date.now().toString(), type: 'arrow', name: 'Arrow', color: color, lineWidth: brushSize,
            x1: worldCoords.x, y1: worldCoords.y, x2: worldCoords.x, y2: worldCoords.y, visible: true, locked: false
        });
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if ('touches' in e) e.preventDefault();
    const screenCoords = getCoordinates(e);
    
    // Custom Cursor
    if (cursorRef.current && containerRef.current) {
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        
        if (['brush', 'eraser', 'inpaint'].includes(tool)) {
            cursorRef.current.style.transform = `translate(${clientX}px, ${clientY}px)`;
            const visualSize = (tool === 'eraser' ? brushSize * 4 : brushSize * 2) * view.scale;
            cursorRef.current.style.width = `${visualSize}px`;
            cursorRef.current.style.height = `${visualSize}px`;
            cursorRef.current.style.display = 'block';
        } else {
            cursorRef.current.style.display = 'none';
        }
    }

    const worldCoords = screenToWorld(screenCoords.x, screenCoords.y);

    if (isPanning && panStart) {
        const dx = screenCoords.x - panStart.x;
        const dy = screenCoords.y - panStart.y;
        setView(prev => ({ ...prev, x: prev.x + dx, y: prev.y + dy }));
        setPanStart(screenCoords);
        return;
    }
    
    if (!isDragging || !dragStart) return;

    if (activeHandle && selectedId && originalBounds && originalObjState) {
        const dx = worldCoords.x - dragStart.x;
        const dy = worldCoords.y - dragStart.y;
        let newX = originalBounds.x, newY = originalBounds.y, newW = originalBounds.w, newH = originalBounds.h;
        
        // Aspect Ratio Lock Logic for Images
        const originalRatio = originalBounds.w / originalBounds.h;
        
        if (activeHandle.includes('r')) newW += dx;
        if (activeHandle.includes('b')) {
            if (originalObjState.type === 'image') {
                newH = newW / originalRatio; // Force aspect ratio
            } else {
                newH += dy;
            }
        }
        if (activeHandle.includes('l')) { newX += dx; newW -= dx; }
        if (activeHandle.includes('t')) { newY += dy; newH -= dy; }

        setObjects(prev => prev.map(obj => {
            if (obj.id !== selectedId) return obj;
            if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'image') {
                 // Double check aspect lock for Corner dragging
                 if (obj.type === 'image') {
                     // For simplicity, enforce aspect on width change
                     // If standard resizing, we usually just update one dim based on other.
                     // Here we simply set h based on w to keep it robust.
                     return { ...obj, x: newX, y: newY, w: newW, h: newW / originalRatio } as ShapeObject | ImageObj;
                 }
                 return { ...obj, x: newX, y: newY, w: newW, h: newH } as ShapeObject | ImageObj;
            }
            if (obj.type === 'text') {
                const textObj = originalObjState as TextObject;
                const scaleY = newH / originalBounds.h;
                return { ...obj, x: newX, y: newY, fontSize: Math.abs(textObj.fontSize * scaleY) } as TextObject;
            }
            return obj;
        }));
        return;
    }

    if (tool === 'select') {
        if (selectionBox) {
            // Update Marquee
            setSelectionBox({
                x: Math.min(dragStart.x, worldCoords.x),
                y: Math.min(dragStart.y, worldCoords.y),
                w: Math.abs(worldCoords.x - dragStart.x),
                h: Math.abs(worldCoords.y - dragStart.y)
            });
        } else if (selectedId) {
            // Move Object
            const dx = worldCoords.x - dragStart.x;
            const dy = worldCoords.y - dragStart.y;
            setObjects(prev => prev.map(obj => {
                if (obj.id !== selectedId) return obj;
                if (obj.type === 'rect' || obj.type === 'circle' || obj.type === 'image') { const s = obj as ShapeObject | ImageObj; return { ...s, x: s.x + dx, y: s.y + dy }; }
                else if (obj.type === 'text') { const t = obj as TextObject; return { ...t, x: t.x + dx, y: t.y + dy }; }
                else if (obj.type === 'path') { const p = obj as PathObject; return { ...p, points: p.points.map(pt => ({ x: pt.x + dx, y: pt.y + dy })) }; }
                else if (obj.type === 'arrow') { const a = obj as ArrowObject; return { ...a, x1: a.x1 + dx, y1: a.y1 + dy, x2: a.x2 + dx, y2: a.y2 + dy }; }
                return obj;
            })); 
            setDragStart(worldCoords); 
        }
        return;
    }

    if ((tool === 'brush' || tool === 'eraser' || tool === 'inpaint') && currentPath) {
        setCurrentPath(prev => prev ? { ...prev, points: [...prev.points, worldCoords] } : null);
    } else if ((tool === 'rect' || tool === 'circle') && currentShape) {
        setCurrentShape(prev => prev ? { ...prev, w: worldCoords.x - prev.x, h: worldCoords.y - prev.y } : null);
    } else if (tool === 'arrow' && currentArrow) {
        setCurrentArrow(prev => prev ? { ...prev, x2: worldCoords.x, y2: worldCoords.y } : null);
    }
  };

  const handleMouseUp = () => {
    if (isPanning) { setIsPanning(false); setPanStart(null); return; }
    if (isDragging) {
        if (selectionBox) {
            // Finalize Marquee Selection
            // Find first object that intersects
            let foundId = null;
            for (let i = objects.length - 1; i >= 0; i--) {
                const obj = objects[i];
                if (!obj.visible || obj.locked) continue;
                const bounds = getObjectBounds(obj);
                if (bounds) {
                    const intersect = !(bounds.x > selectionBox.x + selectionBox.w || 
                                      bounds.x + bounds.w < selectionBox.x || 
                                      bounds.y > selectionBox.y + selectionBox.h || 
                                      bounds.y + bounds.h < selectionBox.y);
                    if (intersect) {
                        foundId = obj.id;
                        break;
                    }
                }
            }
            setSelectedId(foundId);
            setSelectionBox(null);
        }

        if (currentPath) { setObjects(prev => [...prev, currentPath]); setCurrentPath(null); }
        if (currentShape) { if (Math.abs(currentShape.w) > 5) setObjects(prev => [...prev, currentShape]); setCurrentShape(null); }
        if (currentArrow) { setObjects(prev => [...prev, currentArrow]); setCurrentArrow(null); }
        setIsDragging(false); setActiveHandle(null); setOriginalBounds(null); setOriginalObjState(null);
    }
  };

  const commitText = () => {
      if (!textInput || !inputValue.trim()) { setTextInput(null); return; }
      
      const newText: TextObject = {
          id: Date.now().toString(), 
          type: 'text', 
          name: inputValue.substring(0, 10),
          color: color, 
          lineWidth: 1,
          x: textInput.x, 
          y: textInput.y, 
          text: inputValue, 
          fontFamily: selectedFont, 
          fontSize: fontSize,
          visible: true,
          locked: false
      };
      
      setObjects(prev => [...prev, newText]);
      setTextInput(null); 
      setInputValue("");
      setTool('select');
      setSelectedId(newText.id);
  };

  const handleAddImage = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
          const src = ev.target?.result as string;
          const img = new Image();
          img.src = src;
          img.onload = () => {
              if (!canvasRef.current) return;
              
              // Place in center of current view
              const cx = -view.x / view.scale + (canvasRef.current.width / window.devicePixelRatio / 2) / view.scale;
              const cy = -view.y / view.scale + (canvasRef.current.width / window.devicePixelRatio / 2) / view.scale;
              
              const newImg: ImageObj = {
                  id: Date.now().toString(), type: 'image', name: 'Image Layer', color: '#fff', lineWidth: 0,
                  src: src,
                  x: cx - img.naturalWidth/2,
                  y: cy - img.naturalHeight/2,
                  w: img.naturalWidth,
                  h: img.naturalHeight,
                  visible: true,
                  locked: false
              };
              setObjects(prev => [...prev, newImg]);
              setTool('select');
              setSelectedId(newImg.id);
          };
      };
      reader.readAsDataURL(file);
      e.target.value = '';
  };

  // --- LAYER MANAGEMENT ---
  const toggleLayerVis = (id: string) => {
      setObjects(prev => prev.map(o => o.id === id ? { ...o, visible: !o.visible } : o));
  };
  const toggleLayerLock = (id: string) => {
      setObjects(prev => prev.map(o => o.id === id ? { ...o, locked: !o.locked } : o));
  };
  const deleteLayer = (id: string) => {
      setObjects(prev => prev.filter(o => o.id !== id));
      if (selectedId === id) setSelectedId(null);
  };
  const moveLayer = (id: string, direction: 'up' | 'down') => {
      const idx = objects.findIndex(o => o.id === id);
      if (idx === -1) return;
      
      const newObjects = [...objects];
      if (direction === 'up' && idx < objects.length - 1) {
          [newObjects[idx], newObjects[idx+1]] = [newObjects[idx+1], newObjects[idx]];
      } else if (direction === 'down' && idx > 0) {
          [newObjects[idx], newObjects[idx-1]] = [newObjects[idx-1], newObjects[idx]];
      }
      setObjects(newObjects);
  };

  // --- PRESETS & RESIZING ---
  const handleDocPreset = (w: number, h: number) => {
      setDocSize({ w, h });
      
      // Auto-fit view to new doc size
      if (containerRef.current) {
        const cw = containerRef.current.clientWidth;
        const ch = containerRef.current.clientHeight;
        const padding = 60;
        const scale = Math.min((cw - padding) / w, (ch - padding) / h, 1);
        const centerX = (cw - w * scale) / 2;
        const centerY = (ch - h * scale) / 2;
        setView({ scale, x: centerX, y: centerY });
      }
      // Note: We do NOT auto-center the image anymore. User can move image ("frame moves").
  };

  const handleSaveAndClose = async () => {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = docSize.w;
      tempCanvas.height = docSize.h;
      const tCtx = tempCanvas.getContext('2d');
      if(!tCtx) return;

      objects.forEach(obj => {
         if (!obj.visible) return;

         if (obj.type === 'text') {
             const t = obj as TextObject;
             tCtx.fillStyle = t.color;
             const fontName = t.fontFamily.split(',')[0].replace(/['"]/g, '');
             tCtx.font = `bold ${t.fontSize}px "${fontName}"`;
             tCtx.textBaseline = 'top';
             tCtx.fillText(t.text, t.x, t.y);
         } else if (obj.type === 'image') {
             const i = obj as ImageObj;
             const img = imageCache.get(i.id) || new Image();
             if(!img.src) img.src = i.src;
             // Draw exact size, clipping happens by canvas boundary naturally
             tCtx.drawImage(img, i.x, i.y, i.w, i.h);
         } else if (obj.type === 'rect') {
             const s = obj as ShapeObject; tCtx.strokeStyle = s.color; tCtx.lineWidth = s.lineWidth;
             tCtx.strokeRect(s.x, s.y, s.w, s.h);
         } else if (obj.type === 'path') {
             const p = obj as PathObject;
             if (p.points.length > 1) {
                 tCtx.beginPath();
                 let strokeColor = p.color;
                 if(p.isInpaint) strokeColor = hexToRgba(p.color, 0.5);
                 else if(p.opacity < 1.0) strokeColor = hexToRgba(p.color, p.opacity);
                 
                 tCtx.strokeStyle = strokeColor;
                 tCtx.lineWidth = p.lineWidth;
                 tCtx.lineCap = 'round';
                 tCtx.lineJoin = 'round';
                 tCtx.moveTo(p.points[0].x, p.points[0].y);
                 for (let i = 1; i < p.points.length; i++) tCtx.lineTo(p.points[i].x, p.points[i].y);
                 tCtx.stroke();
             }
         }
      });

      const finalImage = tempCanvas.toDataURL('image/png');
      onUpdate({ ...character, image: finalImage, description: prompt, additionalReferences: references });
      if (isDriveConnected) {
          onNotify?.("Uploading Edit...", "info");
          const filename = `Edit_${character.name}_${Date.now()}.png`;
          await driveService.uploadImage(finalImage, filename, 'Characters');
          onNotify?.("Saved to Drive", "success");
      }
      onClose();
  };
  
  const handleEnhancePrompt = async () => { setIsEnhancing(true); try { setPrompt(await enhancePrompt(prompt)); } catch (e) { console.error(e); } finally { setIsEnhancing(false); } };
  
  const handleGenerateNew = async () => {
    if (!prompt) return;
    setIsGenerating(true);
    try {
        const refs = [character.image || "", ...references].filter(Boolean);
        const hasInpaint = objects.some(o => o.type === 'path' && (o as PathObject).isInpaint);
        let finalPrompt = prompt;
        if (hasInpaint) {
            finalPrompt += " (IMPORTANT: Modify ONLY the area highlighted in translucent strokes/mask. Keep the rest of the image exactly as is.)";
        }
        
        const newImageUrl = await generateImage(finalPrompt, refs, character.aspectRatio || "16:9", imageModel);
        
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = newImageUrl;
        img.onload = () => {
             const newImgObj: ImageObj = {
                id: Date.now().toString(),
                type: 'image',
                name: 'Gen Result',
                color: '#fff',
                lineWidth: 0,
                src: newImageUrl,
                x: (docSize.w - img.naturalWidth)/2,
                y: (docSize.h - img.naturalHeight)/2,
                w: img.naturalWidth,
                h: img.naturalHeight,
                visible: true,
                locked: false
             };
             setObjects(prev => [...prev, newImgObj]);
        };
    } catch (e) { alert("Generation failed: " + e); } finally { setIsGenerating(false); }
  };

  const handleExpandImage = async () => {
    if (!selectedId) return;
    const selectedObj = objects.find(o => o.id === selectedId) as ImageObj;
    if (!selectedObj || selectedObj.type !== 'image') return;

    setIsGenerating(true);
    try {
        const expandPrompt = "Expand the provided image outward on all sides by approximately 40% of the original width and height. Preserve the original content exactly as-is, without any modifications, alterations, or distortions. Seamlessly continue the scene, style, lighting, perspective, and composition into the newly added areas so that the final result appears as a natural, coherent extension of the original. Do not crop, reframe, or reinterpret the input—only add new content around it";
        
        const newImageUrl = await generateImage(expandPrompt, [selectedObj.src], character.aspectRatio || "16:9", imageModel);

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = newImageUrl;
        img.onload = () => {
             setObjects(prev => prev.map(o => {
                 if (o.id === selectedId) {
                     return {
                         ...o,
                         src: newImageUrl,
                         w: img.naturalWidth, 
                         h: img.naturalHeight,
                     } as ImageObj;
                 }
                 return o;
             }));
        };
    } catch (e) { alert("Expand failed: " + e); } finally { setIsGenerating(false); }
  };

  const ToolButton = ({ icon, active, onClick, title }: { icon: React.ReactNode, active: boolean, onClick: () => void, title?: string }) => (
      <button 
        onClick={onClick} 
        title={title}
        className={`p-3 rounded-xl transition-all w-12 h-12 flex items-center justify-center shrink-0
        ${active 
            ? 'bg-[var(--accent)] text-white shadow-lg scale-110' 
            : 'text-gray-400 hover:text-white hover:bg-[#333]'}`}
      >
          {icon}
      </button>
  );

  const selectedObject = selectedId ? objects.find(o => o.id === selectedId) : null;
  const inputScreenPos = textInput ? worldToScreen(textInput.x, textInput.y) : null;

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex flex-col bg-[#1e1e1e] text-[#f1f5f9]">
        {/* --- MAIN LAYOUT AREA --- */}
        <div className="flex-1 flex overflow-hidden relative">
            
            {/* COLLAPSIBLE LEFT TOOLBAR */}
            <div className={`bg-[#252525] border-r border-[#333] flex flex-col items-center py-4 gap-3 overflow-y-auto custom-scrollbar z-20 transition-all duration-300 ease-in-out ${showTools ? 'w-24 translate-x-0' : 'w-0 -translate-x-full opacity-0'}`}>
                {/* Main Tools */}
                <div className="flex flex-col gap-2 w-full px-2 items-center">
                    <ToolButton icon={<MousePointer size={20} />} active={tool === 'select'} onClick={() => setTool('select')} />
                    <ToolButton icon={<Move size={20} />} active={tool === 'hand'} onClick={() => setTool('hand')} />
                    <ToolButton icon={<PenTool size={20} />} active={tool === 'brush'} onClick={() => setTool('brush')} />
                    <ToolButton icon={<Brush size={20} />} active={tool === 'inpaint'} onClick={() => setTool('inpaint')} />
                    <ToolButton icon={<Eraser size={20} />} active={tool === 'eraser'} onClick={() => setTool('eraser')} />
                    <ToolButton icon={<Type size={20} />} active={tool === 'text'} onClick={() => setTool('text')} />
                    
                    <button 
                         onClick={() => fileInputRef.current?.click()}
                         className="p-3 rounded-xl transition-all w-12 h-12 flex items-center justify-center shrink-0 text-gray-400 hover:text-white hover:bg-[#333]"
                         title="Add Image to Canvas"
                    >
                        <ImageIcon size={20} />
                        <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleAddImage} />
                    </button>

                    {/* Shapes Group */}
                    <div className="relative group/shapes flex flex-col items-center">
                        <button 
                            onClick={() => setShapeMenuOpen(!isShapeMenuOpen)} 
                            className={`p-3 rounded-xl transition-all w-12 h-12 flex items-center justify-center shrink-0
                            ${['rect', 'circle', 'arrow'].includes(tool) 
                                ? 'bg-[var(--accent)] text-white shadow-lg' 
                                : 'text-gray-400 hover:text-white hover:bg-[#333]'}`}
                        >
                            <Shapes size={20} />
                        </button>
                        {(isShapeMenuOpen || ['rect', 'circle', 'arrow'].includes(tool)) && (
                            <div className="flex flex-col gap-1 mt-1 bg-[#333] p-1.5 rounded-xl border border-[#444]">
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
                    {/* Color Picker */}
                    <div className="flex flex-col items-center gap-1 group">
                         <span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)]">Color</span>
                         <div className="w-10 h-10 rounded-full border-2 border-[#444] overflow-hidden cursor-pointer shadow-lg hover:scale-110 transition-transform" style={{ backgroundColor: color }}>
                            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="opacity-0 w-full h-full cursor-pointer" />
                         </div>
                    </div>

                    {tool === 'text' && (
                        <>
                            <div className="flex flex-col gap-1 w-full px-1">
                                <label className="text-[9px] text-gray-500 font-bold uppercase">Font</label>
                                <select
                                    value={selectedFont}
                                    onChange={(e) => setSelectedFont(e.target.value)}
                                    className="w-full bg-[#333] text-[10px] text-white p-1 rounded border border-[#444] focus:border-[var(--accent)] outline-none"
                                >
                                    {EDITOR_FONTS.map(f => (
                                        <option key={f.name} value={f.value} style={{ fontFamily: f.value }}>{f.name.split(' ')[0]}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="flex flex-col items-center gap-1 group w-full">
                                <span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)]">Size</span>
                                <div className="h-32 py-2 bg-[#333] rounded-full border border-[#444] flex justify-center w-6">
                                    <input type="range" min="12" max="200" value={fontSize} onChange={(e) => setFontSize(parseInt(e.target.value))} className="w-1 h-full accent-[var(--accent)] bg-gray-600 rounded-lg appearance-none cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical' }} />
                                </div>
                            </div>
                        </>
                    )}

                    {['brush', 'rect', 'circle', 'arrow', 'inpaint', 'eraser'].includes(tool) && (
                        <div className="flex flex-col items-center gap-1 group">
                            <span className="text-[9px] text-gray-500 font-bold uppercase group-hover:text-[var(--accent)]">Size</span>
                            <div className="h-24 py-2 bg-[#333] rounded-full border border-[#444] flex justify-center w-6">
                                <input type="range" min="1" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-1 h-full accent-[var(--accent)] bg-gray-600 rounded-lg appearance-none cursor-pointer" style={{ writingMode: 'vertical-lr', direction: 'rtl', WebkitAppearance: 'slider-vertical' }} />
                            </div>
                        </div>
                    )}
                </div>
            </div>
            
            <button 
                onClick={() => setShowTools(!showTools)}
                className={`absolute top-1/2 z-30 p-1 bg-[#252525] border border-[#333] text-gray-400 hover:text-white rounded-r-lg transition-all duration-300 ${showTools ? 'left-24' : 'left-0'}`}
            >
                {showTools ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>

            {/* CENTER: CANVAS */}
            <div className="flex-1 bg-[#151515] relative flex flex-col min-w-0">
                <div className="h-12 border-b border-[#333] bg-[#252525] flex items-center justify-between px-4 shrink-0 z-10 relative">
                     {/* Dynamic Tool Title / Options */}
                     <div className="flex items-center gap-4">
                         {selectedObject?.type === 'image' ? (
                             <>
                                <span className="text-xs font-bold text-[var(--accent)] uppercase tracking-widest flex items-center gap-2"><ImageIcon size={14}/> Image</span>
                                <div className="h-6 w-px bg-[#444]"></div>
                                {/* Resize Tools */}
                                <div className="flex items-center gap-1">
                                    <button onClick={() => setIsCropMode(!isCropMode)} className={`p-1.5 rounded text-[10px] font-bold uppercase flex items-center gap-1 ${isCropMode ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white hover:bg-[#333]'}`}><Crop size={12}/> Frame / Crop</button>
                                </div>
                                <div className="h-6 w-px bg-[#444]"></div>
                                <button onClick={handleExpandImage} className="flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded text-[10px] font-bold uppercase hover:brightness-110 shadow-lg"><Maximize size={12} /> AI Fill</button>
                             </>
                         ) : (
                             <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{tool === 'inpaint' ? 'INPAINT MASK' : `${tool} TOOL`}</span>
                         )}
                     </div>

                     <div className="flex items-center gap-1 pl-2 shrink-0">
                        {/* LAYER TOGGLE */}
                        <button onClick={() => setShowLayers(!showLayers)} className={`p-2 rounded-lg transition-all flex items-center gap-2 text-xs font-bold uppercase ${showLayers ? 'bg-[var(--accent)] text-white' : 'text-gray-400 hover:text-white'}`}>
                            <Layers size={18}/> <span className="hidden sm:inline">Layers</span>
                        </button>
                        <div className="w-px h-6 bg-[#444] mx-1"></div>
                        <button onClick={() => setObjects(prev => prev.slice(0, -1))} className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-lg transition-all" title="Undo"><Undo size={18}/></button>
                        <button onClick={() => setObjects([])} className="p-2 text-gray-400 hover:text-red-400 hover:bg-[#333] rounded-lg transition-all" title="Clear All"><Trash size={18}/></button>
                        <div className="w-px h-6 bg-[#444] mx-1"></div>
                        <button onClick={handleSaveAndClose} className="p-2 bg-[var(--accent)] text-white hover:brightness-110 rounded-lg shadow-lg transition-all" title="Save"><Save size={18}/></button>
                        <button onClick={() => onClose()} className="p-2 text-gray-400 hover:text-white hover:bg-[#333] rounded-lg transition-all" title="Close"><X size={18}/></button>
                     </div>
                </div>

                {/* RESOLUTION PRESETS TOOLBAR */}
                {isCropMode && (
                    <div className="bg-[#1a1a1a] border-b border-[#333] flex items-center justify-center p-2 gap-2 animate-fade-in-down z-10">
                        <span className="text-[9px] font-bold text-gray-500 uppercase mr-1">Doc Size:</span>
                        {RESOLUTION_PRESETS.map(preset => (
                            <button 
                                key={preset.label}
                                onClick={() => handleDocPreset(preset.w, preset.h)}
                                className={`px-2 py-1 bg-[#333] hover:bg-[var(--accent)] hover:text-white rounded text-[10px] font-bold flex items-center gap-1 border border-[#444]
                                ${docSize.w === preset.w && docSize.h === preset.h ? 'border-[var(--accent)] text-[var(--accent)]' : ''}`}
                            >
                                {preset.icon} {preset.label}
                            </button>
                        ))}
                        <div className="w-px h-4 bg-[#444] mx-1"></div>
                        <span className="text-[9px] font-mono text-gray-400">{docSize.w} x {docSize.h}</span>
                    </div>
                )}
                
                {/* LAYERS PANEL */}
                {showLayers && (
                    <div className="absolute top-14 right-4 w-64 bg-[#252525] border border-[#444] rounded-xl shadow-2xl z-40 flex flex-col animate-fade-in-up">
                        <div className="p-3 border-b border-[#333] flex justify-between items-center">
                            <span className="text-xs font-bold uppercase text-gray-400">Layers ({objects.length})</span>
                            <button onClick={() => setShowLayers(false)}><X size={14} className="text-gray-500 hover:text-white"/></button>
                        </div>
                        <div className="max-h-64 overflow-y-auto custom-scrollbar p-1 flex flex-col gap-1">
                            {objects.slice().reverse().map((obj, i) => {
                                const index = objects.length - 1 - i;
                                return (
                                    <div 
                                        key={obj.id} 
                                        onClick={() => { setSelectedId(obj.id); setTool('select'); }}
                                        className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition-colors border
                                        ${selectedId === obj.id ? 'bg-[var(--accent)]/20 border-[var(--accent)]' : 'hover:bg-[#333] border-transparent'}`}
                                    >
                                        <div className="w-8 h-8 bg-[#111] rounded border border-[#444] flex items-center justify-center overflow-hidden">
                                            {obj.type === 'image' && <img src={(obj as ImageObj).src} className="w-full h-full object-cover"/>}
                                            {obj.type === 'text' && <Type size={14} className="text-gray-400"/>}
                                            {obj.type === 'rect' && <Square size={14} style={{color: obj.color}}/>}
                                            {obj.type === 'circle' && <Circle size={14} style={{color: obj.color}}/>}
                                            {obj.type === 'path' && <PenTool size={14} style={{color: obj.color}}/>}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-[10px] font-bold text-gray-200 truncate">{obj.name || obj.type}</div>
                                            <div className="text-[9px] text-gray-500 uppercase">{obj.type}</div>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <button onClick={(e) => { e.stopPropagation(); toggleLayerVis(obj.id); }} className={`p-1 rounded hover:bg-black/20 ${obj.visible ? 'text-gray-400' : 'text-gray-600'}`}>{obj.visible ? <Eye size={12}/> : <EyeOff size={12}/>}</button>
                                            <button onClick={(e) => { e.stopPropagation(); toggleLayerLock(obj.id); }} className={`p-1 rounded hover:bg-black/20 ${obj.locked ? 'text-[var(--accent)]' : 'text-gray-600'}`}>{obj.locked ? <Lock size={12}/> : <Unlock size={12}/>}</button>
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

                <div className="flex-1 relative overflow-hidden flex items-center justify-center" ref={containerRef}>
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
                        className={`w-full h-full block ${['brush', 'eraser', 'inpaint'].includes(tool) ? 'cursor-none' : 'cursor-default'}`} 
                     />
                     
                     <div className="absolute bottom-4 right-4 flex gap-2 z-20">
                         <button onClick={() => setView(v => ({...v, scale: v.scale * 1.1}))} className="p-2 bg-black/60 text-white rounded-full hover:bg-[var(--accent)]"><ZoomIn size={20}/></button>
                         <button onClick={() => setView(v => ({...v, scale: v.scale * 0.9}))} className="p-2 bg-black/60 text-white rounded-full hover:bg-[var(--accent)]"><ZoomOut size={20}/></button>
                     </div>
                     
                     {isGenerating && (<div className="absolute inset-0 bg-black/60 flex items-center justify-center z-50 backdrop-blur-sm"><div className="flex flex-col items-center gap-3"><RefreshCw size={48} className="animate-spin text-[var(--accent)]" /><span className="text-sm font-bold uppercase tracking-widest text-white">Generating...</span></div></div>)}

                     {/* CUSTOM BRUSH CURSOR (Moved Inside) */}
                    <div 
                        ref={cursorRef}
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, pointerEvents: 'none', zIndex: 9999, borderRadius: '50%',
                            border: '2px solid white', boxShadow: '0 0 4px rgba(0,0,0,0.8)',
                            transform: 'translate(-50%, -50%)', display: 'none', backgroundColor: 'rgba(255, 255, 255, 0.1)'
                        }}
                    />

                    {/* TEXT INPUT (Moved Inside) */}
                    {textInput && inputScreenPos && (
                        <input
                            id="char-floating-input"
                            type="text" 
                            value={inputValue} 
                            onChange={(e) => setInputValue(e.target.value)} 
                            onKeyDown={(e) => { 
                                if (e.key === 'Enter') commitText(); 
                                e.stopPropagation();
                            }} 
                            onBlur={commitText} 
                            autoFocus
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ 
                                position: 'absolute', left: inputScreenPos.x, top: inputScreenPos.y, 
                                color: color, fontFamily: selectedFont, fontSize: `${fontSize * view.scale}px`, fontWeight: 'bold',
                                zIndex: 2000, transform: 'translateY(-50%)', width: 'auto', minWidth: '100px', maxWidth: '80vw'
                            }}
                            className="bg-black/50 border border-[var(--accent)] rounded px-2 py-1 outline-none shadow-xl text-white backdrop-blur-md"
                        />
                    )}
                </div>
            </div>
        </div>

        {/* --- BOTTOM BAR --- */}
        <div className="bg-[#202020] border-t border-[#333] flex flex-col z-30 shrink-0 relative">
            <div className="p-3 flex items-end gap-2">
                <div className="flex-1 bg-[#151515] border border-[#333] rounded-2xl flex items-center p-1.5 focus-within:border-[var(--accent)] transition-colors relative">
                    <button onClick={() => document.getElementById('char-ref-upload')?.click()} className="p-2 text-gray-400 hover:text-white rounded-xl hover:bg-[#333] transition-all"><Paperclip size={20}/><input id="char-ref-upload" type="file" className="hidden" accept="image/*" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                             const reader = new FileReader();
                             reader.onload = (ev) => setReferences(prev => [...prev, ev.target?.result as string]);
                             reader.readAsDataURL(file);
                        }
                    }}/></button>
                    
                    <div className="relative flex-1">
                        <textarea 
                            value={prompt} 
                            onChange={(e) => setPrompt(e.target.value)} 
                            placeholder="Message to AI (e.g. 'Add a red hat')..." 
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
    </div>,
    document.body
  );
};
