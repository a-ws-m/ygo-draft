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

// Function to convert image to WebP using the convert-image function
async function convertToWebP(imageBlob: Blob): Promise<Blob | null> {
  try {
    // Call the convert-image function
    const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/convert-image`;
    const webpResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''}`,
        'Content-Type': imageBlob.type
      },
      body: imageBlob
    });

    if (!webpResponse.ok) {
      console.error(`Failed to convert image: ${webpResponse.statusText}`);
      return null;
    }

    return await webpResponse.blob();
  } catch (error) {
    console.error(`Error converting image to WebP:`, error);
    return null;
  }
}

// Function to store a blob in Supabase Storage
async function uploadImageToSupabase(
  supabase,
  imageBlob: Blob | null,
  cardId: string,
  isSmall = false,
  isWebP = false
): Promise<boolean> {
  try {
    if (!imageBlob) return false;

    // Determine bucket name based on image size and format
    let bucketName: string;
    if (isWebP) {
      bucketName = isSmall ? 'card-images-small-webp' : 'card-images-webp';
    } else {
      bucketName = isSmall ? 'card_images_small' : 'card_images';
    }

    // Determine file extension based on format
    const extension = isWebP ? '.webp' : '.jpg';
    const fileName = `${cardId}${isSmall ? '_small' : ''}${extension}`;

    // Determine content type
    const contentType = isWebP ? 'image/webp' : 'image/jpeg';

    // Upload to Supabase Storage
    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .upload(fileName, imageBlob, {
        contentType: contentType,
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

// Function to check if an image already exists in a bucket
async function checkImageExists(
  supabase,
  cardId: string,
  isSmall = false,
  isWebP = false
): Promise<boolean> {
  try {
    // Determine bucket name based on image size and format
    let bucketName: string;
    if (isWebP) {
      bucketName = isSmall ? 'card-images-small-webp' : 'card-images-webp';
    } else {
      bucketName = isSmall ? 'card_images_small' : 'card_images';
    }

    // Determine file extension based on format
    const extension = isWebP ? '.webp' : '.jpg';
    const fileName = `${cardId}${isSmall ? '_small' : ''}${extension}`;

    // Check if the file exists
    const { data, error } = await supabase
      .storage
      .from(bucketName)
      .getPublicUrl(fileName);

    if (error) {
      console.error(`Error checking if image exists in ${bucketName}:`, error);
      return false;
    }

    // Verify the file actually exists by making a HEAD request
    try {
      const response = await fetch(data.publicUrl, { method: 'HEAD' });
      return response.ok;
    } catch (fetchError) {
      console.error(`Error verifying file existence:`, fetchError);
      return false;
    }
  } catch (error) {
    console.error(`Error checking if image exists for card ${cardId}:`, error);
    return false;
  }
}

// Function to process a batch of cards
async function processBatch(supabase, cards) {
  // Download all images in parallel first, but only if they don't already exist
  const fetchPromises = [];
  const existingCheckPromises = [];

  for (const card of cards) {
    const cardId = card.id;
    const imageUrl = card.card_images?.[0]?.image_url || null;
    const smallImageUrl = card.card_images?.[0]?.image_url_small || null;

    // Check if images already exist
    if (imageUrl) {
      existingCheckPromises.push(
        Promise.all([
          checkImageExists(supabase, cardId, false, false),
          checkImageExists(supabase, cardId, false, true)
        ]).then(([jpgExists, webpExists]) => {
          if (!jpgExists || !webpExists) {
            return fetchCardImage(imageUrl, cardId, false);
          }
          console.log(`Skipping large image for card ${cardId} - already exists`);
          return { blob: null, cardId, isSmall: false, skipped: true };
        })
      );
    }

    if (smallImageUrl) {
      existingCheckPromises.push(
        Promise.all([
          checkImageExists(supabase, cardId, true, false),
          checkImageExists(supabase, cardId, true, true)
        ]).then(([jpgExists, webpExists]) => {
          if (!jpgExists || !webpExists) {
            return fetchCardImage(smallImageUrl, cardId, true);
          }
          console.log(`Skipping small image for card ${cardId} - already exists`);
          return { blob: null, cardId, isSmall: true, skipped: true };
        })
      );
    }
  }

  // Wait for all existence checks and potential downloads to complete
  const downloadedImages = await Promise.all(existingCheckPromises);

  // Now upload the images sequentially
  const results = {};

  for (const imageData of downloadedImages) {
    const { blob, cardId, isSmall, skipped } = imageData;

    // Initialize card result if not present
    if (!results[cardId]) {
      results[cardId] = {
        cardId,
        largeImageSuccess: false,
        smallImageSuccess: false,
        largeWebPSuccess: false,
        smallWebPSuccess: false,
        largeImageSkipped: false,
        smallImageSkipped: false
      };
    }

    // If the image was skipped because it already exists, mark it as successful but skipped
    if (skipped) {
      if (isSmall) {
        results[cardId].smallImageSuccess = true;
        results[cardId].smallWebPSuccess = true;
        results[cardId].smallImageSkipped = true;
      } else {
        results[cardId].largeImageSuccess = true;
        results[cardId].largeWebPSuccess = true;
        results[cardId].largeImageSkipped = true;
      }
      continue;
    }

    // Skip if no blob
    if (!blob) continue;

    // Upload the original JPG image
    const jpgSuccess = await uploadImageToSupabase(supabase, blob, cardId, isSmall, false);

    if (isSmall) {
      results[cardId].smallImageSuccess = jpgSuccess;
    } else {
      results[cardId].largeImageSuccess = jpgSuccess;
    }

    // Convert to WebP and upload
    const webpBlob = await convertToWebP(blob);
    if (webpBlob) {
      const webpSuccess = await uploadImageToSupabase(supabase, webpBlob, cardId, isSmall, true);

      if (isSmall) {
        results[cardId].smallWebPSuccess = webpSuccess;
      } else {
        results[cardId].largeWebPSuccess = webpSuccess;
      }
    }
  }

  // Calculate upload statistics
  const totalCards = Object.keys(results).length;
  const successfulLargeUploads = Object.values(results).filter(r => r.largeImageSuccess).length;
  const successfulSmallUploads = Object.values(results).filter(r => r.smallImageSuccess).length;
  const successfulLargeWebPUploads = Object.values(results).filter(r => r.largeWebPSuccess).length;
  const successfulSmallWebPUploads = Object.values(results).filter(r => r.smallWebPSuccess).length;
  const skippedLargeImages = Object.values(results).filter(r => r.largeImageSkipped).length;
  const skippedSmallImages = Object.values(results).filter(r => r.smallImageSkipped).length;

  console.log(`Batch completed: ${totalCards} cards processed`);
  console.log(`Large JPG images: ${successfulLargeUploads} uploaded successfully (${skippedLargeImages} skipped)`);
  console.log(`Small JPG images: ${successfulSmallUploads} uploaded successfully (${skippedSmallImages} skipped)`);
  console.log(`Large WebP images: ${successfulLargeWebPUploads} uploaded successfully`);
  console.log(`Small WebP images: ${successfulSmallWebPUploads} uploaded successfully`);

  return {
    totalCards,
    successfulLargeUploads,
    successfulSmallUploads,
    successfulLargeWebPUploads,
    successfulSmallWebPUploads,
    skippedLargeImages,
    skippedSmallImages,
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
