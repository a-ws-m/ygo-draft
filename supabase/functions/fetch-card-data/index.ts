// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflightRequest, createCorsResponse, createErrorResponse } from "../_shared/cors.ts";

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

// Remove the storeCardImage function and replace with a function to call the image edge function
async function processCardImages(supabase, cards, BATCH_SIZE = 500) {
  try {
    // Split cards into batches of 100
    const batches = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      batches.push(cards.slice(i, i + BATCH_SIZE));
    }

    // Call fetch-card-images function for each batch in parallel
    const imageServiceUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-card-images`;
    const imageServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const batchPromises = batches.map(async (batch) => {
      const response = await fetch(imageServiceUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${imageServiceKey}`
        },
        body: JSON.stringify({ cards: batch })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Error from image service: ${errorText}`);
        return false;
      }

      return true;
    });

    // Wait for all batches to complete
    await Promise.all(batchPromises);
    return true;
  } catch (error) {
    console.error("Error processing card images:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest();
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

    // Parse the request body
    const { cardIds } = await req.json();

    if (!cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return createCorsResponse(
        { error: "Invalid request. Please provide an array of card IDs." },
        400
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

      return createCorsResponse({
        data: allCards,
        message: "All cards found in database"
      });
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
      const apiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${batch.join(',')}&misc=yes`;
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
        // No longer processing images here, just return the card data
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

      // After inserting cards, process images in parallel
      // This lets us return DB data quickly while images process in the background
      if (cardsToInsert.length > 0) {
        // Extract cards with their API data including image URLs
        const cardsForImageProcessing = cardsToInsert.map(card => card.api_data);

        // Process in batches of 100 cards
        processCardImages(supabase, cardsForImageProcessing, 500)
          .catch(error => console.error("Background image processing error:", error));
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

    return createCorsResponse({
      data: allCards,
      newlyFetched: missingCardIds.length,
      message: `Successfully processed ${cardIds.length} cards. Fetched ${missingCardIds.length} new cards.`
    });

  } catch (error) {
    console.error("Error in fetch-card-data function:", error);
    return createErrorResponse(error.message || "An unexpected error occurred");
  }
})
