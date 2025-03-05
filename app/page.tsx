'use client';

import { useState, useEffect } from 'react';

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

// Define types for transcription data
interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word: string;
}

interface Paragraph {
  text: string;
  start: number;
  end: number;
}

interface Paragraphs {
  paragraphs: Paragraph[];
}

interface Alternative {
  transcript: string;
  confidence: number;
  words: TranscriptionWord[];
  paragraphs?: Paragraphs;
}

interface Channel {
  alternatives: Alternative[];
}

interface TranscriptionResponse {
  channels: Channel[];
}

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResponse | null>(null);
  const [moderationResults, setModerationResults] = useState<ModerationResults | null>(null);
  // Add state for the currently active timestamp
  const [activeTimestamp, setActiveTimestamp] = useState<{
    time: number;
    text: string;
    reason: string;
    severity: string;
  } | null>(null);

  // Set up an effect to listen for timestamp navigation events
  useEffect(() => {
    const handleTimestampNavigation = (event: Event) => {
      const customEvent = event as CustomEvent;
      setActiveTimestamp(customEvent.detail);
    };

    document.addEventListener('navigate-to-timestamp', handleTimestampNavigation);
    
    return () => {
      document.removeEventListener('navigate-to-timestamp', handleTimestampNavigation);
    };
  }, []);

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
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Function to find timestamp boundaries for a search phrase
  function findTimestampsForPhrase(phrase: string, words: TranscriptionWord[]): { start: number, end: number } | null {
    if (!words || !words.length) return null;

    // Prepare the phrase for matching
    const normalizedPhrase = phrase.toLowerCase().replace(/[.,?!;:'"]/g, ' ').replace(/\s+/g, ' ').trim();
    const phraseWords = normalizedPhrase.split(' ');
    
    // If the phrase is empty after normalization, return null
    if (phraseWords.length === 0) return null;

    // Preprocess all transcript words for faster matching
    const normalizedWords = words.map(w => ({
      ...w,
      normalized: w.word.toLowerCase().replace(/[.,?!;:'"]/g, '')
    }));
    
    // Try to find the start of the phrase
    for (let i = 0; i <= normalizedWords.length - phraseWords.length; i++) {
      let matchCount = 0;
      let fuzzyMatched = false;
      
      // Check each word in the phrase
      for (let j = 0; j < phraseWords.length; j++) {
        const wordIndex = i + j;
        if (wordIndex >= normalizedWords.length) break;
        
        const transcriptWord = normalizedWords[wordIndex].normalized;
        const phraseWord = phraseWords[j];
        
        // Exact match
        if (transcriptWord === phraseWord) {
          matchCount++;
          continue;
        }
        
        // Fuzzy match - consider it a match if:
        // 1. The transcript word contains the phrase word
        // 2. Or the phrase word contains the transcript word
        // 3. Or the Levenshtein distance is small
        if (
          transcriptWord.includes(phraseWord) || 
          phraseWord.includes(transcriptWord) ||
          levenshteinDistance(transcriptWord, phraseWord) <= Math.min(2, Math.floor(phraseWord.length / 3))
        ) {
          matchCount++;
          fuzzyMatched = true;
          continue;
        }
        
        // If we've reached here, this word doesn't match
        break;
      }
      
      // If we've matched all words in the phrase (or at least 80% for fuzzy matching)
      const threshold = fuzzyMatched ? 0.8 * phraseWords.length : phraseWords.length;
      if (matchCount >= threshold) {
        return {
          start: words[i].start,
          end: words[i + matchCount - 1].end
        };
      }
    }
    
    return null;
  }
  
  // Helper function to calculate Levenshtein distance between two strings
  function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
  
    const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));
  
    for (let i = 0; i <= a.length; i++) {
      matrix[i][0] = i;
    }
  
    for (let j = 0; j <= b.length; j++) {
      matrix[0][j] = j;
    }
  
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }
  
    return matrix[a.length][b.length];
  }

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

      {/* Add the TimestampNavigator component */}
      {activeTimestamp && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6 border-l-4 border-yellow-500">
          <h2 className="text-xl font-semibold mb-2">
            <span className="flex items-center">
              <span className="mr-2">🔍</span> 
              Current Highlight
            </span>
          </h2>
          
          <div className="mb-3">
            <p className="font-medium text-gray-700 mb-1">
              <span className="bg-yellow-200 px-2 py-1 rounded">{activeTimestamp.text}</span>
            </p>
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-semibold">Timestamp:</span> {formatTimestamp(activeTimestamp.time)}
            </p>
            <p className="text-sm text-gray-600 mb-1">
              <span className="font-semibold">Reason:</span> {activeTimestamp.reason}
            </p>
            <div className="flex items-center">
              <span className="text-sm font-semibold text-gray-600 mr-2">Severity:</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                activeTimestamp.severity === 'high' ? 'bg-red-600 text-white' :
                activeTimestamp.severity === 'medium' ? 'bg-yellow-500 text-white' :
                'bg-yellow-200 text-gray-800'
              }`}>
                {activeTimestamp.severity.charAt(0).toUpperCase() + activeTimestamp.severity.slice(1)}
              </span>
            </div>
          </div>
          
          <div className="flex space-x-2">
            <button 
              onClick={() => {
                // Here you would typically control an audio/video player
                // For now, we just clear the active timestamp
                setActiveTimestamp(null);
              }}
              className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
            >
              Play from this point
            </button>
            <button 
              onClick={() => setActiveTimestamp(null)}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      )}

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
            {/* <div className="flex items-center">
              <div className={`h-4 w-4 rounded-full mr-2 ${moderationResults.flagged ? 'bg-red-500' : 'bg-green-500'}`}></div>
              <p className="font-medium">
                {moderationResults.flagged 
                  ? 'Potentially inappropriate content detected' 
                  : 'No inappropriate content detected'}
              </p>
            </div> */}
            
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

          {(() => {
            const transcript = transcription.channels?.[0]?.alternatives?.[0]?.transcript || "";
            const searchPhrases = moderationResults?.detailed_analysis?.inappropriate_sections?.map((section: InappropriateSection) => section.text) || [];
            
            if (searchPhrases.length > 0) {
              // Create a regex pattern that matches any of the search phrases
              const escapedPhrases = searchPhrases.map(phrase => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
              const pattern = new RegExp(`(${escapedPhrases.join('|')})`, 'g');
              
              // Split the transcript by the pattern and keep the matches
              const parts = transcript.split(pattern);
              
              // Get the words array for timestamp lookup
              const words = transcription.channels?.[0]?.alternatives?.[0]?.words || [];
              
              return (
                <div>
                  {parts.map((part: string, index: number) => {
                    // Check if this part is one of our search phrases
                    const isSearchPhrase = searchPhrases.includes(part);
                    
                    if (isSearchPhrase) {
                      // Find timestamps for this phrase
                      const timestamps = findTimestampsForPhrase(part, words);
                      console.log(timestamps);
                      return (
                        <span 
                          key={index} 
                          className="relative group inline-block"
                          onClick={() => {
                            if (timestamps) {
                              // Determine which flagged section this is
                              const sectionIndex = searchPhrases.indexOf(part);
                              const section = moderationResults?.detailed_analysis?.inappropriate_sections?.[sectionIndex];
                              
                              // Create an event to navigate audio to this timestamp if we have an audio player
                              const timestampEvent = new CustomEvent('navigate-to-timestamp', {
                                detail: { 
                                  time: timestamps.start,
                                  text: part,
                                  reason: section?.reason || 'Flagged content',
                                  severity: section?.severity || 'medium'
                                }
                              });
                              document.dispatchEvent(timestampEvent);
                            }
                          }}
                        >
                          <span className={`
                            bg-yellow-300 font-medium px-1 rounded cursor-pointer
                            ${timestamps ? 'hover:bg-yellow-400' : ''}
                            transition-colors duration-200
                          `}>
                            {part}
                          </span>
                          {timestamps && (
                            <span className="absolute -top-8 left-0 bg-gray-800 text-white px-2 py-1 text-xs rounded 
                                           opacity-0 group-hover:opacity-100 transition-opacity z-10 whitespace-nowrap">
                              <span className="font-semibold">Time:</span> {formatTimestamp(timestamps.start)} - {formatTimestamp(timestamps.end)}
                              <span className="absolute w-2 h-2 bg-gray-800 transform rotate-45 left-3 -bottom-1"></span>
                            </span>
                          )}
                        </span>
                      );
                    } else {
                      return <span key={index}>{part}</span>;
                    }
                  })}
                </div>
              );
            } else {
              return transcript;
            }
          })()}
          
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
