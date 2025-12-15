
import PptxGenJS from "pptxgenjs";
import { ProjectData } from "../types";

// Helper to ensure string
const safeStr = (val: any, fallback = ""): string => {
    if (val === null || val === undefined) return fallback;
    return String(val);
};

/**
 * Generates a PowerPoint (.pptx) presentation for the project.
 * Uses a "Cinematic Dark" aesthetic matching standard industry treatments.
 */
export const generateProjectPPTX = async (project: ProjectData) => {
  const pptx = new PptxGenJS();

  // --- THEME CONFIG ---
  const BG_COLOR = "000000"; 
  const ACCENT = "00D4FF"; // Cyan
  const TEXT_MAIN = "FFFFFF";
  const TEXT_MUTED = "666666";
  const BOX_BG = "111111";
  const BOX_BORDER = "333333";

  pptx.layout = "LAYOUT_16x9"; // 10 x 5.625 inches
  pptx.background = { color: BG_COLOR };

  // ==========================================
  // TITLE SLIDE
  // ==========================================
  const slideTitle = pptx.addSlide();
  
  slideTitle.addText("VALERA", {
    x: 0, y: 2.0, w: "100%", h: 1,
    fontSize: 72, color: ACCENT, bold: true, align: "center", fontFace: "Arial Black"
  });

  slideTitle.addText("PRE-PRODUCTION DECK", {
    x: 0, y: 3.0, w: "100%", h: 0.5,
    fontSize: 18, color: TEXT_MAIN, align: "center", fontFace: "Arial", charSpacing: 5
  });

  const projectName = project.meta?.appName || "Untitled Project";
  slideTitle.addText(`PROJECT: ${safeStr(projectName)}`, {
    x: 0, y: 3.5, w: "100%", h: 0.5,
    fontSize: 12, color: TEXT_MUTED, align: "center", fontFace: "Arial"
  });

  // ==========================================
  // SCENE SLIDES
  // ==========================================
  
  // Layout Constants (Inches)
  const MARGIN_X = 0.4;
  const MARGIN_Y = 0.4;
  const SLIDE_W = 10;
  const SLIDE_H = 5.625;
  
  // Image Column
  const IMG_X = MARGIN_X;
  const IMG_Y = MARGIN_Y;
  const IMG_W = 5.8; // Left 60%
  const IMG_H = SLIDE_H - (MARGIN_Y * 2);

  // Text Column
  const COL_X = IMG_X + IMG_W + 0.3; // Gap
  const COL_W = SLIDE_W - COL_X - MARGIN_X;
  
  project.timeline.forEach((frame, index) => {
    const slide = pptx.addSlide();
    let currY = MARGIN_Y;

    // --- 1. IMAGE AREA (Left) ---
    // Draw a placeholder box first
    slide.addShape(pptx.ShapeType.rect, {
        x: IMG_X, y: IMG_Y, w: IMG_W, h: IMG_H,
        fill: { color: "080808" }, // Very dark grey, almost black
        line: { color: "222222", width: 1 }
    });

    if (frame.image) {
        slide.addImage({
            data: frame.image,
            x: IMG_X, y: IMG_Y, w: IMG_W, h: IMG_H,
            sizing: { type: "contain", align: "center", valign: "middle" } 
        });
    } else {
        slide.addText("NO VISUAL RENDERED", {
            x: IMG_X, y: IMG_Y, w: IMG_W, h: IMG_H,
            align: "center", color: "333333", fontSize: 14, bold: true
        });
    }

    // --- 2. HEADER AREA (Top Right) ---
    
    // Big Number (Cyan)
    slide.addText(`${(index + 1).toString().padStart(2, '0')}`, {
        x: COL_X, y: currY - 0.1, w: 0.8, h: 0.6,
        fontSize: 36, color: ACCENT, bold: true, fontFace: "Arial Black"
    });

    // Title
    const rawTitle = frame.title || "Scene";
    const safeTitle = safeStr(rawTitle).toUpperCase();
    
    slide.addText(`SCENE ${index+1}: ${safeTitle}`, {
        x: COL_X + 0.8, y: currY, w: COL_W - 0.8, h: 0.5,
        fontSize: 12, color: TEXT_MAIN, bold: true, fontFace: "Arial", valign: "top"
    });
    
    currY += 0.5;

    // Specs (Dur | Shot)
    const shot = safeStr(frame.shotType, 'N/A');
    const specs = `DUR: ${frame.duration || 4}s  |  SHOT: ${shot}`;
    slide.addText(specs, {
        x: COL_X, y: currY, w: COL_W, h: 0.3,
        fontSize: 10, color: TEXT_MUTED, fontFace: "Arial"
    });
    
    currY += 0.3;

    // Line Divider
    slide.addShape(pptx.ShapeType.line, {
        x: COL_X, y: currY, w: COL_W, h: 0,
        line: { color: BOX_BORDER, width: 1 }
    });
    
    currY += 0.2;

    // --- 3. VISUAL DESCRIPTION ---
    slide.addText("VISUAL:", {
        x: COL_X, y: currY, w: COL_W, h: 0.2,
        fontSize: 9, color: ACCENT, bold: true
    });
    currY += 0.25;
    
    slide.addText(safeStr(frame.description, "No description provided."), {
        x: COL_X, y: currY, w: COL_W, h: 1.0, // Reduced height to fit video prompt
        fontSize: 10, color: "CCCCCC", valign: "top", wrap: true
    });
    
    currY += 1.1;

    // --- NEW: VIDEO PROMPT ---
    if (frame.videoPrompt) {
        slide.addText("VIDEO GENERATION:", {
            x: COL_X, y: currY, w: COL_W, h: 0.2,
            fontSize: 9, color: ACCENT, bold: true
        });
        currY += 0.25;
        
        slide.addText(frame.videoPrompt, {
            x: COL_X, y: currY, w: COL_W, h: 0.8,
            fontSize: 9, color: "999999", valign: "top", wrap: true, italic: true
        });
        currY += 0.9;
    }

    // --- 4. AUDIO / DIALOGUE BOX (Bottom Right) ---
    // Calculate remaining height to fill down to bottom margin
    const REMAINING_H = (SLIDE_H - MARGIN_Y) - currY;
    const BOX_H = Math.max(REMAINING_H, 1.0); // Ensure min height

    // Box Container
    slide.addShape(pptx.ShapeType.rect, {
        x: COL_X, y: currY, w: COL_W, h: BOX_H,
        fill: { color: BOX_BG },
        line: { color: BOX_BORDER, width: 0.5 }
    });

    // Box Label
    slide.addText("AUDIO / DIALOGUE", {
        x: COL_X + 0.1, y: currY + 0.1, w: COL_W - 0.2, h: 0.2,
        fontSize: 8, color: ACCENT, bold: true
    });

    // Construct Audio Text
    let audioText = "";
    if (frame.dialogue) audioText += `"${safeStr(frame.dialogue)}"\n\n`;
    if (frame.speechPrompt) audioText += `(TTS: ${safeStr(frame.speechPrompt)})\n`;
    if (frame.musicMood) audioText += `Music: ${safeStr(frame.musicMood)}\n`;
    if (frame.sunoPrompt) audioText += `Suno: ${safeStr(frame.sunoPrompt)}`;

    if (!audioText.trim()) audioText = "No audio specified.";

    slide.addText(audioText.trim(), {
        x: COL_X + 0.1, y: currY + 0.35, w: COL_W - 0.2, h: BOX_H - 0.45,
        fontSize: 9, color: "EEEEEE", valign: "top", wrap: true
    });

  });

  return pptx.writeFile({ fileName: `Valera_PrePro_${new Date().toISOString().slice(0,10)}.pptx` });
};
