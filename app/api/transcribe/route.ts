import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { mkdir, access, readFile, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

// import ytdl from 'ytdl-core';
import YTDlpWrap from 'yt-dlp-wrap';

// Convert callback-based fs functions to Promise-based
const unlink = promisify(fs.unlink);

// Define paths
const tempDir = path.join(process.cwd(), 'temp');
const publicDir = path.join(process.cwd(), 'public', 'audio');

// Initialize yt-dlp-wrap
const ytDlpWrap = new YTDlpWrap();
let isYtDlpDownloaded = false;

// Interfaces
interface DeepgramTranscriptionResult {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
        confidence?: number;
        words?: Array<{
          word?: string;
          start?: number;
          end?: number;
          confidence?: number;
          punctuated_word?: string;
        }>;
      }>;
    }>;
  };
}

interface AudioFormat {
  audioBitrate?: number;
  qualityLabel?: string;
  audioQuality?: string;
  [key: string]: unknown; // Use unknown instead of any
}

// Transcribe audio file using Deepgram
async function transcribeAudio(audioFilePath: string): Promise<DeepgramTranscriptionResult> {
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  const audioStream = fs.createReadStream(audioFilePath);

  audioStream.on('error', (err: Error) => {
    console.error('Error reading audio file:', err);
    throw err;
  });

  const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
    audioStream,
    {
      model: "nova-3",
      smart_format: true,
    }
  );

  if (error) {
    console.error('Deepgram transcription error:', error);
    throw error;
  }

  return result;
}

// Download YouTube audio and transcribe it
async function transcribeYouTubeUrl(youtubeUrl: string): Promise<{ result: DeepgramTranscriptionResult, audioUrl: string }> {
  // if (!ytdl.validateURL(youtubeUrl)) {
  //   throw new Error(\'Invalid YouTube URL provided\');
  // }

  let audioFilePath = '';

  try {
    // Create directories if they don't exist
    await createDirectoriesIfNeeded();

    // Generate filenames
    const audioId = randomUUID();
    const audioFileName = `${audioId}.mp3`;
    audioFilePath = path.join(tempDir, audioFileName);
    const publicAudioPath = path.join(publicDir, audioFileName);

    // Get video info
    const info = await ytDlpWrap.getVideoInfo(youtubeUrl);
    console.log('Video info obtained:', info.title);

    // Download audio and get transcription
    // The info object might be useful for metadata, but downloadAndTranscribe will use youtubeUrl for the download
    const { result, audioUrl } = await downloadAndTranscribe(youtubeUrl, audioFilePath, publicAudioPath, audioFileName);
    return { result, audioUrl };

  } catch (err) {
    // Clean up on error
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        await unlink(audioFilePath);
      } catch (cleanupErr) {
        console.error('Failed to clean up audio file:', cleanupErr);
      }
    }

    throw err instanceof Error ? err : new Error(String(err));
  }
}

// Helper function to create necessary directories
async function createDirectoriesIfNeeded(): Promise<void> {
  try {
    await access(tempDir);
  } catch {
    await mkdir(tempDir, { recursive: true });
  }

  try {
    await mkdir(publicDir, { recursive: true });
  } catch (err) {
    console.warn('Public directory error:', err);
  }
}

// Helper function to download audio and transcribe it
async function downloadAndTranscribe(
  // info: any, // Placeholder for yt-dlp info type 
  // audioFormat: AudioFormat, 
  youtubeUrl: string, // Pass youtubeUrl directly
  audioFilePath: string,
  publicAudioPath: string,
  audioFileName: string
): Promise<{ result: DeepgramTranscriptionResult, audioUrl: string }> {
  const writeStream = fs.createWriteStream(audioFilePath);

  return new Promise((resolve, reject) => {
    const stream = ytDlpWrap.execStream([
      youtubeUrl, // Use the direct URL
      '-f',
      'bestaudio/best', // yt-dlp format selection for best audio
      '-o',
      '-' // Output to stdout to pipe it
    ]);

    stream.on('error', (err: Error) => {
      console.error('Error downloading YouTube audio with yt-dlp-wrap:', err);
      reject(new Error(`Download failed: ${err.message}`));
    });

    stream.pipe(writeStream);

    writeStream.on('finish', async () => {
      try {
        // Copy to public directory for web access
        const fileData = await readFile(audioFilePath);
        await writeFile(publicAudioPath, fileData);

        // Transcribe audio
        const result = await transcribeAudio(audioFilePath);
        const audioUrl = `/audio/${audioFileName}`;

        resolve({ result, audioUrl });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        reject(new Error(`Processing failed: ${error.message}`));
      }
    });

    writeStream.on('error', (err: Error) => {
      reject(new Error(`File write error: ${err.message}`));
    });
  });
}

// API configuration for large files
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: '50mb',
  },
};

export async function POST(request: NextRequest) {
  try {
    // Ensure yt-dlp is available
    if (!isYtDlpDownloaded) {
      try {
        await ytDlpWrap.getVersion();
        isYtDlpDownloaded = true;
        console.log('yt-dlp found in PATH');
      } catch (e) {
        console.log('yt-dlp not found in PATH, attempting to download...');
        try {
          await YTDlpWrap.downloadFromGithub(); // Downloads to ./yt-dlp by default
          ytDlpWrap.setBinaryPath('./yt-dlp');
          isYtDlpDownloaded = true;
          console.log('yt-dlp downloaded successfully and path set.');
        } catch (downloadError) {
          console.error('Failed to download yt-dlp:', downloadError);
          // If download fails, we might not be able to proceed.
          // Depending on requirements, could throw error or try to use a system-installed version if path was the issue.
          return NextResponse.json({ error: 'Failed to initialize video downloader.' }, { status: 500 });
        }
      }
    }

    const { youtubeUrl } = await request.json();

    if (!youtubeUrl) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    // if (!ytdl.validateURL(youtubeUrl)) {
    //   return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    // }

    // Get video info and transcribe
    // const videoInfo = await ytdl.getBasicInfo(youtubeUrl);
    const videoInfo = await ytDlpWrap.getVideoInfo(youtubeUrl);
    console.log("Video title:", videoInfo.title); // Access title directly if available

    const { result: transcriptionResult, audioUrl } = await transcribeYouTubeUrl(youtubeUrl);

    // Get transcript text
    const transcriptText = transcriptionResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      "No transcript was generated.";

    // Call moderation API
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
    const moderationResponse = await fetch(`${baseUrl}/api/moderate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript: transcriptText }),
    });

    const moderationData = await moderationResponse.json();

    // Return combined results
    return NextResponse.json({
      transcription: {
        channels: [{
          alternatives: [{
            transcript: transcriptText,
            confidence: transcriptionResult?.results?.channels?.[0]?.alternatives?.[0]?.confidence,
            words: transcriptionResult?.results?.channels?.[0]?.alternatives?.[0]?.words || [],
          }]
        }]
      },
      moderationResults: moderationData,
      audioUrl,
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    );
  }
} 