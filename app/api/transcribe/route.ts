import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@deepgram/sdk';
import ytdl from 'ytdl-core';
import fsSync, { promises as fs } from 'fs';

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

    transcribeUrl();

    try {
      // Get basic info without downloading the video
      const videoInfo = await ytdl.getBasicInfo(youtubeUrl);
      console.log("Video title:", videoInfo.videoDetails.title);
      ytdl(youtubeUrl, { filter: function(format) { return format.container === 'mp4'; } })
      .pipe(fsSync.createWriteStream('video.mp4'));
      
      
    //   // Direct transcription of YouTube URL (simpler approach)
    //   const { result, error } = await deepgram.listen.prerecorded.transcribeUrl(
    //     {
    //       url: youtubeUrl,
    //     },
    //     {
    //       model: "nova-2",
    //       smart_format: true,
    //       punctuate: true,
    //       utterances: true,
    //       diarize: true,
    //     }
    //   );
      
      if (error) {
        console.error('Deepgram error:', error);
        throw new Error('Failed to transcribe video: ' + error.message);
      }

      // Return the transcription
      return NextResponse.json({
        transcription: result?.results?.channels[0]?.alternatives[0]?.transcript || '',
        confidence: result?.results?.channels[0]?.alternatives[0]?.confidence || 0,
        videoTitle: videoInfo.videoDetails.title,
      });
    } catch (error: unknown) {
      console.error('Processing error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } catch (error) {
    console.error('General error:', error);
    return NextResponse.json(
      { error: 'Failed to process your request. Please try again later.' },
      { status: 500 }
    );
  }
} 