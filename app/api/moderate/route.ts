import { NextRequest, NextResponse } from 'next/server';
import { getModerationResults } from '@/lib/moderationUtils'; // Using absolute import

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
    }

    const moderationData = await getModerationResults(transcript);

    return NextResponse.json(moderationData);

  } catch (error) {
    console.error('Moderation API error in route handler:', error);
    // The utility function getModerationResults should handle its own errors related to OpenAI calls.
    // This catch block is for errors in the request handling itself or unexpected errors from the util.
    return NextResponse.json(
      { error: 'Failed to process moderation request', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 