
import { ProjectData } from '../types';

// Helper to ensure we always have a string before calling string methods
const safeStr = (val: any, fallback: string = ""): string => {
    if (val === null || val === undefined) return fallback;
    return String(val);
};

/**
 * Helper to format frames to Timecode (HH:MM:SS:FF)
 */
const framesToTimecode = (totalFrames: number, fps: number): string => {
    const hours = Math.floor(totalFrames / (3600 * fps));
    const minutes = Math.floor((totalFrames % (3600 * fps)) / (60 * fps));
    const seconds = Math.floor(((totalFrames % (3600 * fps)) % (60 * fps)) / fps);
    const frames = Math.floor(((totalFrames % (3600 * fps)) % (60 * fps)) % fps);

    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}:${pad(frames)}`;
};

/**
 * Generates a Python script (.py) compatible with DaVinci Resolve's Scripting API.
 * This script automates the import process: finds images, creates timeline, places clips.
 */
export const generateDaVinciPythonScript = (project: ProjectData): string => {
    const fps = project.timelineSettings.fps || 24;
    const rawAppName = project.meta?.appName || "Valera Project";
    const projectName = safeStr(rawAppName).replace(/[^a-z0-9 ]/gi, '');
    
    // Create a JSON-like structure of the scenes to embed in the Python script
    const sceneData = project.timeline.map((frame, index) => {
        const rawTitle = frame.title || `Scene_${index + 1}`;
        const safeTitle = safeStr(rawTitle).replace(/[^a-z0-9]/gi, '_');
        
        return {
            filename: `Scene_${index + 1}_${safeTitle}.png`,
            durationSec: frame.duration || 4,
            name: safeStr(frame.title, `Scene ${index + 1}`)
        };
    });

    const pythonScript = `
#!/usr/bin/env python
import sys
import os

# --- VALERA PRE-PRODUCTION: AUTOMATED IMPORT SCRIPT ---
# 1. Open DaVinci Resolve
# 2. Go to "Workspace" -> "Console" -> Select "Py3" (Python 3)
# 3. Drag and drop this file into the console window or run it.
# NOTE: Ensure the 'images' folder is in the same directory as this script.

def ImportProject():
    try:
        import DaVinciResolveScript as dvr_script
    except ImportError:
        print("Error: Could not import DaVinciResolveScript. Are you running this inside DaVinci Console?")
        return

    resolve = dvr_script.scriptapp("Resolve")
    projectManager = resolve.GetProjectManager()
    project = projectManager.GetCurrentProject()
    
    if not project:
        print("Error: No project open in DaVinci Resolve.")
        return

    mediaPool = project.GetMediaPool()
    rootFolder = mediaPool.GetRootFolder()
    
    # Configuration
    FPS = ${fps}
    SCENES = ${JSON.stringify(sceneData, null, 4)}
    
    # 1. Locate Images Folder
    # We assume the script is located in the root of the exported folder
    script_path = os.path.dirname(os.path.abspath(__file__)) if '__file__' in locals() else os.getcwd()
    images_path = os.path.join(script_path, "images")
    
    if not os.path.exists(images_path):
        print(f"Error: Images folder not found at {images_path}")
        # Fallback: Ask user input if running in interactive shell (rare in DVR console)
        return

    print(f"Found images at: {images_path}")

    # 2. Create Bin
    valeraBin = mediaPool.AddSubFolder(rootFolder, "Valera Import")
    mediaPool.SetCurrentFolder(valeraBin)

    # 3. Import Media
    # We construct full paths
    files_to_import = []
    file_map = {} # Map filename to scene index/data
    
    for scene in SCENES:
        full_path = os.path.join(images_path, scene['filename'])
        if os.path.exists(full_path):
            files_to_import.append(full_path)
            file_map[scene['filename']] = scene
        else:
            print(f"Warning: Missing file {full_path}")

    if not files_to_import:
        print("No files found to import.")
        return

    importedItems = mediaPool.ImportMedia(files_to_import)
    
    # Map imported MediaPoolItems by their file name property
    item_lookup = {}
    for item in importedItems:
        item_lookup[item.GetName()] = item

    # 4. Create Timeline
    timelineName = "${projectName} Timeline"
    timeline = mediaPool.CreateEmptyTimeline(timelineName)
    
    if not timeline:
        print("Failed to create timeline.")
        return

    print(f"Created Timeline: {timelineName}")

    # 5. Append Clips to Timeline
    # We define an "Append" operation list
    # Note: DaVinci AppendToTimeline takes a list of clipInfo dictionaries.
    
    clip_entries = []
    
    for scene in SCENES:
        fname = scene['filename']
        if fname in item_lookup:
            mediaItem = item_lookup[fname]
            
            # Calculate frames
            duration_frames = int(scene['durationSec'] * FPS)
            
            clip_entry = {
                "mediaPoolItem": mediaItem,
                "startFrame": 0,
                "endFrame": duration_frames, # For images, this sets the duration
                "mediaType": 1 # Video
            }
            clip_entries.append(clip_entry)
            print(f"Queued: {scene['name']} ({duration_frames} frames)")

    if clip_entries:
        timeline.AppendToTimeline(clip_entries)
        print("Successfully appended clips to timeline.")
    else:
        print("No clips were prepared for timeline.")

    print("--- Valera Import Complete ---")

