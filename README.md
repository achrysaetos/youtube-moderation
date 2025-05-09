# Transcript Parser with Content Moderation

This is a Next.js application that transcribes YouTube videos using Deepgram's API and then analyzes the transcript for inappropriate content using OpenAI's moderation API.

<img width="1032" alt="image" src="https://github.com/user-attachments/assets/81bb7404-0854-4578-9e43-9581dbc159ee" />

## Features

- Transcribe YouTube videos using Deepgram's Nova-3 model
- Moderate content for inappropriate language using OpenAI's moderation API
- Detailed analysis of problematic content with severity ratings
- Clean and intuitive UI

## How It Works

1. Enter a YouTube URL in the input field
2. The application downloads the video and transcribes it using Deepgram
3. The transcript is sent to OpenAI's moderation API to detect inappropriate content
4. Results display both the complete transcript and a detailed moderation report

## Content Moderation

The system uses two levels of content moderation:

1. **Basic Moderation**: Using OpenAI's moderation endpoint to flag content across various categories including:
   - Sexual content
   - Hate speech
   - Violence
   - Self-harm
   - Harassment
   - And more

2. **Detailed Analysis**: A more thorough analysis using OpenAI's GPT models to:
   - Identify specific problematic phrases or words
   - Explain why each section is potentially inappropriate
   - Provide severity ratings (low, medium, high)

## Setup and Installation

1. Clone the repository
2. Install dependencies with `npm install`
3. Create a `.env.local` file with your API keys:
   ```
   OPENAI_API_KEY=your_openai_api_key
   DEEPGRAM_API_KEY=your_deepgram_api_key
   ```
4. Run the development server with `npm run dev`

## Technologies Used

- Next.js
- React
- Tailwind CSS
- Deepgram API
- OpenAI API
- ytdl-core (for YouTube video downloading)

## Use Cases

- Content moderation for educational platforms
- Ensuring transcripts meet community guidelines
- Identifying potentially offensive speech in video content
- Pre-screening user-generated content

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
