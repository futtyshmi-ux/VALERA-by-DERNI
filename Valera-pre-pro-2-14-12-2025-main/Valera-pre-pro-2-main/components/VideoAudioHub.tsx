import React, { useState } from 'react';
import { ExternalLink, Music, Video, Globe, AlertTriangle, Sparkles, Image as ImageIcon, Mic, RefreshCw } from 'lucide-react';

const AI_TOOLS = [
  {
    id: 'google-speech',
    name: 'Google Speech (TTS)',
    url: 'https://aistudio.google.com/generate-speech',
    icon: <Mic size={18} />,
    description: 'Text-to-Speech / Voices'
  },
  {
    id: 'suno',
    name: 'Suno AI',
    url: 'https://suno.com/create',
    icon: <Music size={18} />,
    description: 'Generative Audio & Music'
  },
  {
    id: 'sora',
    name: 'Sora 2 (OpenAI)',
    url: 'https://openai.com/sora',
    icon: <Video size={18} />,
    description: 'Text-to-Video Model'
  },
  {
    id: 'opal-916',
    name: 'Opal Img2Vid (9:16)',
    url: 'https://opal.google/?flow=drive:/1DFL0K60tXxRbcJyV3zSJG6byduf-BI3h&shared&mode=app',
    icon: <Video size={18} />,
    description: 'Opal Workflow: Vertical Video'
  },
  {
    id: 'opal-169',
    name: 'Opal Img2Vid (16:9)',
    url: 'https://opal.google/?flow=drive:/1XPHhiwBbB5EiDTpEunC-hJlPw30B1Xb5&shared&mode=app',
    icon: <Video size={18} />,
    description: 'Opal Workflow: Cinematic Video'
  },
  {
    id: 'opal-banan',
    name: 'Opal Banana Pro',
    url: 'https://opal.google/?flow=drive:/1XH5o0vKcjpw6lZT-qg1Y0Oiv9x0ywxWQ&shared&mode=app',
    icon: <ImageIcon size={18} />,
    description: 'Opal Workflow: Pro Image Gen'
  },
  {
    id: 'grok',
    name: 'Grok Imagine',
    url: 'https://grok.com/imagine',
    icon: <Sparkles size={18} />,
    description: 'AI Creative Generation'
  },
  {
    id: 'flow',
    name: 'Flow (Google Labs)',
    url: 'https://labs.google/flow/about',
    icon: <Video size={18} />,
    description: 'Character & Scene Animation'
  },
  {
    id: 'vivix',
    name: 'Vivix AI',
    url: 'https://vivix.ai/turbo', 
    icon: <Globe size={18} />,
    description: 'AI Video Generation'
  }
];

export const VideoAudioHub: React.FC = () => {
  const [activeTool, setActiveTool] = useState(AI_TOOLS[0]);
  const [key, setKey] = useState(0); // Used to force iframe reload

  const handleToolChange = (tool: typeof AI_TOOLS[0]) => {
    setActiveTool(tool);
    setKey(prev => prev + 1);
  };

  return (
    <div className="flex flex-col lg:flex-row h-full gap-4 animate-fade-in">
      
      {/* Sidebar / Menu */}
      <div className="w-full lg:w-72 flex-shrink-0 flex flex-col bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden">
        <div className="p-4 border-b border-[var(--border-color)] bg-[var(--bg-header)]">
             <h3 className="text-xs font-bold text-[var(--text-muted)] uppercase tracking-widest">External Production Tools</h3>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
            {AI_TOOLS.map(tool => (
            <div
                key={tool.id}
                className={`flex items-center justify-between p-2 rounded-lg transition-all group border border-transparent
                ${activeTool.id === tool.id 
                ? 'bg-[var(--accent)] text-[var(--accent-text)] shadow-lg' 
                : 'hover:bg-[var(--bg-header)] text-[var(--text-main)] hover:border-[var(--border-color)]'}`}
            >
                <button
                    onClick={() => handleToolChange(tool)}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                >
                    <div className={`p-2 rounded-lg flex-shrink-0 ${activeTool.id === tool.id ? 'bg-white/20' : 'bg-[var(--bg-input)]'}`}>
                    {tool.icon}
                    </div>
                    <div className="min-w-0">
                    <div className="font-bold text-xs truncate">{tool.name}</div>
                    <div className={`text-[9px] truncate ${activeTool.id === tool.id ? 'opacity-80' : 'text-[var(--text-muted)] group-hover:text-[var(--text-main)]'}`}>
                        {tool.description}
                    </div>
                    </div>
                </button>
                
                <a 
                    href={tool.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`p-2 rounded transition-colors flex-shrink-0 ${
                        activeTool.id === tool.id 
                        ? 'hover:bg-white/20 text-white' 
                        : 'hover:bg-[var(--bg-input)] text-[var(--text-muted)] hover:text-[var(--text-main)]'
                    }`}
                    title="Open in New Window"
                >
                    <ExternalLink size={14} />
                </a>
            </div>
            ))}
        </div>

        <div className="p-4 border-t border-[var(--border-color)] bg-[var(--bg-header)]">
           <div className="bg-[var(--bg-input)] p-3 rounded-lg flex gap-2 items-start border border-[var(--border-color)]">
              <AlertTriangle size={14} className="text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-[10px] text-[var(--text-muted)] leading-tight">
                Some tools may block embedding. Use the <ExternalLink size={8} className="inline"/> icon to open externally.
              </p>
           </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-[var(--bg-card)] rounded-xl border border-[var(--border-color)] overflow-hidden flex flex-col relative shadow-2xl">
        
        {/* Toolbar */}
        <div className="h-12 border-b border-[var(--border-color)] bg-[var(--bg-header)] flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
               <span className="font-bold text-[var(--text-main)] text-sm">{activeTool.name}</span>
               <span className="text-[10px] text-[var(--text-muted)] bg-[var(--bg-input)] px-2 py-0.5 rounded font-mono hidden md:inline max-w-[300px] truncate border border-[var(--border-color)]">{activeTool.url}</span>
            </div>
            <div className="flex gap-2">
                 <button 
                    onClick={() => setKey(prev => prev + 1)} 
                    className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-main)] hover:bg-[var(--bg-input)] rounded"
                    title="Refresh Iframe"
                 >
                    <RefreshCw size={16} />
                 </button>
                 <a 
                    href={activeTool.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-[var(--accent)] hover:brightness-110 text-[var(--accent-text)] text-xs font-bold rounded transition-colors"
                >
                    <ExternalLink size={12} /> Open in New Tab
                </a>
            </div>
        </div>

        {/* Browser / Iframe */}
        <div className="flex-1 relative bg-white">
            <iframe
                key={key}
                src={activeTool.url}
                title={activeTool.name}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
            />
        </div>

      </div>
    </div>
  );
};