if __name__ == "__main__":
    ImportProject()
`;

    return pythonScript.trim();
};

/**
 * Generates an FCPXML 1.9 file tailored for DaVinci Resolve compatibility.
 * Removes strict file:// paths to allow easier relinking.
 */
export const generateDaVinciXML = (project: ProjectData): string => {
    const fps = project.timelineSettings.fps || 24;
    const frameDuration = `1/${fps}s`; // Standard notation
    const width = project.timelineSettings.width || 1920;
    const height = project.timelineSettings.height || 1080;
    
    // Calculate total duration in standard notation
    const totalDurationSeconds = project.timeline.reduce((acc, f) => acc + (f.duration || 4), 0);

    let resourcesXml = '';
    let clipsXml = '';
    let currentStartSeconds = 0;

    project.timeline.forEach((frame, index) => {
        const durationSec = frame.duration || 4;
        const rawTitle = frame.title || `Scene_${index+1}`;
        const safeTitle = safeStr(rawTitle).replace(/[^a-z0-9]/gi, '_');
        const filename = `Scene_${index + 1}_${safeTitle}.png`;
        const resId = `r${index + 1}`;
        
        // Resource: We use a relative path. DaVinci will likely mark as offline and ask to relink, which is standard.
        // We add 'timebase' to match fps.
        resourcesXml += `
        <asset id="${resId}" name="${filename}" uid="${resId}" src="./images/${filename}" start="0s" duration="${durationSec}s" hasVideo="1" format="r1" />`;

        // Clip in Sequence
        // offset: where it starts in the timeline
        // start: start point within the media (0s usually for images)
        // duration: length of clip
        const offset = `${currentStartSeconds}s`; 
        
        const note = safeStr(frame.description || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const clipName = safeStr(frame.title || 'Scene').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

        clipsXml += `
                    <asset-clip name="${clipName}" ref="${resId}" offset="${offset}" start="0s" duration="${durationSec}s" lane="0" format="r1">
                        <note>${note}</note>
                    </asset-clip>`;
        
        currentStartSeconds += durationSec;
    });

    const rawAppName = project.meta?.appName || 'Valera Project';
    const safeAppName = safeStr(rawAppName).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
    <resources>
        <format id="r1" name="FFVideoFormat${width}x${height}p${fps}" frameDuration="${frameDuration}" width="${width}" height="${height}" colorSpace="1-1-1 (Rec. 709)"/>
        ${resourcesXml}
    </resources>
    <library>
        <event name="Valera Export">
            <project name="${safeAppName}">
                <sequence format="r1" duration="${totalDurationSeconds}s" tcStart="0s" tcFormat="NDF" audioLayout="stereo" audioRate="48k">
                    <spine>
                        ${clipsXml}
                    </spine>
                </sequence>
            </project>
        </event>
    </library>
</fcpxml>`;

    return xml;
};

/**
 * Generates a CMX 3600 EDL (Edit Decision List).
 * This is the most robust fallback format for DaVinci Resolve.
 */
export const generateEDL = (project: ProjectData): string => {
    const fps = project.timelineSettings.fps || 24;
    const rawAppName = project.meta?.appName || "VALERA_PROJ";
    const title = safeStr(rawAppName).toUpperCase().replace(/[^A-Z0-9 ]/g, '').substring(0, 50);
    
    let edl = `TITLE: ${title}\nFCM: NON-DROP FRAME\n\n`;
    
    let currentFrameCount = 0;

    project.timeline.forEach((frame, index) => {
        const durationSec = frame.duration || 4;
        const durationFrames = Math.round(durationSec * fps);
        const rawTitle = frame.title || `Scene_${index+1}`;
        const safeTitle = safeStr(rawTitle).replace(/[^a-z0-9]/gi, '_');
        const filename = `Scene_${index + 1}_${safeTitle}.png`;
        
        // EDL Index
        const editId = (index + 1).toString().padStart(3, '0');
        
        // Source Timecode (Images act as 00:00:00:00 start)
        const srcIn = "00:00:00:00";
        const srcOut = framesToTimecode(durationFrames, fps);
        
        // Record Timecode (Timeline Position)
        const recIn = framesToTimecode(currentFrameCount, fps);
        const recOut = framesToTimecode(currentFrameCount + durationFrames, fps);

        // Standard CMX 3600 Line:
        // ID  TapeName  Audio/Video  Trans  SrcIn SrcOut RecIn RecOut
        // Using "AX" as generic aux tape name for file-based workflows
        edl += `${editId}  AX       V     C        ${srcIn} ${srcOut} ${recIn} ${recOut}\n`;
        
        // Comment with filename (DaVinci reads this to link media)
        edl += `* FROM CLIP NAME: ${filename}\n`;
        // Comment with description
        if (frame.description) {
            const safeDesc = safeStr(frame.description);
            edl += `* COMMENT: ${safeDesc.replace(/\n/g, ' ').substring(0, 80)}\n`;
        }
        edl += `\n`;

        currentFrameCount += durationFrames;
    });

    return edl;
};
