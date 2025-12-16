
export interface Character {
  id: string;
  type: 'character' | 'item' | 'location';
  name: string;
  triggerWord?: string; // Specific token/keyword for AI generation
  description: string;
  image: string | null;
  imageHistory?: string[]; // Array of base64 strings for version history
  additionalReferences?: string[]; // New field for prompt-specific references
  aspectRatio?: string; // Aspect ratio for generation (e.g. "1:1", "16:9")
  quality?: 'standard' | 'high'; // Deprecated in favor of global model setting + imageSize
  imageSize?: string; // '1K' | '2K' | '4K' (Only for Pro model)
}

export interface TimelineFrame {
  id: string;
  title: string;
  description: string; // User's rough idea
  enhancedPrompt?: string; // Gemini 3 generated prompt
  image: string | null;
  imageHistory?: string[]; // Array of base64 strings for version history
  assignedAssetIds: string[]; // IDs of characters, items, or locations
  
  // Montage & Audio fields
  shotType?: string; // e.g. "Extreme Close-Up", "Wide Shot"
  duration?: number; // Duration in seconds
  dialogue?: string; // Script or Voiceover
  speechPrompt?: string; // Detailed instructions for TTS (intonation, pauses)
  musicMood?: string; // Description of music
  sunoPrompt?: string; // Specific prompt for Suno AI
  
  // Video Generation
  videoPrompt?: string; // Prompt for video generators (motion, camera)

  // Visual Settings
  aspectRatio?: string; // e.g., "16:9", "9:16"
  stylePrompt?: string; // The prompt suffix for the style
  quality?: 'standard' | 'high'; // 'standard' = Flash, 'high' = Pro
}

export interface TimelineSettings {
    fps: number;
    width: number;
    height: number;
}

export interface GenerationLogEntry {
  id: string;
  timestamp: number;
  prompt: string;
  imageData: string; // base64
  sourceId: string; // ID of the character or frame
  sourceName: string; 
}

export interface ProjectData {
  meta: {
    appName: string;
    version: string;
    description: string;
  };
  references: Character[];
  timeline: TimelineFrame[];
  timelineSettings: TimelineSettings;
  directorHistory?: ChatMessage[]; // Saved chat history with Valera
  activeDirectorStyleId?: string; // Saved style preference (e.g. 'jcenters')
  directorDraft?: string; // Saved unfinished input text
  generationLog?: GenerationLogEntry[]; // Global history of all generations
}

export interface AppSettings {
  themeId: string; // ID of the selected theme preset
  fontFamily: string;
  imageModel: string; // 'gemini-2.5-flash-image' | 'gemini-3-pro-image-preview'
  showAssistant: boolean; // Toggle for Vel
  assistantImage?: string; // Legacy/Fallback
  assistantWalkImage?: string; // GIF for walking
  assistantIdleImage?: string; // GIF for standing
  assistantSitImage?: string; // GIF for sitting/resting
  chatFontSize?: number; // New: Font size for Director Chat (default 12)
  apiProvider?: 'google' | 'openrouter'; // NEW: Provider selector
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

// --- DIRECTOR TAB TYPES ---

export interface DirectorStyle {
  id: string;
  name: string;
  desc: string;
  promptSuffix: string;
}

export interface ChatAttachment {
  type: 'image' | 'audio' | 'video' | 'pdf';
  name: string;
  data: string; // base64
  mimeType: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  attachments?: ChatAttachment[];
  timestamp: number;
}

export interface LabAssetSuggestion {
    type: 'character' | 'item' | 'location';
    name: string;
    description: string;
    triggerWord?: string;
}

export interface TimelineSuggestion {
    title: string;
    visualDescription: string;
    shotType?: string;
    duration?: number;
    musicMood?: string;
    sunoPrompt?: string;
    dialogue?: string;
    speechPrompt?: string;
    videoPrompt?: string;
    assetNames?: string[]; // Names of assets used in this scene
}

export interface DirectorAction {
    label: string;
    action: 'SET_FORMAT' | 'CREATE_SCENE' | 'GENERATE_CINEMATIC_CHAR' | 'GENERATE_COVERAGE' | 'EXPAND_SCENE' | 'GENERATE_STORYBOARD_V3' | 'CREATE_NEW_PROJECT' | 'CONTINUE_PROJECT' | 'GENERATE_STORYBOARD' | 'CREATE_STORY' | 'SUGGEST_OWN_STORY' | 'APPROVE_STORY' | 'SUGGEST_OWN_HERO' | 'CREATE_FIRST_SCENE' | 'EXPORT_GUIDE';
    payload: any;
}
