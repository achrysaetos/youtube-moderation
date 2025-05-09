import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface ModerationCategoryScores {
    sexual: number;
    hate: number;
    harassment: number;
    'self-harm': number;
    'sexual/minors': number;
    'hate/threatening': number;
    'violence/graphic': number;
    'self-harm/intent': number;
    'self-harm/instructions': number;
    'harassment/threatening': number;
    violence: number;
}

export interface ModerationCategories {
    sexual: boolean;
    hate: boolean;
    harassment: boolean;
    'self-harm': boolean;
    'sexual/minors': boolean;
    'hate/threatening': boolean;
    'violence/graphic': boolean;
    'self-harm/intent': boolean;
    'self-harm/instructions': boolean;
    'harassment/threatening': boolean;
    violence: boolean;
}

export interface InappropriateSection {
    text: string;
    reason: string;
    severity: 'low' | 'medium' | 'high';
}

export interface DetailedModerationAnalysis {
    inappropriate_sections: InappropriateSection[];
}

export interface ModerationResult {
    flagged: boolean;
    categories: ModerationCategories;
    category_scores: ModerationCategoryScores;
    detailed_analysis: DetailedModerationAnalysis;
}

export async function getModerationResults(transcript: string): Promise<ModerationResult> {
    if (!transcript) {
        // Or handle as per desired behavior for empty transcript
        return {
            flagged: false,
            categories: {} as ModerationCategories, // Cast to type, will be empty
            category_scores: {} as ModerationCategoryScores, // Cast to type, will be empty
            detailed_analysis: { inappropriate_sections: [] },
        };
    }

    // Use OpenAI's moderation endpoint
    const moderationResponse = await openai.moderations.create({
        model: "omni-moderation-latest", // Consider making model configurable if needed
        input: transcript,
    });

    const results = moderationResponse.results[0];
    const flagged = results.flagged;

    // Get more detailed analysis with GPT for flagged content
    // No need to call this if not flagged to save tokens/time, 
    // but current logic in route.ts calls it regardless.
    // For now, replicating existing logic.
    const detailedAnalysisCompletion = await openai.chat.completions.create({
        model: "gpt-4o-mini", // Consider making model configurable
        messages: [
            {
                role: "system",
                content: "You are an AI assistant that analyzes transcripts for inappropriate language. Focus on identifying profanity, hate speech, sexual content, threats, and other harmful language. For each instance of inappropriate content, specify the exact word or phrase and why it's problematic."
            },
            {
                role: "user",
                content: `Analyze this transcript for inappropriate language: "${transcript}". If inappropriate language is found, respond with a JSON object that includes the following: 1) inappropriate_sections: an array of objects with \"text\" (the inappropriate text), \"reason\" (why it's inappropriate), and \"severity\" (low/medium/high). If no inappropriate language is found, return an empty array.`
            }
        ],
        response_format: { type: "json_object" }
    });

    const content = detailedAnalysisCompletion.choices[0].message.content;
    const analysisResult: DetailedModerationAnalysis = content ? JSON.parse(content) : { inappropriate_sections: [] };

    return {
        flagged,
        categories: results.categories as ModerationCategories, // Add type assertion
        category_scores: results.category_scores as ModerationCategoryScores, // Add type assertion
        detailed_analysis: analysisResult
    };
} 