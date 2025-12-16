
import React, { useEffect, useState } from 'react';
import { AppSettings } from '../types';
import { THEME_PRESETS, APP_FONTS, MODEL_IMAGE_FLASH, MODEL_IMAGE_PRO, OPENROUTER_IMAGE_MODELS } from '../constants';
import { Palette, Type, Cpu, Zap, Star, CheckCircle, Cloud, MessageSquare, ChevronDown, Check, LogOut, Key, Globe, Server, Save } from 'lucide-react';
import { clearApiKey, hasValidKey, saveKey, setActiveProvider as setGlobalProvider, getStoredKey, getApiSettings, ApiProvider } from '../services/geminiService';

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
  const [googleKey, setGoogleKey] = useState('');
  const [orKey, setOrKey] = useState('');
  const [activeProv, setActiveProv] = useState<ApiProvider>('google');

  // Load provider keys on mount
  useEffect(() => {
      setGoogleKey(getStoredKey('google'));
      setOrKey(getStoredKey('openrouter'));
      setActiveProv(getApiSettings().provider);
  }, []);

  const update = (key: keyof AppSettings, value: any) => {
    onUpdate({ ...settings, [key]: value });
  };

  const handleProviderSwitch = (provider: ApiProvider) => {
      setActiveProv(provider);
      // Smart Switch: Default to a valid model for the selected provider
      if (provider === 'google') {
          // If current is not a google model, reset to Flash
          if (settings.imageModel !== MODEL_IMAGE_FLASH && settings.imageModel !== MODEL_IMAGE_PRO) {
              update('imageModel', MODEL_IMAGE_FLASH);
          }
      } else {
          // If current is not in OpenRouter list (and not a hybrid one), default to Flux
          const isValid = OPENROUTER_IMAGE_MODELS.some(m => m.value === settings.imageModel);
          if (!isValid) {
              update('imageModel', OPENROUTER_IMAGE_MODELS[0].value);
          }
      }
  };

  const handleSaveApi = () => {
      saveKey('google', googleKey);
      saveKey('openrouter', orKey);
      setGlobalProvider(activeProv);
      window.location.reload();
  };

  const handleClearKey = () => {
      if (window.confirm("Are you sure you want to remove ALL API Keys? You will need to enter them again to use Valera.")) {
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

      {/* 2. API & PROVIDER SETTINGS (SEPARATE INPUTS) */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Server size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">AI Provider & Keys</h3>
          </div>
          <div className="p-4 space-y-5">
              
              {/* Active Provider Toggle */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase">Active Provider</label>
                  <div className="grid grid-cols-2 gap-2">
                      <button 
                          onClick={() => handleProviderSwitch('google')}
                          className={`p-3 rounded-lg border text-left transition-all relative overflow-hidden
                          ${activeProv === 'google' ? 'bg-blue-500/10 border-blue-500 text-blue-400' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1"><Globe size={14}/> <span className="font-bold text-xs">Google Native</span></div>
                          <div className="text-[9px] opacity-70">Official SDK. Best performance.</div>
                          {activeProv === 'google' && <div className="absolute top-2 right-2 w-2 h-2 bg-blue-500 rounded-full shadow-[0_0_5px_blue]"></div>}
                      </button>
                      <button 
                          onClick={() => handleProviderSwitch('openrouter')}
                          className={`p-3 rounded-lg border text-left transition-all relative overflow-hidden
                          ${activeProv === 'openrouter' ? 'bg-purple-500/10 border-purple-500 text-purple-400' : 'bg-[var(--bg-input)] border-[var(--border-color)] text-[var(--text-muted)] hover:text-[var(--text-main)]'}`}
                      >
                          <div className="flex items-center gap-2 mb-1"><Server size={14}/> <span className="font-bold text-xs">OpenRouter</span></div>
                          <div className="text-[9px] opacity-70">Proxy. Works globally.</div>
                          {activeProv === 'openrouter' && <div className="absolute top-2 right-2 w-2 h-2 bg-purple-500 rounded-full shadow-[0_0_5px_purple]"></div>}
                      </button>
                  </div>
              </div>

              <div className="w-full h-px bg-[var(--border-color)] opacity-50"></div>

              {/* Google Key Input */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
                      <Globe size={12}/> Google AI Studio Key
                  </label>
                  <div className="relative">
                      <input 
                          type="password" 
                          value={googleKey}
                          onChange={(e) => setGoogleKey(e.target.value)}
                          placeholder="AIzaSy..."
                          className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg pl-3 pr-3 py-2.5 text-xs text-[var(--text-main)] focus:border-blue-500 focus:outline-none transition-colors"
                      />
                  </div>
              </div>

              {/* OpenRouter Key Input */}
              <div className="space-y-2">
                  <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
                      <Server size={12}/> OpenRouter Key
                  </label>
                  <div className="relative">
                      <input 
                          type="password" 
                          value={orKey}
                          onChange={(e) => setOrKey(e.target.value)}
                          placeholder="sk-or-v1..."
                          className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg pl-3 pr-3 py-2.5 text-xs text-[var(--text-main)] focus:border-purple-500 focus:outline-none transition-colors"
                      />
                  </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                  {hasValidKey() && (
                      <button onClick={handleClearKey} className="px-4 py-2 text-red-500 hover:text-red-400 text-[10px] font-bold uppercase border border-red-500/30 rounded-lg hover:bg-red-500/10 transition-colors">
                          <LogOut size={14} className="inline mr-2"/> Reset Keys
                      </button>
                  )}
                  <button 
                      onClick={handleSaveApi}
                      className="px-6 py-2 bg-[var(--accent)] text-[var(--accent-text)] hover:brightness-110 rounded-lg text-xs font-bold uppercase shadow-lg flex items-center gap-2"
                  >
                      <Save size={14}/> Save & Reload
                  </button>
              </div>
              
              <p className="text-[9px] text-[var(--text-muted)] text-center">
                  Keys are stored securely in your browser's local storage.
              </p>
          </div>
      </section>

      {/* 3. SYSTEM DEFAULTS */}
      <section className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--border-color)] flex items-center gap-2">
              <Cpu size={14} className="text-[var(--accent)]"/>
              <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">Image Generation</h3>
          </div>
          <div className="p-4 space-y-5">
              
              {activeProv === 'google' && (
                  <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center justify-between">
                          Google Model Quality
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
                  </div>
              )}

              {activeProv === 'openrouter' && (
                  <div className="space-y-2">
                      <label className="text-[10px] font-bold text-[var(--text-muted)] uppercase flex items-center gap-2">
                          <Server size={12}/> OpenRouter Image Model
                      </label>
                      <div className="relative">
                          <select 
                              value={settings.imageModel}
                              onChange={(e) => update('imageModel', e.target.value)}
                              className="w-full bg-[var(--bg-input)] border border-[var(--border-color)] rounded-lg px-3 py-2 text-xs text-[var(--text-main)] font-bold focus:border-purple-500 focus:outline-none appearance-none cursor-pointer"
                          >
                              {OPENROUTER_IMAGE_MODELS.map(m => (
                                  <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                          </select>
                          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)] pointer-events-none"/>
                      </div>
                      <p className="text-[9px] text-[var(--text-muted)] leading-relaxed">
                          Note: Selecting "Nano Banana" (Google) models while on OpenRouter will attempt to use your stored Google API Key for images (Hybrid Mode).
                      </p>
                  </div>
              )}

          </div>
      </section>

    </div>
  );
};
