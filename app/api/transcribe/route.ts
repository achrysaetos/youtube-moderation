import { NextRequest, NextResponse } from 'next/server';
import * as path from 'path';
import { randomUUID } from 'crypto';
import YTDlpWrap from 'yt-dlp-wrap';

import {
  createTranscriptionDirectoriesIfNeeded,
  ensureYtDlpReady,
  downloadYouTubeAudio,
  transcribeAudioFile,
  cleanupTempFile,
  DeepgramTranscriptionResult // Import this type if needed for casting or explicit typing
} from '@/lib/transcriptionUtils';
import { getModerationResults } from '@/lib/moderationUtils';

// Define paths at the top level as they are constants for this route
const tempDir = path.join(process.cwd(), 'temp');
const publicDir = path.join(process.cwd(), 'public', 'audio');

// Initialize yt-dlp-wrap once
const ytDlpWrap = new YTDlpWrap();

// API configuration for large files (can remain here or be moved if preferred)
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '50mb',
    },
    responseLimit: '50mb',
  },
};

export async function POST(request: NextRequest) {
  let tempAudioFilePath = ''; // Keep track for cleanup

  try {
    // Ensure yt-dlp is ready (downloads if necessary on first run)
    await ensureYtDlpReady(ytDlpWrap);

    // Create necessary directories for temp and public audio files
    await createTranscriptionDirectoriesIfNeeded();

    const { youtubeUrl } = await request.json();

    if (!youtubeUrl) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    // --- Generate filenames and paths ---
    const audioId = randomUUID();
    const audioFileName = `${audioId}.mp3`;
    tempAudioFilePath = path.join(tempDir, audioFileName); // Used for download and transcription
    const publicAudioPath = path.join(publicDir, audioFileName); // For web access

    // --- Get Video Info (Optional, if title or other metadata is needed before download) ---
    // console.log("Fetching video info...");
    // const videoInfo = await ytDlpWrap.getVideoInfo(youtubeUrl);
    // console.log("Video title:", videoInfo.title); 
    // Note: getVideoInfo makes a network request. If only downloading, it might be redundant.

    // --- Download Audio ---
    console.log(`Downloading audio from ${youtubeUrl} to ${tempAudioFilePath}`);
    await downloadYouTubeAudio(ytDlpWrap, youtubeUrl, tempAudioFilePath, publicAudioPath);
    console.log('Audio downloaded and copied to public directory successfully.');

    // --- Transcribe Audio ---
    console.log(`Transcribing audio file: ${tempAudioFilePath}`);
    const transcriptionResult = await transcribeAudioFile(tempAudioFilePath) as DeepgramTranscriptionResult;
    console.log('Audio transcribed successfully.');

    const transcriptText = transcriptionResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript ||
      "No transcript was generated.";

    // --- Moderate Transcript --- 
    console.log('Moderating transcript...');
    const moderationData = await getModerationResults(transcriptText);
    console.log('Transcript moderated successfully.');
    console.log('Moderation Data:', JSON.stringify(moderationData, null, 2)); // Log the moderation data

    const audioUrl = `/audio/${audioFileName}`;

    // --- Return combined results ---
    return NextResponse.json({
      transcription: {
        channels: transcriptionResult?.results?.channels || [], // Ensure providing default if null
      },
      moderationResults: moderationData,
      audioUrl,
    });

  } catch (error) {
    console.error('Error in /api/transcribe POST handler:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'An unknown error occurred in transcription processing' },
      { status: 500 }
    );
  } finally {
    // --- Cleanup --- 
    if (tempAudioFilePath) {
      await cleanupTempFile(tempAudioFilePath);
    }
  }
} 