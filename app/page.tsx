'use client';

import { useState, useEffect, useRef } from 'react';

// Define types for moderation and transcription
interface InappropriateSection {
  text: string;
  reason: string;
  severity: 'low' | 'medium' | 'high';
}

interface ModerationResults {
  flagged: boolean;
  categories: Record<string, boolean>;
  category_scores: Record<string, number>;
  detailed_analysis: {
    inappropriate_sections: InappropriateSection[];
  };
}

interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
  confidence: number;
  punctuated_word: string;
}

interface TranscriptionResponse {
  channels: Array<{
    alternatives: Array<{
      transcript: string;
      confidence: number;
      words: TranscriptionWord[];
      paragraphs?: {
        paragraphs: Array<{
          text: string;
          start: number;
          end: number;
        }>;
      };
    }>;
  }>;
}

// WaveSurfer type
type WaveSurferType = {
  load: (url: string) => void;
  on: (event: string, callback: () => void) => void;
  getDuration: () => number;
  getCurrentTime: () => number;
  play: () => void;
  pause: () => void;
  destroy: () => void;
  seekTo: (progress: number) => void;
};

// Audio player component
function AudioPlayer({ audioUrl, activeTimestamp }: { audioUrl: string; activeTimestamp: number | null }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurferType | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  
  // Initialize WaveSurfer
  useEffect(() => {
    let wavesurfer: WaveSurferType | null = null;
    
    const initWavesurfer = async () => {
      if (!containerRef.current) return;
      
      try {
        const WaveSurfer = (await import('wavesurfer.js')).default;
        
        wavesurfer = WaveSurfer.create({
          container: containerRef.current,
          waveColor: '#4F46E5',
          progressColor: '#818CF8',
          cursorColor: '#4F46E5',
          barWidth: 2,
          barGap: 1,
          barRadius: 2,
          height: 60,
          normalize: true,
          // @ts-expect-error - responsive is a valid option but not in TypeScript definitions
          responsive: true,
        }) as WaveSurferType;
        
        wavesurfer.load(audioUrl);
        
        wavesurfer.on('ready', () => {
          wavesurferRef.current = wavesurfer;
          if (wavesurfer) setDuration(wavesurfer.getDuration());
        });
        
        wavesurfer.on('audioprocess', () => {
          if (wavesurfer) setCurrentTime(wavesurfer.getCurrentTime());
        });
        
        wavesurfer.on('play', () => setIsPlaying(true));
        wavesurfer.on('pause', () => setIsPlaying(false));
        wavesurfer.on('finish', () => setIsPlaying(false));
      } catch (err) {
        console.error('Error initializing WaveSurfer:', err);
      }
    };
    
    initWavesurfer();
    
    return () => {
      if (wavesurfer) {
        try {
          wavesurfer.destroy();
        } catch (err) {
          console.error('Error destroying WaveSurfer instance:', err);
        }
      }
    };
  }, [audioUrl]);
  
  // Handle active timestamp changes
  useEffect(() => {
    if (wavesurferRef.current && activeTimestamp !== null) {
      wavesurferRef.current.seekTo(activeTimestamp / duration);
      wavesurferRef.current.play();
    }
  }, [activeTimestamp, duration]);
  
  // Play/pause toggle
  const togglePlayPause = () => {
    if (!wavesurferRef.current) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play();
    }
  };
  
  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">Audio Player</h2>
      <div className="mb-4">
        <div ref={containerRef} className="mb-3" />
        <div className="flex items-center justify-between">
          <button 
            onClick={togglePlayPause}
            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <div className="text-gray-600">
            {formatTimestamp(currentTime)} / {formatTimestamp(duration)}
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper function to format timestamps from seconds to MM:SS format
function formatTimestamp(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Levenshtein distance for fuzzy matching
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = Array(a.length + 1).fill(null).map(() => Array(b.length + 1).fill(null));

  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

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

export default function Home() {
  const [youtubeUrl, setYoutubeUrl] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState<TranscriptionResponse | null>(null);
  const [moderationResults, setModerationResults] = useState<ModerationResults | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [activeTimestamp, setActiveTimestamp] = useState<number | null>(null);

  // Handle timestamp navigation events
  useEffect(() => {
    const handleTimestampNavigation = (event: Event) => {
      const customEvent = event as CustomEvent;
      setActiveTimestamp(customEvent.detail.time);
    };

    document.addEventListener('navigate-to-timestamp', handleTimestampNavigation);
    return () => document.removeEventListener('navigate-to-timestamp', handleTimestampNavigation);
  }, []);

  // Function to find timestamp boundaries for a search phrase
  function findTimestampsForPhrase(phrase: string, words: TranscriptionWord[]): { start: number, end: number } | null {
    if (!words?.length) return null;

    // Prepare the phrase for matching
    const normalizedPhrase = phrase.toLowerCase().replace(/[.,?!;:'"]/g, ' ').replace(/\s+/g, ' ').trim();
    const phraseWords = normalizedPhrase.split(' ');
    if (!phraseWords.length) return null;

    // Preprocess words for faster matching
    const normalizedWords = words.map(w => ({
      ...w,
      normalized: w.word.toLowerCase().replace(/[.,?!;:'"]/g, '')
    }));
    
    // Find phrase in transcript
    for (let i = 0; i <= normalizedWords.length - phraseWords.length; i++) {
      let matchCount = 0;
      let fuzzyMatched = false;
      
      for (let j = 0; j < phraseWords.length; j++) {
        const wordIndex = i + j;
        if (wordIndex >= normalizedWords.length) break;
        
        const transcriptWord = normalizedWords[wordIndex].normalized;
        const phraseWord = phraseWords[j];
        
        // Check for exact or fuzzy match
        if (transcriptWord === phraseWord) {
          matchCount++;
          continue;
        }
        
        if (
          transcriptWord.includes(phraseWord) || 
          phraseWord.includes(transcriptWord) ||
          levenshteinDistance(transcriptWord, phraseWord) <= Math.min(2, Math.floor(phraseWord.length / 3))
        ) {
          matchCount++;
          fuzzyMatched = true;
          continue;
        }
        
        break;
      }
      
      // If we've matched all words (or at least 80% for fuzzy matching)
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

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setTranscription(null);
    setModerationResults(null);
    setAudioUrl(null);
    setActiveTimestamp(null);
    
    if (!youtubeUrl) {
      setError('Please enter a YouTube URL');
      return;
    }
    
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtubeUrl }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to transcribe video');
      }
      
      setTranscription(data.transcription);
      setModerationResults(data.moderationResults);
      setAudioUrl(data.audioUrl || null);
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || 'An unexpected error occurred');
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

      {audioUrl && <AudioPlayer audioUrl={audioUrl} activeTimestamp={activeTimestamp} />}

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
                {moderationResults.detailed_analysis.inappropriate_sections.map((section, index) => (
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
            const searchPhrases = moderationResults?.detailed_analysis?.inappropriate_sections?.map(section => section.text) || [];
            
            if (searchPhrases.length > 0) {
              // Create regex pattern for search phrases
              const escapedPhrases = searchPhrases.map(phrase => phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
              const pattern = new RegExp(`(${escapedPhrases.join('|')})`, 'g');
              const parts = transcript.split(pattern);
              const words = transcription.channels?.[0]?.alternatives?.[0]?.words || [];
              
              return (
                <div>
                  {parts.map((part, index) => {
                    const isSearchPhrase = searchPhrases.includes(part);
                    
                    if (isSearchPhrase) {
                      const timestamps = findTimestampsForPhrase(part, words);
                      return (
                        <span 
                          key={index} 
                          className="relative group inline-block"
                          onClick={() => {
                            if (timestamps) {
                              const sectionIndex = searchPhrases.indexOf(part);
                              const section = moderationResults?.detailed_analysis?.inappropriate_sections?.[sectionIndex];
                              
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
