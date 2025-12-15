
import { jsPDF } from "jspdf";
import { ProjectData } from "../types";

// Helper to ensure string
const safeStr = (val: any, fallback = ""): string => {
    if (val === null || val === undefined) return fallback;
    return String(val);
};

/**
 * Helper to convert ArrayBuffer to Base64
 */
function arrayBufferToBase64(buffer: ArrayBuffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

/**
 * Generates a structured PDF report for the project.
 * Landscape Presentation Style: TV Aesthetic, Dark background, Left Image, Right Details.
 * Features dynamic height calculation to prevent overflow.
 */
export const generateProjectPDF = async (project: ProjectData): Promise<jsPDF> => {
  const doc = new jsPDF({
    orientation: 'l', // Landscape
    unit: 'mm',
    format: 'a4'
  });

  // 1. Load Roboto Font for Cyrillic Support with Fallback
  let mainFont = "helvetica";
  try {
    const fontUrl = "https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.1.66/fonts/Roboto/Roboto-Regular.ttf";
    const fontBytes = await fetch(fontUrl).then(res => res.arrayBuffer());
    const fontBase64 = arrayBufferToBase64(fontBytes);
    
    doc.addFileToVFS("Roboto-Regular.ttf", fontBase64);
    doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
    mainFont = "Roboto";
  } catch (e) {
    console.error("Failed to load Cyrillic font, falling back to standard font.", e);
  }

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 10; 
  const gap = 6;

  // --- STYLING PALETTE (DARK MODE VALERA) ---
  const colors = {
    bg: [15, 15, 15],          // #0F0F0F
    cardBg: [30, 30, 30],      // #1E1E1E
    textMain: [240, 240, 240], // White-ish
    textMuted: [150, 150, 150],// Grey
    accent: [0, 212, 255],     // Cyan
    border: [60, 60, 60]       // #3C3C3C
  };

  const drawBackground = () => {
    doc.setFillColor(colors.bg[0], colors.bg[1], colors.bg[2]);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');
  };

  const drawCardBackground = (x: number, y: number, w: number, h: number) => {
    doc.setFillColor(colors.cardBg[0], colors.cardBg[1], colors.cardBg[2]);
    doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
    doc.setLineWidth(0.2);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
  };

  // ==========================================
  // TITLE PAGE
  // ==========================================
  
  drawBackground();

  // Grid Pattern Overlay (Simulated)
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.1);
  for (let i = 0; i < pageWidth; i+=10) doc.line(i, 0, i, pageHeight);
  for (let i = 0; i < pageHeight; i+=10) doc.line(0, i, pageWidth, i);

  // Typography
  const centerX = pageWidth / 2;
  const centerY = pageHeight / 2;

  doc.setFont(mainFont);
  
  // Title
  doc.setFontSize(64);
  doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
  doc.text("VALERA", centerX, centerY - 10, { align: 'center', charSpace: 5 });

  // Subtitle
  doc.setFontSize(24);
  doc.setTextColor(255, 255, 255);
  doc.text("PRE-PRODUCTION REPORT", centerX, centerY + 10, { align: 'center', charSpace: 3 });

  // Info
  doc.setFontSize(12);
  doc.setTextColor(colors.textMuted[0], colors.textMuted[1], colors.textMuted[2]);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, centerX, centerY + 25, { align: 'center' });


  // ==========================================
  // CONTENT PAGES
  // ==========================================
  
  const leftColWidth = (pageWidth / 2) - margin - (gap / 2);
  const rightColStart = (pageWidth / 2) + (gap / 2);
  const rightColWidth = (pageWidth / 2) - margin - (gap / 2);
  
  project.timeline.forEach((frame, index) => {
      doc.addPage();
      drawBackground();
      
      // --- LEFT SIDE: IMAGE FRAME ---
      const contentHeight = pageHeight - (margin * 2);
      
      // Draw Image Card
      drawCardBackground(margin, margin, leftColWidth, contentHeight);

      if (frame.image) {
        try {
            const imgProps = doc.getImageProperties(frame.image);
            const ratio = imgProps.width / imgProps.height;
            
            // Calculate best fit maintaining aspect ratio with padding
            const padding = 5;
            let drawW = leftColWidth - (padding * 2);
            let drawH = drawW / ratio;

            if (drawH > contentHeight - (padding * 2)) {
                drawH = contentHeight - (padding * 2);
                drawW = drawH * ratio;
            }

            const imgX = margin + (leftColWidth - drawW) / 2;
            const imgY = margin + (contentHeight - drawH) / 2;
            
            doc.addImage(frame.image, 'PNG', imgX, imgY, drawW, drawH, undefined, 'FAST');
        } catch (e) {
            doc.setFontSize(10);
            doc.setTextColor(colors.textMuted[0], colors.textMuted[1], colors.textMuted[2]);
            doc.text("Image Error", margin + leftColWidth/2, margin + contentHeight/2, { align: 'center' });
        }
      } else {
          doc.setTextColor(colors.textMuted[0], colors.textMuted[1], colors.textMuted[2]);
          doc.setFontSize(12);
          doc.text("NO VISUAL RENDERED", margin + leftColWidth/2, margin + contentHeight/2, { align: 'center' });
      }

      // --- RIGHT SIDE: DETAILS ---
      let cursorY = margin;

      // 1. HEADER
      doc.setFontSize(32);
      doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
      doc.text(`${index + 1}`.padStart(2, '0'), rightColStart, cursorY + 10);
      
      doc.setFontSize(14);
      doc.setTextColor(colors.textMain[0], colors.textMain[1], colors.textMain[2]);
      
      // Safety check for title
      const titleText = safeStr(frame.title, "Untitled Scene").toUpperCase();
      // Wrap title if long
      const titleLines = doc.splitTextToSize(titleText, rightColWidth - 20);
      doc.text(titleLines, rightColStart + 20, cursorY + 10);
      
      cursorY += 20;

      // Divider
      doc.setDrawColor(colors.border[0], colors.border[1], colors.border[2]);
      doc.setLineWidth(0.5);
      doc.line(rightColStart, cursorY, rightColStart + rightColWidth, cursorY);
      cursorY += 8;

      // 2. TECH SPECS ROW
      const specs = [
          `DURATION: ${frame.duration || 4}s`,
          `SHOT: ${safeStr(frame.shotType, '-')}`,
          `RATIO: ${safeStr(frame.aspectRatio, '16:9')}`
      ];
      
      doc.setFontSize(9);
      doc.setTextColor(colors.textMuted[0], colors.textMuted[1], colors.textMuted[2]);
      doc.text(specs.join("    |    "), rightColStart, cursorY);
      cursorY += 10;

      // --- DYNAMIC CARDS ---
      
      const renderSection = (title: string, content: string | undefined) => {
          if (!content) return;

          const boxPadding = 4;
          const availableWidth = rightColWidth - (boxPadding * 2);
          
          doc.setFontSize(10);
          const lines = doc.splitTextToSize(safeStr(content), availableWidth);
          const blockHeight = (lines.length * 5) + 12;

          // Check overflow
          if (cursorY + blockHeight > pageHeight - margin) return;

          drawCardBackground(rightColStart, cursorY, rightColWidth, blockHeight);
          
          doc.setFontSize(8);
          doc.setTextColor(colors.accent[0], colors.accent[1], colors.accent[2]);
          doc.text(title, rightColStart + boxPadding, cursorY + 6);
          
          doc.setFontSize(10);
          doc.setTextColor(colors.textMain[0], colors.textMain[1], colors.textMain[2]);
          doc.text(lines, rightColStart + boxPadding, cursorY + 11);

          cursorY += blockHeight + 5;
      };

      renderSection("VISUAL DESCRIPTION", frame.description);
      
      // Add Video Prompt Section
      if (frame.videoPrompt) {
          renderSection("VIDEO GENERATION PROMPT", frame.videoPrompt);
      }
      
      if (frame.dialogue || frame.speechPrompt) {
          const text = `${frame.dialogue ? `"${frame.dialogue}"` : ''}\n${frame.speechPrompt ? `(TTS: ${frame.speechPrompt})` : ''}`.trim();
          renderSection("AUDIO / DIALOGUE", text);
      }

      if (frame.musicMood || frame.sunoPrompt) {
          const text = `${frame.musicMood ? `MOOD: ${frame.musicMood}` : ''}\n${frame.sunoPrompt ? `SUNO PROMPT: ${frame.sunoPrompt}` : ''}`.trim();
          renderSection("MUSIC / SOUNDTRACK", text);
      }
  });

  return doc;
};
