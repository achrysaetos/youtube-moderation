'use client';

import { useState } from 'react';

// Define types for moderation results
interface InappropriateSection {
  text: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

interface DetailedAnalysis {
  inappropriate_sections: InappropriateSection[];
}

interface ModerationResults {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  detailed_analysis: DetailedAnalysis;
}

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<any>(null);
  const [moderationResults, setModerationResults] = useState<ModerationResults | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }
    
    try {
      setIsLoading(true);
      setError(null);
      
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ youtubeUrl }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to transcribe video');
      }
      
      setTranscription(data.transcription);
      setModerationResults(data.moderationResults);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Audio Moderation System</h1>
        <p className="text-gray-600">Upload a YouTube video and get a moderated transcription using Deepgram and OpenAI</p>
      </header>

      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Transcribe YouTube Video</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="youtube-url" className="block text-sm font-medium text-gray-700 mb-1">
              YouTube URL
            </label>
            <input
              id="youtube-url"
              type="text"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <button
            type="submit"
            disabled={isLoading}
            className={`w-full py-2 px-4 rounded-md font-medium text-white ${
              isLoading ? 'bg-blue-400' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {isLoading ? 'Processing...' : 'Transcribe & Moderate Video'}
          </button>
        </form>
        
        {error && (
          <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-md">
            <p>{error}</p>
          </div>
        )}
      </div>

      {isLoading && (
        <div className="text-center p-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-700 mx-auto mb-4"></div>
          <p className="text-gray-600">
            Processing video... This may take a few minutes depending on the video length.
          </p>
        </div>
      )}

      {moderationResults && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Content Moderation Results</h2>
          
          <div className="space-y-4">
            <div className="flex items-center">
              <div className={`h-4 w-4 rounded-full mr-2 ${moderationResults.flagged ? 'bg-red-500' : 'bg-green-500'}`}></div>
              <p className="font-medium">
                {moderationResults.flagged 
                  ? 'Potentially inappropriate content detected' 
                  : 'No inappropriate content detected'}
              </p>
            </div>
            
            {moderationResults.flagged && (
              <div>
                <h3 className="font-medium mt-4 mb-2">Categories detected:</h3>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(moderationResults.categories).map(([category, value]) => 
                    value ? (
                      <div key={category} className="bg-red-50 p-2 rounded">
                        <p className="font-medium text-red-700 capitalize">{category.replace(/-/g, ' ')}</p>
                        <p className="text-sm text-gray-700">
                          Score: {(moderationResults.category_scores[category] * 100).toFixed(2)}%
                        </p>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}
            
            {moderationResults.detailed_analysis?.inappropriate_sections?.length > 0 && (
              <div className="mt-4">
                <h3 className="font-medium mb-2">Detailed Analysis:</h3>
                {moderationResults.detailed_analysis.inappropriate_sections.map((section: InappropriateSection, index: number) => (
                  <div key={index} className="border-l-4 border-red-500 pl-3 py-2 mb-3 bg-red-50">
                    <p className="font-medium">{section.text}</p>
                    <p className="text-sm text-gray-700">Reason: {section.reason}</p>
                    <div className="flex items-center mt-1">
                      <span className="text-xs font-medium mr-2">Severity:</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        section.severity === 'high' ? 'bg-red-600 text-white' :
                        section.severity === 'medium' ? 'bg-orange-500 text-white' :
                        'bg-yellow-400 text-gray-800'
                      }`}>
                        {section.severity.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {transcription && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4">Transcription Results</h2>
          
          <div className="space-y-4">
            {transcription.channels?.[0]?.alternatives?.[0]?.paragraphs?.paragraphs?.map((paragraph: any, index: number) => (
              <div key={index} className="border-b pb-2">
                <p>{paragraph.text}</p>
                <p className="text-sm text-gray-500">
                  {formatTimestamp(paragraph.start)} - {formatTimestamp(paragraph.end)}
                </p>
              </div>
            )) || (
              <p>
                {transcription.channels?.[0]?.alternatives?.[0]?.transcript || 
                 "No transcription data available. The format might be different than expected."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Helper function to format timestamps from seconds to MM:SS format
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}
