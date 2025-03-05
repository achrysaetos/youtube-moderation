import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
    }

    // Use OpenAI's moderation endpoint to check for inappropriate content
    const moderationResponse = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: transcript,
    });

    const results = moderationResponse.results[0];
    const flagged = results.flagged;

    // Get more detailed analysis with GPT for flagged content
    const detailedAnalysis = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant that analyzes transcripts for inappropriate language. Focus on identifying profanity, hate speech, sexual content, threats, and other harmful language. For each instance of inappropriate content, specify the exact word or phrase and why it's problematic."
        },
        {
          role: "user",
          content: `Analyze this transcript for inappropriate language: "${transcript}". If inappropriate language is found, respond with a JSON object that includes the following: 1) inappropriate_sections: an array of objects with "text" (the inappropriate text), "reason" (why it's inappropriate), and "severity" (low/medium/high). If no inappropriate language is found, return an empty array.`
        }
      ],
      response_format: { type: "json_object" }
    });

    // Parse the analysis result with null check and default value
    const content = detailedAnalysis.choices[0].message.content;
    const analysisResult = content ? JSON.parse(content) : { inappropriate_sections: [] };

    return NextResponse.json({
      flagged,
      categories: results.categories,
      category_scores: results.category_scores,
      detailed_analysis: analysisResult
    });
  } catch (error) {
    console.error('Moderation error:', error);
    return NextResponse.json(
      { error: 'Failed to moderate content', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 