// lib/transcriptionUtils.ts
import * as fs from 'fs';
import * as path from 'path';
import { mkdir, access, readFile, writeFile } from 'fs/promises';
import { promisify } from 'util';
import YTDlpWrap from 'yt-dlp-wrap';
import { createClient } from '@deepgram/sdk';

const unlink = promisify(fs.unlink);
const tempDir = path.join(process.cwd(), 'temp');
const publicDir = path.join(process.cwd(), 'public', 'audio');

// Deepgram types (can be more specific if needed or imported from a central types file)
export interface DeepgramWord {
    word?: string;
    start?: number;
    end?: number;
    confidence?: number;
    punctuated_word?: string;
}

export interface DeepgramAlternative {
    transcript?: string;
    confidence?: number;
    words?: DeepgramWord[];
}

export interface DeepgramChannel {
    alternatives?: DeepgramAlternative[];
}

export interface DeepgramTranscriptionResult {
    results?: {
        channels?: DeepgramChannel[];
    };
}

// Helper function to create necessary directories
export async function createTranscriptionDirectoriesIfNeeded(): Promise<void> {
    try {
        await access(tempDir);
    } catch {
        await mkdir(tempDir, { recursive: true });
    }

    try {
        // Ensure publicDir is created before trying to write files into it later.
        await access(publicDir);
    } catch {
        await mkdir(publicDir, { recursive: true });
    }
}

let isYtDlpGlobalReady = false;

// Ensure yt-dlp is available and set path if downloaded
export async function ensureYtDlpReady(ytDlpWrapInstance: YTDlpWrap): Promise<void> {
    if (isYtDlpGlobalReady) {
        return;
    }
    try {
        await ytDlpWrapInstance.getVersion();
        isYtDlpGlobalReady = true;
        console.log('yt-dlp found in PATH by transcriptionUtil');
    } catch (e) {
        console.log('yt-dlp not found in PATH by util, attempting to download...');
        try {
            const downloadPath = path.join(process.cwd(), 'binaries'); // Specific directory for binaries
            await mkdir(downloadPath, { recursive: true });
            const binaryFilePath = path.join(downloadPath, process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp')
            await YTDlpWrap.downloadFromGithub(binaryFilePath);
            ytDlpWrapInstance.setBinaryPath(binaryFilePath);
            isYtDlpGlobalReady = true;
            console.log('yt-dlp downloaded successfully to binaries/ and path set by util.');
        } catch (downloadError) {
            console.error('Failed to download yt-dlp via util:', downloadError);
            throw new Error('Failed to initialize video downloader component.');
        }
    }
}

// Transcribe audio file using Deepgram
export async function transcribeAudioFile(audioFilePath: string): Promise<DeepgramTranscriptionResult> {
    const deepgramApiKey = process.env.DEEPGRAM_API_KEY;
    if (!deepgramApiKey) {
        console.error('DEEPGRAM_API_KEY not found.');
        throw new Error('Deepgram API key is not configured.');
    }
    const deepgram = createClient(deepgramApiKey);
    const audioStream = fs.createReadStream(audioFilePath);

    audioStream.on('error', (err: Error) => {
        console.error('Error reading audio file for transcription:', err);
        // This error needs to be propagated to the promise returned by transcribeAudioFile
        // However, directly throwing here won't work as it's in an event handler.
        // The main promise will likely reject due to Deepgram SDK error if stream fails.
    });

    try {
        const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
            audioStream,
            {
                model: "nova-3", // Consider making model configurable
                smart_format: true,
            }
        );

        if (error) {
            console.error('Deepgram transcription error in util:', error);
            throw error; // Let the caller handle this
        }
        return result as DeepgramTranscriptionResult;
    } catch (sdkError) {
        console.error('Deepgram SDK error during transcription:', sdkError);
        throw sdkError; // Let the caller handle this
    }
}

// Download YouTube audio, save it, and copy to public directory
export async function downloadYouTubeAudio(
    ytDlpWrapInstance: YTDlpWrap,
    youtubeUrl: string,
    tempAudioFilePath: string,
    publicAudioPath: string,
): Promise<void> {
    // Ensure containing directory for tempAudioFilePath exists
    await mkdir(path.dirname(tempAudioFilePath), { recursive: true });
    const writeStream = fs.createWriteStream(tempAudioFilePath);

    return new Promise((resolve, reject) => {
        const stream = ytDlpWrapInstance.execStream([
            youtubeUrl,
            '-f',
            'bestaudio/best',
            '-o',
            '-'
        ]);

        stream.on('error', (err: Error) => {
            console.error('Error downloading YouTube audio with yt-dlp-wrap in util:', err);
            writeStream.destroy(); // Clean up writestream
            reject(new Error(`Download failed: ${err.message}`));
        });

        stream.pipe(writeStream);

        writeStream.on('finish', async () => {
            try {
                // Ensure containing directory for publicAudioPath exists
                await mkdir(path.dirname(publicAudioPath), { recursive: true });
                const fileData = await readFile(tempAudioFilePath);
                await writeFile(publicAudioPath, fileData);
                resolve();
            } catch (err) {
                const error = err instanceof Error ? err : new Error(String(err));
                reject(new Error(`File copy/processing failed after download: ${error.message}`));
            }
        });

        writeStream.on('error', (err: Error) => {
            console.error('File write error during download in util:', err);
            stream.destroy(); // Clean up readstream from yt-dlp
            reject(new Error(`File write error: ${err.message}`));
        });
    });
}

// Utility to clean up temporary file
export async function cleanupTempFile(filePath: string): Promise<void> {
    if (filePath && fs.existsSync(filePath)) {
        try {
            await unlink(filePath);
            console.log(`Cleaned up temp file: ${filePath}`);
        } catch (cleanupErr) {
            console.error(`Failed to clean up temp file ${filePath}:`, cleanupErr);
        }
    }
} 