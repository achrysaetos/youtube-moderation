// scripts/test-transcription.mjs

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=bSavF_FhJjQ&ab_channel=InsideEdition';
const API_ENDPOINT = 'http://localhost:3000/api/transcribe'; // Ensure your dev server is running

async function testTranscription() {
  console.log(`▶️ Testing transcription for: ${YOUTUBE_URL}`);

  try {
    console.log('\n🔄 Initiating transcription process...');
    const startTime = Date.now();

    // Step 1: Send request to the API
    process.stdout.write('   Sending request to API... ');
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ youtubeUrl: YOUTUBE_URL }),
    });
    console.log('✅');

    const duration = (Date.now() - startTime);
    process.stdout.write(`   Receiving response from API (took ${ (duration / 1000).toFixed(2) }s)... `);
    
    if (!response.ok) {
      console.log('❌');
      const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
      throw new Error(`API request failed with status ${response.status}: ${errorData.error || response.statusText}`);
    }
    const data = await response.json();
    console.log('✅');

    // Assuming the API handles download, transcription, and moderation as a single process
    console.log('   Video processing (download, transcription, moderation)... ✅');


    console.log('\n--- Transcription Results ---');
    if (data.transcription && data.transcription.channels && data.transcription.channels[0] && data.transcription.channels[0].alternatives && data.transcription.channels[0].alternatives[0]) {
      console.log('   🗣️ Transcript received... ✅');
      console.log('      Text: ', data.transcription.channels[0].alternatives[0].transcript.substring(0, 100) + '...');
      console.log('      Confidence: ', data.transcription.channels[0].alternatives[0].confidence);
    } else {
      console.log('   ⚠️ No transcript found in the response.');
    }
    
    console.log('\n--- Moderation Results ---');
    if (data.moderationResults) {
      console.log('   🛡️ Moderation results received... ✅');
      console.log('      Results: ', JSON.stringify(data.moderationResults, null, 2));
    } else {
      console.log('   ⚠️ No moderation results found in the response.');
    }

    if(data.audioUrl) {
        console.log(`\n   🎧 Public Audio URL generated... ✅`);
        console.log(`      URL: http://localhost:3000${data.audioUrl}`);
    }

    console.log('\n🎉 Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:');
    console.error('  ', error.message);
    if (error.cause) {
        console.error('   Cause:', error.cause);
    }
  }
}

testTranscription(); 