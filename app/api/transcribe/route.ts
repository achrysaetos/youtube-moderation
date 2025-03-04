import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import ytdl from 'ytdl-core';
import fsSync from 'fs';

const transcribeUrl = async () => {
    // STEP 1: Create a Deepgram client using the API key
    const deepgram = createClient(process.env.DEEPGRAM_API_KEY);
    // STEP 2: Call the transcribeUrl method with the audio payload and options
    const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
        {
        url: "https://dpgr.am/spacewalk.wav",
        },
        // STEP 3: Configure Deepgram options for audio analysis
        {
        model: "nova-3",
        smart_format: true,
        }
    );
    if (error) throw error;
    // STEP 4: Print the results
    if (!error) console.dir(result, { depth: null });
    return result;
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

    const deepgramResult = await transcribeUrl();

    try {
      // Get basic info without downloading the video
      const videoInfo = await ytdl.getBasicInfo(youtubeUrl);
      console.log("Video title:", videoInfo.videoDetails.title);
      ytdl(youtubeUrl, { filter: function(format) { return format.container === 'mp4'; } })
      .pipe(fsSync.createWriteStream('video.mp4'));
      
      // For demonstration purposes, we'll use the sample deepgram result
      // In a real implementation, you would use the actual transcription from the video
      
      // Extract the transcript text
      const transcriptText = deepgramResult?.results?.channels?.[0]?.alternatives?.[0]?.transcript || 
                            "Sample transcript for demonstration purposes.";
      
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
        console.error('Moderation error:', moderationData.error);
      }

      // Return both the transcription and moderation results
      return NextResponse.json({
        transcription: deepgramResult?.results,
        moderationResults: moderationData,
        videoTitle: videoInfo.videoDetails.title,
      });
    } catch (error: unknown) {
      console.error('Processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  } catch (error) {
    console.error('General error:', error);
    return NextResponse.json(
      { error: 'Failed to process your request. Please try again later.' },
      { status: 500 }
    );
  }
} 