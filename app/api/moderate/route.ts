import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();

    const addendum = "But you're a damn racist. I might have to hurt you.";

    if (!transcript) {
      return NextResponse.json({ error: 'Transcript is required' }, { status: 400 });
    }

    console.log(transcript);

    // Use OpenAI's moderation endpoint to check for inappropriate content
    const moderationResponse = await openai.moderations.create({
      model: "omni-moderation-latest",
      input: transcript + addendum,
    });

    console.log(JSON.stringify(moderationResponse));

    const results = moderationResponse.results[0];
    const flagged = results.flagged;

    // For a more detailed analysis, let's also use the Chat API to get specific feedback
    // about what might be inappropriate and highlight those sections
    const detailedAnalysis = await openai.chat.completions.create({
      model: "gpt-4-turbo",
      messages: [
        {
          role: "system",
          content: "You are an AI assistant that analyzes transcripts for inappropriate language. Focus on identifying profanity, hate speech, sexual content, threats, and other harmful language. For each instance of inappropriate content, specify the exact word or phrase and why it's problematic."
        },
        {
          role: "user",
          content: `Analyze this transcript for inappropriate language: "${transcript+addendum}". If inappropriate language is found, respond with a JSON object that includes the following: 1) inappropriate_sections: an array of objects with "text" (the inappropriate text), "reason" (why it's inappropriate), and "severity" (low/medium/high). If no inappropriate language is found, return an empty array.`
        }
      ],
      response_format: { type: "json_object" }
    });

    const analysisResult = JSON.parse(detailedAnalysis.choices[0].message.content);

    return NextResponse.json({
      flagged,
      categories: results.categories,
      category_scores: results.category_scores,
      detailed_analysis: analysisResult
    });
  } catch (error) {
    console.error('Moderation error:', error);
    return NextResponse.json(
      { error: 'Failed to moderate content. Please try again later.' },
      { status: 500 }
    );
  }
} 