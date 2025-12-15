
import React from 'react';
import { AppSettings } from '../types';
import { THEME_PRESETS, APP_FONTS, MODEL_IMAGE_FLASH, MODEL_IMAGE_PRO } from '../constants';
import { Palette, Type, Cpu, Zap, Star, CheckCircle, Cloud, MessageSquare, ChevronDown, Check, LogOut, Key } from 'lucide-react';
import { clearApiKey, hasValidKey } from '../services/geminiService';

interface Props {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  // Project Management Actions (Hidden but kept in interface to avoid breaking parent usage)
  onExportZip?: () => void;
  onExportPDF?: () => void;
  onExportPPTX?: () => void;
  onSaveDB?: () => void;
  onLoadDB?: () => void;
  onExportDaVinci?: () => void;
  onConnectDrive?: () => void;
  isDriveConnected?: boolean;
}

export const SettingsPanel: React.FC<Props> = ({ settings, onUpdate, onConnectDrive, isDriveConnected }) => {
  
  const update = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
  };

  const handleClearKey = () => {
      if (window.confirm("Are you sure you want to remove the API Key? You will need to enter it again to use Valera.")) {
          clearApiKey();
          window.location.reload();
      }
  };

  // Helper for Segmented Control
  const SegmentedControl = ({ options, value, onChange }: { options: {label: string, value: string, icon?: React.ReactNode}[], value: string, onChange: (v: string) => void }) => (
    <div className="flex bg-[var(--bg-header)] p-1 rounded-lg border border-[var(--border-color)]">
        {options.map(opt => (
            <button
                key={opt.value}
                onClick={() => onChange(opt.value)}
                className={`flex-1 py-1.5 px-2 rounded-md text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1.5
                ${value === opt.value ? 'bg-[var(--bg-card)] text-[var(--text-main)] shadow-sm border border-[var(--border-color)]' : 'text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
            >
                {opt.icon}
                {opt.label}
            </button>
        ))}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in pb-32 pt-8 px-4">
      
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Settings</h2>
      </div>

      {/* 1. VISUAL IDENTITY (Compact) */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Palette size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Theme</h3>
          </div>
          <div className="p-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {THEME_PRESETS.map(theme => {
                      const isSelected = settings.themeId === theme.id;
                      return (
                          <button
                              key={theme.id}
                              onClick={() => update('themeId', theme.id)}
                              className={`relative group flex items-center gap-2 p-2 rounded-lg border transition-all text-left
                              ${isSelected ? 'bg-[var(--accent)]/10 border-[var(--accent)]' : 'border-transparent hover:bg-[var(--bg-input)]'}`}
                          >
                              <div className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: theme.colors.bgMain }}></div>
                              <span className={`text-[10px] font-bold truncate flex-1 ${isSelected ? 'text-[var(--text-main)]' : 'text-[var(--text-muted)]'}`}>{theme.name.replace(' (Default)', '')}</span>
                              {isSelected && <Check size={10} className="text-[var(--accent)]"/>}
                          </button>
                      );
                  })}
              </div>
          </div>
      </section>

      {/* 2. TYPOGRAPHY (Compact) */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Type size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Typography</h3>
          </div>
          <div className="p-3">
              <div className="relative">
                  <select 
                      value={settings.fontFamily}
                      onChange={(e) => update('fontFamily', e.target.value)}
                      className="w-full appearance-none bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] font-bold focus:border-[var(--accent)] focus:outline-none cursor-pointer"
                  >
                      {APP_FONTS.map(font => (
                          <option key={font.name} value={font.value}>{font.name}</option>
                      ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"/>
              </div>
          </div>
      </section>

      {/* 3. SYSTEM & AI (Minimalist Toggles) */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Cpu size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">System</h3>
          </div>
          
          <div className="p-4 space-y-5">
              
              {/* Image Engine */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center justify-between">
                      Image Model
                      <span className="text-[9px] text-[var(--accent)]">{settings.imageModel === MODEL_IMAGE_PRO ? 'Pro (High Quality)' : 'Flash (Fast)'}</span>
                  </label>
                  <SegmentedControl 
                      value={settings.imageModel}
                      onChange={(v) => update('imageModel', v)}
                      options={[
                          { label: 'Nano Banana (Flash)', value: MODEL_IMAGE_FLASH, icon: <Zap size={10}/> },
                          { label: 'Nano Banana 2 (Pro)', value: MODEL_IMAGE_PRO, icon: <Star size={10}/> }
                      ]}
                  />
              </div>

              {/* Chat Font Size */}
              <div className="space-y-2">
                  <div className="flex justify-between items-center">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
                          <MessageSquare size={12}/> Chat Text Size
                      </label>
                      <span className="text-[10px] font-bold text-[var(--text-main)]">{settings.chatFontSize || 12}px</span>
                  </div>
                  <input 
                      type="range" 
                      min="10" 
                      max="24" 
                      step="1"
                      value={settings.chatFontSize || 12} 
                      onChange={(e) => update('chatFontSize', parseInt(e.target.value))}
                      className="w-full h-1.5 bg-[var(--bg-input)] rounded-full appearance-none accent-[var(--accent)] cursor-pointer"
                  />
              </div>

              {/* API KEY LOGOUT */}
              <div className="flex items-center justify-between pt-4 border-t border-[var(--border-color)]">
                  <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                          <Key size={14} className="text-[var(--text-muted)]"/> 
                          API Access
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)]">Manage your Gemini Key</span>
                  </div>
                  <button 
                      onClick={handleClearKey}
                      className="px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30 rounded-md text-[10px] font-bold uppercase flex items-center gap-2 transition-all"
                  >
                      <LogOut size={12}/> Change Key
                  </button>
              </div>

              {/* Google Drive Toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-[var(--border-color)]">
                  <div className="flex flex-col">
                      <span className="text-xs font-bold text-[var(--text-main)] flex items-center gap-2">
                          <Cloud size={14} className={isDriveConnected ? "text-green-400" : "text-[var(--text-muted)]"}/> 
                          Cloud Sync
                      </span>
                      <span className="text-[9px] text-[var(--text-muted)]">Backup generated assets to Google Drive</span>
                  </div>
                  <button 
                      onClick={() => !isDriveConnected && onConnectDrive && onConnectDrive()}
                      disabled={isDriveConnected}
                      className={`w-10 h-5 rounded-full relative transition-colors ${isDriveConnected ? 'bg-green-500 cursor-default' : 'bg-[#333] hover:bg-[#444]'}`}
                  >
                      <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${isDriveConnected ? 'left-6' : 'left-1'}`} />
                  </button>
              </div>

          </div>
      </section>

    </div>
  );
};
