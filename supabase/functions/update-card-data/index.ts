// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

console.log("Update Card Data Function Initialized")

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
    // Create a Supabase client with the project URL and service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
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
          'X-Client-Info': 'update-card-data-function'
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

    // Get all cards that don't have misc_info in their api_data
    const { data: cardsToUpdate, error: fetchError } = await supabase
      .from('cards')
      .select('id, api_data')
      .filter('api_data->misc_info', 'is', null);

    if (fetchError) {
      throw new Error(`Error fetching cards to update: ${fetchError.message}`);
    }

    if (!cardsToUpdate || cardsToUpdate.length === 0) {
      return new Response(
        JSON.stringify({ message: "No cards need updating." }),
        { headers: corsHeaders }
      );
    }

    // Extract IDs of cards that need updating
    const cardIdsToUpdate = cardsToUpdate.map(card => card.id);
    console.log(`Found ${cardIdsToUpdate.length} cards to update with missing misc_info`);

    // Batch processing for cards
    const BATCH_SIZE = 200; // Maximum cards per API call
    const cardIdBatches = [];

    for (let i = 0; i < cardIdsToUpdate.length; i += BATCH_SIZE) {
      cardIdBatches.push(cardIdsToUpdate.slice(i, i + BATCH_SIZE));
    }

    // Process each batch with rate limiting
    const updatedCards = [];
    let failedCards = 0;

    for (const batch of cardIdBatches) {
      // Wait if we're approaching rate limit
      await waitForApiAvailability(supabase);

      // Record this API request
      await recordApiRequest(supabase);

      // Fetch batch from YGOProdeck API
      const apiUrl = `https://db.ygoprodeck.com/api/v7/cardinfo.php?id=${batch.join(',')}&misc=yes`;
      const response = await fetch(apiUrl);

      if (!response.ok) {
        console.error(`YGOProdeck API error for batch: ${response.statusText}`);
        failedCards += batch.length;
        continue;
      }

      const apiData = await response.json();

      if (!apiData.data || !Array.isArray(apiData.data)) {
        console.error("Invalid response from YGOProdeck API for batch");
        failedCards += batch.length;
        continue;
      }

      // Update cards in database
      for (const card of apiData.data) {
        const { error: updateError } = await supabase
          .from('cards')
          .update({ api_data: card })
          .eq('id', card.id);

        if (updateError) {
          console.error(`Error updating card ${card.id}: ${updateError.message}`);
          failedCards++;
        } else {
          updatedCards.push(card.id);
        }
      }

      // Small delay between batches
      if (batch !== cardIdBatches[cardIdBatches.length - 1]) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    return new Response(
      JSON.stringify({
        updated: updatedCards.length,
        failed: failedCards,
        message: `Successfully updated ${updatedCards.length} cards. Failed to update ${failedCards} cards.`
      }),
      { headers: corsHeaders }
    );

  } catch (error) {
    console.error("Error in update-card-data function:", error);

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
