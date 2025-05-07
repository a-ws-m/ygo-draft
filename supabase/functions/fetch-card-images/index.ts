// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log("Card Image Fetcher Function Initialized")

// Function to download image and return as blob
async function fetchCardImage(imageUrl: string, cardId: string, isSmall = false): Promise<{ blob: Blob | null, cardId: string, isSmall: boolean }> {
  try {
    if (!imageUrl) return { blob: null, cardId, isSmall };

    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error(`Failed to download image from ${imageUrl}: ${imageResponse.statusText}`);
      return { blob: null, cardId, isSmall };
    }

    return {
      blob: await imageResponse.blob(),
      cardId,
      isSmall
    };
  } catch (error) {
    console.error(`Error fetching image for card ${cardId}:`, error);
    return { blob: null, cardId, isSmall };
  }
}

// Function to store a blob in Supabase Storage
async function uploadImageToSupabase(supabase, imageBlob: Blob | null, cardId: string, isSmall = false): Promise<boolean> {
  try {
    if (!imageBlob) return false;

    const bucketName = isSmall ? 'card_images_small' : 'card_images';
    const fileName = `${cardId}${isSmall ? '_small' : ''}.jpg`;

    // Upload to Supabase Storage
    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .upload(fileName, imageBlob, {
        contentType: 'image/jpeg',
        upsert: true
      });

    if (error) {
      console.error(`Error uploading image to ${bucketName}:`, error);
      return false;
    }

    // Successfully stored the image
    return true;
  } catch (error) {
    console.error(`Error storing image for card ${cardId}:`, error);
    return false;
  }
}

// Function to process a batch of cards
async function processBatch(supabase, cards) {
  // Download all images in parallel first
  const fetchPromises = [];

  for (const card of cards) {
    const cardId = card.id;
    const imageUrl = card.card_images?.[0]?.image_url || null;
    const smallImageUrl = card.card_images?.[0]?.image_url_small || null;

    // Queue up all the fetch operations
    if (imageUrl) fetchPromises.push(fetchCardImage(imageUrl, cardId, false));
    if (smallImageUrl) fetchPromises.push(fetchCardImage(smallImageUrl, cardId, true));
  }

  // Wait for all downloads to complete
  const downloadedImages = await Promise.all(fetchPromises);

  // Now upload the images sequentially
  const results = {};

  for (const imageData of downloadedImages) {
    const { blob, cardId, isSmall } = imageData;

    // Initialize card result if not present
    if (!results[cardId]) {
      results[cardId] = {
        cardId,
        largeImageSuccess: false,
        smallImageSuccess: false
      };
    }

    // Upload the image and store the result
    const success = await uploadImageToSupabase(supabase, blob, cardId, isSmall);

    if (isSmall) {
      results[cardId].smallImageSuccess = success;
    } else {
      results[cardId].largeImageSuccess = success;
    }
  }

  // Calculate upload statistics
  const totalCards = Object.keys(results).length;
  const successfulLargeUploads = Object.values(results).filter(r => r.largeImageSuccess).length;
  const successfulSmallUploads = Object.values(results).filter(r => r.smallImageSuccess).length;

  console.log(`Batch completed: ${totalCards} cards processed`);
  console.log(`Large images: ${successfulLargeUploads} uploaded successfully`);
  console.log(`Small images: ${successfulSmallUploads} uploaded successfully`);

  return {
    totalCards,
    successfulLargeUploads,
    successfulSmallUploads,
    results: Object.values(results)
  };
}

Deno.serve(async (req) => {
  try {
    // Create a Supabase client with the project URL and ANON key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseAdminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Use the service role key for admin privileges
    const supabase = createClient(supabaseUrl, supabaseAdminKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'Authorization': `Bearer ${supabaseAdminKey}`,
          'X-Client-Info': 'fetch-card-images-function'
        },
      },
    });

    // Parse the request body
    const { cards, batchSize = 100, isRecursiveCall = false } = await req.json();

    if (!cards || !Array.isArray(cards) || cards.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Please provide an array of cards." }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Split the cards into current batch and remaining cards
    const currentBatch = cards.slice(0, batchSize);
    const remainingCards = cards.slice(batchSize);

    console.log(`Processing batch of ${currentBatch.length} cards (${remainingCards.length} remaining)`);

    // Process the current batch
    const batchResult = await processBatch(supabase, currentBatch);

    // If there are remaining cards, call the function again with the remaining cards
    if (remainingCards.length > 0) {
      try {
        const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-card-images`;
        const recursiveResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || ''
          },
          body: JSON.stringify({
            cards: remainingCards,
            batchSize,
            isRecursiveCall: true
          })
        });

        if (!recursiveResponse.ok) {
          console.error('Failed to call recursive function:', await recursiveResponse.text());
        } else {
          const recursiveResult = await recursiveResponse.json();
          console.log(`Recursive call processed ${recursiveResult.message || 'additional cards'}`);

          // Combine results if this was the initial call
          if (!isRecursiveCall) {
            return new Response(
              JSON.stringify({
                success: true,
                message: `Processed all ${cards.length} card images in batches`,
                currentBatchResults: batchResult.results,
                totalProcessed: cards.length
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
        }
      } catch (error) {
        console.error('Error during recursive function call:', error);
      }
    }

    // Return results for this batch
    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${batchResult.totalCards} card images`,
        results: batchResult.results,
        hasMoreCards: remainingCards.length > 0,
        remainingCards: remainingCards.length
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in fetch-card-images function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
})
