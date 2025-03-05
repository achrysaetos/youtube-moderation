import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import * as fs from 'fs';
import * as path from 'path';
import { mkdir, access } from 'fs/promises';
import { readFile, writeFile } from 'fs/promises';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

// Use dynamic import for ytdl-core (properly handled in Next.js)
// @ts-expect-error - ytdl-core doesn't have proper TypeScript types
import ytdl from 'ytdl-core';

// Convert callback-based fs functions to Promise-based
const unlink = promisify(fs.unlink);

// Create temporary directory if it doesn't exist
const tempDir = path.join(process.cwd(), 'temp');

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

// Define audio format interface to avoid 'any' types
interface AudioFormat {
  audioBitrate?: number;
  qualityLabel?: string;
  audioQuality?: string;
  [key: string]: any;
}

// Function to transcribe the audio file
async function transcribeAudio(audioFilePath: string): Promise<DeepgramTranscriptionResult> {
  // Initialize Deepgram client
  const deepgram = createClient(process.env.DEEPGRAM_API_KEY || '');
  
  // Use createReadStream for the audio file
  const audioStream = fs.createReadStream(audioFilePath);
  
  console.log('Transcribing audio with Deepgram...');
  
  // Add error handling for the audio stream
  audioStream.on('error', (err: Error) => {
    console.error('Error reading audio file for transcription:', err);
    throw err;
  });
  
  // Transcribe the audio using Deepgram
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
  
  console.log('Transcription complete');
  
  return result;
}

const transcribeYouTubeUrl = async (youtubeUrl: string): Promise<{result: DeepgramTranscriptionResult, audioUrl: string}> => {
  // Validate the YouTube URL before proceeding
  if (!ytdl.validateURL(youtubeUrl)) {
    throw new Error('Invalid YouTube URL provided');
  }
  
  let audioFilePath = '';
  
  try {
    console.log('Creating temporary directory for audio files...');
    
    // Create temp directory if it doesn't exist
    try {
      await access(tempDir);
    } catch {
      await mkdir(tempDir, { recursive: true });
    }
    
    // Create a random filename for the downloaded audio
    const audioId = randomUUID();
    const audioFileName = `${audioId}.mp3`;
    audioFilePath = path.join(tempDir, audioFileName);
    
    // Also save to public directory for web access
    const publicDir = path.join(process.cwd(), 'public', 'audio');
    const publicAudioPath = path.join(publicDir, audioFileName);
    
    // Create the directory if it doesn't exist
    try {
      await mkdir(publicDir, { recursive: true });
    } catch (err) {
      console.warn('Directory already exists or could not be created:', err);
    }
    
    // Get video info to obtain the direct audio URL
    console.log(`Getting info for: ${youtubeUrl}`);
    const info = await ytdl.getInfo(youtubeUrl, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        }
      }
    });
    
    // Find audio format
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    if (audioFormats.length === 0) {
      throw new Error('No audio formats found for this video');
    }
    
    // Get highest quality audio
    const audioFormat = audioFormats.reduce((prev: AudioFormat, curr: AudioFormat) => {
      return (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr;
    });
    
    console.log(`Downloading audio from: ${youtubeUrl}`);
    console.log(`Audio format selected: ${audioFormat.qualityLabel || audioFormat.audioQuality || 'unknown'}`);
    
    // Create a write stream for the audio file
    const writeStream = fs.createWriteStream(audioFilePath);
    
    // Download the audio
    return new Promise((resolve, reject) => {
      const stream = ytdl.downloadFromInfo(info, { format: audioFormat });
      
      stream.on('error', (err: Error) => {
        console.error('Error downloading YouTube audio:', err);
        reject(new Error(`Failed to download YouTube audio: ${err.message}`));
      });
      
      stream.pipe(writeStream);
      
      writeStream.on('finish', async () => {
        console.log('YouTube audio download complete');
        
        // Copy file to public directory for web access
        try {
          const fileData = await readFile(audioFilePath);
          await writeFile(publicAudioPath, fileData);
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error('Error copying audio file to public directory:', error);
          // Continue with transcription even if copying fails
        }
        
        try {
          // Now that the audio is downloaded, transcribe it
          const result = await transcribeAudio(audioFilePath);
          
          // Create a relative URL path to the audio file
          const audioUrl = `/audio/${audioFileName}`;
          
          resolve({ result, audioUrl });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          console.error('Error transcribing audio:', error);
          reject(new Error(`Failed to transcribe audio: ${error.message}`));
        }
      });
      
      writeStream.on('error', (err: Error) => {
        console.error('Error writing audio file:', err);
        reject(new Error(`Failed to write audio file: ${err.message}`));
      });
    });
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    console.error('Error in transcribeYouTubeUrl:', error);
    
    // Clean up the audio file if it exists
    if (audioFilePath && fs.existsSync(audioFilePath)) {
      try {
        await unlink(audioFilePath);
      } catch (cleanupErr) {
        console.error('Failed to clean up audio file:', cleanupErr);
      }
    }
    
    throw error;
  }
};

