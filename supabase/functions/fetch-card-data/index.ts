// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log("Card Data Fetcher Function Initialized")

// Rate limiting for YGOPro API - 20 requests per second
const API_RATE_LIMIT = 20;
const API_TIME_WINDOW = 1000; // 1 second in ms
const API_NAME = 'ygoprodeck';

// Check if we should throttle API requests
async function shouldThrottleApiRequest(supabase): Promise<boolean> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - API_TIME_WINDOW);

  // Count requests in the last time window
  const { data, error, count } = await supabase
    .from('api_calls')
    .select('*', { count: 'exact', head: true })
    .eq('api_name', API_NAME)
    .gte('timestamp', windowStart.toISOString());

  if (error) {
    console.error('Error checking API rate limit:', error);
    return false; // Proceed with caution if we can't check
  }

  return count >= API_RATE_LIMIT;
}

// Record an API request
async function recordApiRequest(supabase): Promise<void> {
  const { error } = await supabase
    .from('api_calls')
    .insert({ api_name: API_NAME });

  if (error) {
    console.error('Error recording API request:', error);
  }
}

// Wait until we can make an API request
async function waitForApiAvailability(supabase): Promise<void> {
  const maxWaitTime = 5000; // Maximum wait time: 5 seconds
  const startTime = Date.now();

  while (await shouldThrottleApiRequest(supabase)) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error("Rate limit wait time exceeded");
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}

// Function to download and store image in Supabase Storage
async function storeCardImage(supabase, imageUrl, cardId, isSmall = false): Promise<boolean> {
  try {
    if (!imageUrl) return false;

    const bucketName = isSmall ? 'card_images_small' : 'card_images';
    const fileName = `${cardId}${isSmall ? '_small' : ''}.jpg`;

    // Download the image
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      console.error(`Failed to download image from ${imageUrl}: ${imageResponse.statusText}`);
      return false;
    }

    const imageBlob = await imageResponse.blob();

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

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    // Create a Supabase client with the project URL and ANON key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
    const supabaseAdminKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // Use the service role key for admin privileges (inserting into tables)
    const supabase = createClient(supabaseUrl, supabaseAdminKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        headers: {
          'Authorization': `Bearer ${supabaseAdminKey}`,
          'X-Client-Info': 'fetch-card-data-function'
        },
      },
    });

    // Add CORS headers to all responses
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Content-Type': 'application/json'
    };

    // Parse the request body
    const { cardIds } = await req.json();

    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return new Response(
        JSON.stringify({ error: "Invalid request. Please provide an array of card IDs." }),
        { status: 400, headers: corsHeaders }
      );
    }

    // Check which cards already exist in the database
    const { data: existingCards, error: existingCardsError } = await supabase
      .from('cards')
      .select('id')
      .in('id', cardIds);

    if (existingCardsError) {
      throw new Error(`Error checking existing cards: ${existingCardsError.message}`);
    }

    // Extract IDs of existing cards
    const existingCardIds = existingCards?.map(card => card.id) || [];

    // Filter out card IDs that already exist in the database
    const missingCardIds = cardIds.filter(id => !existingCardIds.includes(id));

    // If all cards already exist, return them
    if (missingCardIds.length === 0) {
      const { data: allCards, error: allCardsError } = await supabase
        .from('cards')
        .select('*')
        .in('id', cardIds);

      if (allCardsError) {
        throw new Error(`Error fetching all cards: ${allCardsError.message}`);
      }

      return new Response(
        JSON.stringify({ data: allCards, message: "All cards found in database" }),
        { headers: corsHeaders }
      );
    }

    // Batch processing for missing cards
    const BATCH_SIZE = 200; // Maximum cards per API call
    const missingCardIdBatches = [];

    for (let i = 0; i < missingCardIds.length; i += BATCH_SIZE) {
      missingCardIdBatches.push(missingCardIds.slice(i, i + BATCH_SIZE));
    }

    // Process each batch with rate limiting
    const cardsToInsert = [];
    for (const batch of missingCardIdBatches) {
      // Wait if we're approaching rate limit
      await waitForApiAvailability(supabase);

      // Record this API request
      await recordApiRequest(supabase);

      // Fetch batch from YGOProdeck API
      const apiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${batch.join(',')}`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        throw new Error(`YGOProdeck API error: ${response.statusText}`);
      }

      const apiData = await response.json();

      if (!apiData.data || !Array.isArray(apiData.data)) {
        throw new Error("Invalid response from YGOProdeck API");
      }

      // Process cards in this batch with parallel image uploads
      const cardProcessingPromises = apiData.data.map(async (card) => {
        const imageUrl = card.card_images[0]?.image_url || null;
        const smallImageUrl = card.card_images[0]?.image_url_small || null;

        // Upload both images in parallel
        await Promise.all([
          storeCardImage(supabase, imageUrl, card.id, false),
          storeCardImage(supabase, smallImageUrl, card.id, true)
        ]);

        return {
          id: card.id,
          name: card.name,
          type: card.type,
          api_data: card
        };
      });

      // Wait for all cards in batch to be processed
      const processedCards = await Promise.all(cardProcessingPromises);
      cardsToInsert.push(...processedCards);

      // Small delay between batches
      if (batch !== missingCardIdBatches[missingCardIdBatches.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    // Insert new cards into the database
    if (cardsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('cards')
        .insert(cardsToInsert);

      if (insertError) {
        throw new Error(`Error inserting cards: ${insertError.message}`);
      }
    }

    // Fetch all requested cards from the database (both existing and newly inserted)
    const { data: allCards, error: allCardsError } = await supabase
      .from('cards')
      .select('*')
      .in('id', cardIds);

    if (allCardsError) {
      throw new Error(`Error fetching all cards after insert: ${allCardsError.message}`);
    }

    return new Response(
      JSON.stringify({
        data: allCards,
        newlyFetched: missingCardIds.length,
        message: `Successfully processed ${cardIds.length} cards. Fetched ${missingCardIds.length} new cards.`
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error("Error in fetch-card-data function:", error);

    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      {
        status: 500,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info',
          'Content-Type': 'application/json'
        }
      }
    );
  }
})
