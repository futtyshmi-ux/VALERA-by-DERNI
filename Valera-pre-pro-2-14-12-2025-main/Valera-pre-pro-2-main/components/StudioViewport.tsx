
import React, { useState, useRef, useEffect, Suspense } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, TransformControls, Text, Grid, PerspectiveCamera, Environment, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import { Box, Circle, Cylinder, Move, RotateCw, Maximize, Camera, Check, X, Trash2, MousePointer2, Image as ImageIcon, Layers } from 'lucide-react';

interface Props {
    onCapture: (base64: string) => void;
    onClose: () => void;
}

interface SceneObject {
    id: string;
    type: 'cube' | 'sphere' | 'cylinder';
    position: [number, number, number];
    scale: [number, number, number];
    rotation: [number, number, number];
    color: string;
}

// --- SUB-COMPONENTS ---

const NavigationCube = () => {
    return (
        <group position={[0, 0.5, 0]}>
            {/* Wireframe Box */}
            <mesh>
                <boxGeometry args={[1, 1, 1]} />
                <meshBasicMaterial color="#333" wireframe />
            </mesh>
            
            {/* Faces Text - Using strict orientation from prompt: X+ Left, X- Right */}
            <Text position={[0, 0, 0.51]} fontSize={0.2} color="#00D4FF" anchorX="center" anchorY="middle">FRONT (Z+)</Text>
            <Text position={[0, 0, -0.51]} rotation={[0, Math.PI, 0]} fontSize={0.2} color="#00D4FF" anchorX="center" anchorY="middle">BACK (Z-)</Text>
            
            <Text position={[0.51, 0, 0]} rotation={[0, Math.PI / 2, 0]} fontSize={0.2} color="#FF4444" anchorX="center" anchorY="middle">LEFT (X+)</Text>
            <Text position={[-0.51, 0, 0]} rotation={[0, -Math.PI / 2, 0]} fontSize={0.2} color="#FF4444" anchorX="center" anchorY="middle">RIGHT (X-)</Text>
            
            <Text position={[0, 0.51, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.2} color="#44FF44" anchorX="center" anchorY="middle">TOP (Y+)</Text>
        </group>
    );
};

const SceneContent = ({ 
    objects, 
    selectedId, 
    onSelect, 
    transformMode,
    onTransformEnd,
    fov
}: { 
    objects: SceneObject[], 
    selectedId: string | null, 
    onSelect: (id: string | null) => void,
    transformMode: 'translate' | 'rotate' | 'scale',
    onTransformEnd: (id: string, newProps: Partial<SceneObject>) => void,
    fov: number
}) => {
    const { camera, gl } = useThree();
    const transformRef = useRef<any>(null);

    useEffect(() => {
        if (camera instanceof THREE.PerspectiveCamera) {
            camera.fov = fov;
            camera.updateProjectionMatrix();
        }
    }, [fov, camera]);

    const handleObjectClick = (e: any, id: string) => {
        e.stopPropagation();
        onSelect(id);
    };

    const handleMiss = () => {
        onSelect(null);
    };

    // Helper to update object state after transform
    const onEnd = () => {
        if (transformRef.current && selectedId) {
            const o = transformRef.current.object;
            onTransformEnd(selectedId, {
                position: [o.position.x, o.position.y, o.position.z],
                rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
                scale: [o.scale.x, o.scale.y, o.scale.z]
            });
        }
    };

    return (
        <>
            <OrbitControls makeDefault enableDamping={false} />
            <ambientLight intensity={0.7} />
            <directionalLight position={[10, 10, 5]} intensity={1} castShadow />
            
            {/* Floor Grid */}
            <Grid infiniteGrid sectionColor="#444" cellColor="#222" fadeDistance={30} sectionThickness={1} cellThickness={0.5} position={[0, -0.01, 0]} />
            <axesHelper args={[2]} position={[0, 0.01, 0]} />
            
            {/* Reference */}
            <NavigationCube />

            <group onPointerMissed={handleMiss}>
                {objects.map(obj => (
                    <mesh
                        key={obj.id}
                        position={obj.position}
                        rotation={obj.rotation}
                        scale={obj.scale}
                        onClick={(e) => handleObjectClick(e, obj.id)}
                        castShadow
                        receiveShadow
                    >
                        {obj.type === 'cube' && <boxGeometry />}
                        {obj.type === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
                        {obj.type === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
                        
                        <meshStandardMaterial 
                            color={selectedId === obj.id ? '#00D4FF' : obj.color} 
                            roughness={0.3}
                            metalness={0.1}
                        />
                    </mesh>
                ))}
            </group>

            {selectedId && (
                <TransformControls 
                    ref={transformRef}
                    object={gl.scene.getObjectByProperty('uuid', objects.find(o => o.id === selectedId)?.id) as any} 
                />
            )}
            
            {/* Attach TransformControls to selected object */}
            {objects.map(obj => (
                selectedId === obj.id && (
                    <TransformControls
                        key={`tc-${obj.id}`}
                        position={obj.position}
                        rotation={obj.rotation}
                        scale={obj.scale}
                        mode={transformMode}
                        onMouseUp={onEnd}
                    >
                        <mesh 
                            onClick={(e) => handleObjectClick(e, obj.id)}
                            castShadow receiveShadow
                        >
                            {obj.type === 'cube' && <boxGeometry />}
                            {obj.type === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
                            {obj.type === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
                            <meshStandardMaterial color="#00D4FF" />
                        </mesh>
                    </TransformControls>
                )
            ))}
            
            {/* Render NON-selected objects normally */}
            {objects.map(obj => (
                selectedId !== obj.id && (
                    <mesh
                        key={obj.id}
                        position={obj.position}
                        rotation={obj.rotation}
                        scale={obj.scale}
                        onClick={(e) => handleObjectClick(e, obj.id)}
                        castShadow receiveShadow
                    >
                        {obj.type === 'cube' && <boxGeometry />}
                        {obj.type === 'sphere' && <sphereGeometry args={[0.5, 32, 32]} />}
                        {obj.type === 'cylinder' && <cylinderGeometry args={[0.5, 0.5, 1, 32]} />}
                        <meshStandardMaterial color={obj.color} />
                    </mesh>
                )
            ))}
        </>
    );
};

// --- MAIN COMPONENT ---

export const StudioViewport: React.FC<Props> = ({ onCapture, onClose }) => {
    const [objects, setObjects] = useState<SceneObject[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [transformMode, setTransformMode] = useState<'translate' | 'rotate' | 'scale'>('translate');
    const [fov, setFov] = useState(50);
    
    // Reference Image State
    const [refImage, setRefImage] = useState<string | null>(null);
    const [refOpacity, setRefOpacity] = useState(0.5);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Helper: Add Object
    const addObject = (type: 'cube' | 'sphere' | 'cylinder') => {
        const newObj: SceneObject = {
            id: Date.now().toString(),
            type,
            position: [Math.random() * 2 - 1, 0.5, Math.random() * 2 - 1], // Randomize slightly around center
            rotation: [0, 0, 0],
            scale: [1, 1, 1],
            color: '#888888' // Greyboxing default
        };
        setObjects(prev => [...prev, newObj]);
        setSelectedId(newObj.id);
    };

    const deleteSelected = () => {
        if (selectedId) {
            setObjects(prev => prev.filter(o => o.id !== selectedId));
            setSelectedId(null);
        }
    };

    const handleUpdateObject = (id: string, newProps: Partial<SceneObject>) => {
        setObjects(prev => prev.map(o => o.id === id ? { ...o, ...newProps } : o));
    };

    const handleCapture = () => {
        // We only capture the 3D Canvas, effectively "hiding" the reference image from the result
        const canvas = document.querySelector('#studio-canvas canvas') as HTMLCanvasElement;
        if (canvas) {
            const dataUrl = canvas.toDataURL('image/png');
            onCapture(dataUrl);
        }
    };

    const handleRefUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (ev) => {
                setRefImage(ev.target?.result as string);
                setRefOpacity(0.5); // Reset opacity on new load
            };
            reader.readAsDataURL(file);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex flex-col bg-[#111] text-white">
            
            {/* TOP BAR */}
            <div className="h-14 border-b border-[#333] flex items-center justify-between px-4 bg-[#1a1a1a] z-50 relative">
                <div className="flex items-center gap-4">
                    <span className="font-bold text-[var(--accent)] flex items-center gap-2">
                        <Box size={18}/> 3D PRE-VIZ
                    </span>
                    <div className="h-6 w-px bg-[#333]"></div>
                    {/* Add Buttons */}
                    <div className="flex items-center gap-1">
                        <button onClick={() => addObject('cube')} className="p-2 hover:bg-[#333] rounded text-gray-300 hover:text-white" title="Add Cube"><Box size={16}/></button>
                        <button onClick={() => addObject('sphere')} className="p-2 hover:bg-[#333] rounded text-gray-300 hover:text-white" title="Add Sphere"><Circle size={16}/></button>
                        <button onClick={() => addObject('cylinder')} className="p-2 hover:bg-[#333] rounded text-gray-300 hover:text-white" title="Add Cylinder"><Cylinder size={16}/></button>
                    </div>
                    
                    <div className="h-6 w-px bg-[#333]"></div>
                    
                    {/* Reference Loader */}
                    <button 
                        onClick={() => fileInputRef.current?.click()}
                        className={`px-3 py-1.5 rounded text-xs font-bold uppercase flex items-center gap-2 border transition-all ${refImage ? 'bg-[var(--accent)]/10 border-[var(--accent)] text-[var(--accent)]' : 'border-[#444] text-gray-400 hover:text-white hover:border-gray-400'}`}
                    >
                        <ImageIcon size={14}/> {refImage ? 'Change Ref' : 'Load Ref'}
                    </button>
                    <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleRefUpload} />
                </div>

                <div className="flex items-center gap-4">
                    {/* Transform Modes */}
                    <div className="flex bg-[#222] rounded p-1">
                        <button 
                            onClick={() => setTransformMode('translate')} 
                            className={`p-1.5 rounded ${transformMode === 'translate' ? 'bg-[var(--accent)] text-black' : 'text-gray-400 hover:text-white'}`}
                            title="Translate (Move)"
                        >
                            <Move size={14}/>
                        </button>
                        <button 
                            onClick={() => setTransformMode('rotate')} 
                            className={`p-1.5 rounded ${transformMode === 'rotate' ? 'bg-[var(--accent)] text-black' : 'text-gray-400 hover:text-white'}`}
                            title="Rotate"
                        >
                            <RotateCw size={14}/>
                        </button>
                        <button 
                            onClick={() => setTransformMode('scale')} 
                            className={`p-1.5 rounded ${transformMode === 'scale' ? 'bg-[var(--accent)] text-black' : 'text-gray-400 hover:text-white'}`}
                            title="Scale"
                        >
                            <Maximize size={14}/>
                        </button>
                    </div>

                    {/* Delete */}
                    <button 
                        onClick={deleteSelected} 
                        disabled={!selectedId}
                        className={`p-2 rounded transition-colors ${selectedId ? 'text-red-400 hover:bg-red-500/20' : 'text-gray-600 cursor-not-allowed'}`}
                    >
                        <Trash2 size={16}/>
                    </button>

                    <div className="h-6 w-px bg-[#333]"></div>

                    <button onClick={onClose} className="p-2 hover:bg-[#333] rounded text-gray-400 hover:text-white"><X size={18}/></button>
                </div>
            </div>

            {/* MAIN VIEWPORT */}
            <div className="flex-1 relative overflow-hidden" id="studio-canvas">
                
                {/* 2D REFERENCE PLANE (Static Background) */}
                {refImage && (
                    <img 
                        src={refImage} 
                        alt="Reference" 
                        className="absolute inset-0 w-full h-full object-contain pointer-events-none z-0"
                        style={{ opacity: refOpacity }} 
                    />
                )}

                {/* 3D SCENE (Transparent Canvas) */}
                <Canvas 
                    gl={{ preserveDrawingBuffer: true, alpha: true }} 
                    shadows 
                    camera={{ position: [3, 3, 3], fov: 50 }}
                    className="z-10 relative"
                >
                    <Suspense fallback={null}>
                        <SceneContent 
                            objects={objects} 
                            selectedId={selectedId} 
                            onSelect={setSelectedId}
                            transformMode={transformMode}
                            onTransformEnd={handleUpdateObject}
                            fov={fov}
                        />
                    </Suspense>
                </Canvas>

                {/* OVERLAY: Bottom Controls */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-[#1a1a1a]/90 border border-[#333] p-4 rounded-xl flex items-center gap-6 shadow-2xl backdrop-blur-md z-20">
                    
                    {/* FOV Control */}
                    <div className="flex flex-col gap-1 w-40">
                        <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-2">
                            <Camera size={12}/> Lens (FOV): {fov}°
                        </label>
                        <input 
                            type="range" 
                            min="15" 
                            max="100" 
                            value={fov} 
                            onChange={(e) => setFov(Number(e.target.value))}
                            className="w-full h-1 bg-[#444] rounded-lg appearance-none cursor-pointer accent-[var(--accent)]"
                        />
                    </div>

                    {/* Reference Opacity Control (Only if Image Loaded) */}
                    {refImage && (
                        <>
                            <div className="h-8 w-px bg-[#444]"></div>
                            <div className="flex flex-col gap-1 w-40">
                                <label className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-2">
                                    <Layers size={12}/> Ref Opacity: {Math.round(refOpacity * 100)}%
                                </label>
                                <input 
                                    type="range" 
                                    min="0" 
                                    max="1" 
                                    step="0.05"
                                    value={refOpacity} 
                                    onChange={(e) => setRefOpacity(Number(e.target.value))}
                                    className="w-full h-1 bg-[#444] rounded-lg appearance-none cursor-pointer accent-purple-500"
                                />
                            </div>
                        </>
                    )}

                    <div className="h-8 w-px bg-[#444]"></div>
                    
                    <button 
                        onClick={handleCapture}
                        className="px-6 py-2 bg-[var(--accent)] hover:brightness-110 text-black font-bold uppercase text-xs rounded-lg shadow-lg flex items-center gap-2"
                    >
                        <Camera size={16}/> Capture Reference
                    </button>
                </div>
            </div>
        </div>
    );
};