// Configure the API route to handle larger requests
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
    const { youtubeUrl } = await request.json();

    if (!youtubeUrl) {
      return NextResponse.json({ error: 'YouTube URL is required' }, { status: 400 });
    }

    // Validate YouTube URL
    if (!ytdl.validateURL(youtubeUrl)) {
      return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
    }

    try {
      // Get basic info without downloading the video
      const videoInfo = await ytdl.getBasicInfo(youtubeUrl);
      console.log("Video title:", videoInfo.videoDetails.title);
      
      // Transcribe the YouTube audio
      const { result: transcriptionResult, audioUrl } = await transcribeYouTubeUrl(youtubeUrl);
      
      // Extract the transcript text
      const transcriptText = transcriptionResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || 
                            "No transcript was generated.";
      
      console.log("Transcript:", transcriptText);
      
      try {
        // Call the moderation API
        const moderationResponse = await fetch(`${process.env.VERCEL_URL || 'http://localhost:3000'}/api/moderate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ transcript: transcriptText }),
        });
        
        const moderationData = await moderationResponse.json();
        
        if (!moderationResponse.ok) {
          console.error('Moderation error:', moderationData.error || 'Unknown moderation error');
        }

        // Return both the transcription and moderation results
        return NextResponse.json({
          transcription: transcriptionResult?.results,
          transcript: transcriptText,
          moderationResults: moderationData,
          videoTitle: videoInfo.videoDetails.title,
          audioUrl // Include the audio URL in the response
        });
      } catch (moderationError) {
        console.error('Moderation service error:', moderationError);
        // Return results without moderation if moderation fails
        return NextResponse.json({
          transcription: transcriptionResult?.results,
          transcript: transcriptText,
          moderationError: 'Failed to perform content moderation',
          videoTitle: videoInfo.videoDetails.title,
        });
      }
    } catch (processingError: unknown) {
      console.error('Processing error:', processingError);
      // Provide more specific error messages based on the error type
      const errorMessage = processingError instanceof Error ? processingError.message : 'Unknown processing error';
      
      if (typeof errorMessage === 'string' && errorMessage.includes('YouTube')) {
        return NextResponse.json({ error: 'Failed to download YouTube video', details: errorMessage }, { status: 500 });
      } else if (typeof errorMessage === 'string' && errorMessage.includes('transcri')) {
        return NextResponse.json({ error: 'Failed to transcribe audio', details: errorMessage }, { status: 500 });
      } else {
        return NextResponse.json({ error: 'Processing error', details: errorMessage }, { status: 500 });
      }
    }
  } catch (error) {
    console.error('Request parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to process your request. Please ensure your request is properly formatted.' },
      { status: 400 }
    );
  }
} 