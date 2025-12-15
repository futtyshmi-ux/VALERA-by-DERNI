
import { ProjectData } from '../types';

/**
 * Formats seconds into SRT timestamp format: HH:MM:SS,ms
 */
const formatSRTTime = (seconds: number): string => {
    const date = new Date(0);
    date.setMilliseconds(seconds * 1000);
    const iso = date.toISOString();
    // Extract HH:MM:SS.ms and replace dot with comma for SRT standard
    return iso.substr(11, 12).replace('.', ',');
};

/**
 * Generates a .srt subtitle file string from the project timeline.
 * Uses 'dialogue' field as the subtitle text.
 */
export const generateSRT = (project: ProjectData): string => {
    let srtContent = '';
    let currentTime = 0;
    let counter = 1;

    project.timeline.forEach((frame) => {
        const duration = frame.duration || 4;
        const startTime = currentTime;
        const endTime = currentTime + duration;

        // Only generate subtitle block if there is dialogue
        if (frame.dialogue && frame.dialogue.trim().length > 0) {
            srtContent += `${counter}\n`;
            srtContent += `${formatSRTTime(startTime)} --> ${formatSRTTime(endTime)}\n`;
            srtContent += `${frame.dialogue.trim()}\n\n`;
            counter++;
        }

        currentTime += duration;
    });

    return srtContent;
};
