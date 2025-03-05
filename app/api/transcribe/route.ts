import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import ytdl from 'ytdl-core';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import { randomUUID } from 'crypto';

// Convert callback-based fs functions to Promise-based
const mkdir = promisify(fs.mkdir);
const unlink = promisify(fs.unlink);
const access = promisify(fs.access);

// Define a type for the Deepgram result
interface DeepgramTranscriptionResult {
  results?: {
    channels?: Array<{
      alternatives?: Array<{
        transcript?: string;
      }>;
    }>;
  };
}

const transcribeYouTubeUrl = async (youtubeUrl: string): Promise<DeepgramTranscriptionResult> => {
  // Validate the YouTube URL before proceeding
  if (!ytdl.validateURL(youtubeUrl)) {
    throw new Error('Invalid YouTube URL provided');
  }

  // Create temporary directory if it doesn't exist
  const tempDir = path.join(process.cwd(), 'temp');
  try {
    await access(tempDir);
  } catch {
    await mkdir(tempDir, { recursive: true });
  }

  // Generate a unique filename
  const audioFileName = `${randomUUID()}.mp3`;
  const audioFilePath = path.join(tempDir, audioFileName);

  try {
    // Get video info to obtain the direct audio URL
    console.log(`Getting info for: ${youtubeUrl}`);
    const info = await ytdl.getInfo(youtubeUrl, {
      requestOptions: {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        },
      },
    });

    // Find audio format
    const audioFormats = ytdl.filterFormats(info.formats, 'audioonly');
    if (audioFormats.length === 0) {
      throw new Error('No audio formats found for this video');
    }

    // Get highest quality audio
    const audioFormat = audioFormats.reduce((prev, curr) => {
      return (prev.audioBitrate || 0) > (curr.audioBitrate || 0) ? prev : curr;
    });

    console.log(`Downloading audio from: ${youtubeUrl}`);
    console.log(`Audio format selected: ${audioFormat.qualityLabel || audioFormat.audioQuality || 'unknown'}`);

    // Create a write stream for the audio file
    const writeStream = fs.createWriteStream(audioFilePath);

    // Download the audio
    await new Promise((resolve, reject) => {
      try {
        // Create a stream with the selected format
        const stream = ytdl.downloadFromInfo(info, { format: audioFormat });
        
        // Handle errors from ytdl
        stream.on('error', (err) => {
          console.error('Error downloading YouTube audio:', err);
          reject(err);
        });
        
        // Handle end of stream
        stream.on('end', () => {
          console.log('YouTube audio download complete');
          resolve(null);
        });
        
        // Handle write stream errors
        writeStream.on('error', (err) => {
          console.error('Error writing audio file:', err);
          reject(err);
        });
        
        // Pipe the stream to the file
        stream.pipe(writeStream);
      } catch (error) {
        console.error('Failed to initialize YouTube download:', error);
        reject(error);
      }
    });

    // Initialize Deepgram client
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    
    // Use createReadStream instead of readFileSync
    const audioStream = fs.createReadStream(audioFilePath);
    
    console.log('Transcribing audio with Deepgram...');
    
    // Add error handling for the audio stream
    audioStream.on('error', (err) => {
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
    
    // Cleanup - delete the temporary audio file
    // await unlink(audioFilePath);
    
    return result;
  } catch (error) {
    // Attempt to clean up on error
    try {
      if (fs.existsSync(audioFilePath)) {
        await unlink(audioFilePath);
      }
    } catch (cleanupError) {
      console.error('Error during cleanup:', cleanupError);
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
      const transcriptionResult = await transcribeYouTubeUrl(youtubeUrl);
      
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