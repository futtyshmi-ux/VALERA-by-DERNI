
import React, { useEffect, useState } from 'react';
import { AppSettings } from '../types';
import { THEME_PRESETS, APP_FONTS, MODEL_IMAGE_FLASH, MODEL_IMAGE_PRO } from '../constants';
import { Palette, Type, Cpu, Zap, Star, CheckCircle, Cloud, MessageSquare, ChevronDown, Check, LogOut, Key, Globe, Server } from 'lucide-react';
import { clearApiKey, hasValidKey, saveApiSettings, getApiSettings, ApiProvider } from '../services/geminiService';

interface Props {
  settings: AppSettings;
  onUpdate: (newSettings: AppSettings) => void;
  // Project Management Actions
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
  const [localKey, setLocalKey] = useState('');
  const [provider, setProvider] = useState<ApiProvider>('google');

  // Load provider on mount
  useEffect(() => {
      const current = getApiSettings();
      setProvider(current.provider);
      // We don't load the key back into the input for security visual reasons usually, 
      // but if you want to edit it, we can populate it.
      if (current.key) setLocalKey(current.key);
  }, []);

  const update = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
  };

  const handleSaveApi = () => {
      if (localKey.trim().length > 5) {
          saveApiSettings(localKey, provider);
          // Reload to apply singleton changes
          window.location.reload();
      } else {
          // Just saving provider if key is empty (assuming key exists)
          if (hasValidKey()) {
              saveApiSettings('', provider); // Empty key means keep existing in storage
              window.location.reload();
          } else {
              alert("Please enter a valid API Key");
          }
      }
  };

  const handleClearKey = () => {
      if (window.confirm("Are you sure you want to remove the API Key? You will need to enter it again to use Valera.")) {
          clearApiKey();
          window.location.reload();
      }
  };

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
      
      <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-bold text-[var(--text-main)] tracking-tight">Settings</h2>
      </div>

      {/* 1. VISUAL IDENTITY */}
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

      {/* 2. API & PROVIDER SETTINGS (NEW) */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Server size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">AI Provider & Key</h3>
          </div>
          <div className="p-4 space-y-4">
              
              {/* Provider Selection */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Service Provider</label>
                  <div className="grid grid-cols-2 gap-2">
                      <button 
                          onClick={() => setProvider('google')}
                          className={`p-3 rounded-lg border text-left transition-all ${provider === 'google' ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1"><Globe size={14}/> <span className="font-bold text-xs">Google Native</span></div>
                          <div className="text-[9px] opacity-70">Official SDK. Requires VPN in some regions. Best for native Gemini features.</div>
                      </button>
                      <button 
                          onClick={() => setProvider('openrouter')}
                          className={`p-3 rounded-lg border text-left transition-all ${provider === 'openrouter' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1"><Server size={14}/> <span className="font-bold text-xs">OpenRouter</span></div>
                          <div className="text-[9px] opacity-70">Proxy service. Works globally. Supports Gemini + Flux for images.</div>
                      </button>
                  </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">
                      {provider === 'google' ? 'Google AI Studio Key' : 'OpenRouter API Key'}
                  </label>
                  <div className="flex gap-2">
                      <div className="relative flex-1">
                          <Key size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"/>
                          <input 
                              type="password" 
                              value={localKey}
                              onChange={(e) => setLocalKey(e.target.value)}
                              placeholder={provider === 'google' ? "AIzaSy..." : "sk-or-v1..."}
                              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg pl-9 pr-3 py-2 text-xs text-[var(--text-main)] focus:border-[var(--accent)] focus:outline-none"
                          />
                      </div>
                      <button 
                          onClick={handleSaveApi}
                          className="px-4 bg-[var(--accent)] text-[var(--accent-text)] hover:brightness-110 rounded-lg text-xs font-bold uppercase"
                      >
                          Save & Reload
                      </button>
                  </div>
                  <p className="text-[9px] text-[var(--text-muted)]">
                      Keys are stored locally in your browser. {provider === 'openrouter' ? 'Get key at openrouter.ai' : 'Get key at aistudio.google.com'}
                  </p>
              </div>

              {hasValidKey() && (
                  <div className="pt-2">
                      <button onClick={handleClearKey} className="text-red-500 hover:text-red-400 text-[10px] font-bold uppercase flex items-center gap-1">
                          <LogOut size={12}/> Remove stored key
                      </button>
                  </div>
              )}
          </div>
      </section>

      {/* 3. SYSTEM DEFAULTS */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Cpu size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">System Defaults</h3>
          </div>
          <div className="p-4 space-y-5">
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center justify-between">
                      Image Model Quality
                      <span className="text-[9px] text-[var(--accent)]">{settings.imageModel === MODEL_IMAGE_PRO ? 'Pro (Slower)' : 'Flash (Fast)'}</span>
                  </label>
                  <SegmentedControl 
                      value={settings.imageModel}
                      onChange={(v) => update('imageModel', v)}
                      options={[
                          { label: 'Standard (Fast)', value: MODEL_IMAGE_FLASH, icon: <Zap size={10}/> },
                          { label: 'Pro (High Quality)', value: MODEL_IMAGE_PRO, icon: <Star size={10}/> }
                      ]}
                  />
                  <p className="text-[9px] text-[var(--text-muted)]">
                      {provider === 'openrouter' ? "Note: On OpenRouter, 'Standard' uses fast models, 'Pro' uses higher quality models (Flux/Recraft/Pro)." : "Controls Nano Banana Flash vs Pro models."}
                  </p>
              </div>
          </div>
      </section>

    </div>
  );
};
