'use client';

import { useState } from 'react';

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<any>(null);

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
        <p className="text-gray-600">Upload a YouTube video and get a transcription using Deepgram API</p>
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
            {isLoading ? 'Processing...' : 'Transcribe Video'}
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
