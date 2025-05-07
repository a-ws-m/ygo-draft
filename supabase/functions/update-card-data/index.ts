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

// Process images for cards
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

// Check current YGODB version
async function getCurrentDbVersion(): Promise<string> {
  try {
    await waitForApiAvailability({ from: () => ({ select: () => ({ eq: () => ({ gte: () => ({ count: 0 }) }) }) }) });

    const response = await fetch('https://db.ygoprodeck.com/api/v7/checkDBVer.php');
    if (!response.ok) {
      throw new Error(`Failed to get DB version: ${response.statusText}`);
    }

    const data = await response.json();
    return data[0].database_version.toString();
  } catch (error) {
    console.error("Error checking YGO DB version:", error);
    throw error;
  }
}

// Get stored version from our database
async function getStoredDbVersion(supabase): Promise<string> {
  try {
    const { data, error } = await supabase
      .from('ygodb_version')
      .select('version')
      .eq('is_current', true)
      .single();

    if (error) {
      console.error("Error getting stored DB version:", error);
      return "0"; // Default to 0 if we can't get the stored version
    }

    return data?.version || "0";
  } catch (error) {
    console.error("Error retrieving stored DB version:", error);
    return "0";
  }
}

// Update our stored DB version
async function updateStoredDbVersion(supabase, version: string): Promise<void> {
  try {
    // First update any current versions to not be current
    const { error: updateError } = await supabase
      .from('ygodb_version')
      .update({ is_current: false })
      .eq('is_current', true);

    if (updateError) {
      console.error("Error updating previous DB version:", updateError);
      throw updateError;
    }

    // Then insert the new current version
    const { error } = await supabase
      .from('ygodb_version')
      .insert({
        version: version,
        last_updated: new Date().toISOString(),
        is_current: true
      });

    if (error) {
      console.error("Error inserting new DB version:", error);
      throw error;
    }
  } catch (error) {
    console.error("Error saving DB version:", error);
    throw error; // Re-throw the error to be handled by the caller
  }
}

Deno.serve(async (req) => {
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

    // Check if update is needed by comparing versions
    const currentVersion = await getCurrentDbVersion();
    const storedVersion = await getStoredDbVersion(supabase);

    if (currentVersion === storedVersion) {
      return new Response(
        JSON.stringify({
          message: "Database is up to date",
          version: currentVersion
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Database update needed. Current: ${currentVersion}, Stored: ${storedVersion}`);

    // Fetch all cards from API
    await waitForApiAvailability(supabase);
    await recordApiRequest(supabase);

    const apiUrl = 'https://db.ygoprodeck.com/api/v7/cardinfo.php?misc=yes';
    const response = await fetch(apiUrl);

    if (!response.ok) {
      throw new Error(`YGOProdeck API error: ${response.statusText}`);
    }

    const apiData = await response.json();

    if (!apiData.data || !Array.isArray(apiData.data)) {
      throw new Error("Invalid response from YGOProdeck API");
    }

    const cards = apiData.data;
    console.log(`Downloaded ${cards.length} cards from API`);

    // Process cards in batches for database update
    const BATCH_SIZE = 500;
    const batches = [];
    for (let i = 0; i < cards.length; i += BATCH_SIZE) {
      batches.push(cards.slice(i, i + BATCH_SIZE));
    }

    let totalProcessed = 0;
    let totalErrors = 0;
    let updateSuccessful = true;

    // Process each batch
    for (const batch of batches) {
      // Prepare data for insertion/update
      const upsertData = batch.map(card => ({
        id: card.id,
        name: card.name,
        type: card.type,
        api_data: card
      }));

      // Upsert cards to database
      const { error } = await supabase
        .from('cards')
        .upsert(upsertData, { onConflict: 'id' });

      if (error) {
        console.error(`Error upserting batch: ${error.message}`);
        totalErrors += batch.length;
        updateSuccessful = false;
      } else {
        totalProcessed += batch.length;
      }
    }

    // Only update stored version after successful update
    if (updateSuccessful && totalErrors === 0) {
      try {
        await updateStoredDbVersion(supabase, currentVersion);

        // Process images in background
        processCardImages(supabase, cards, 500)
          .catch(error => console.error("Background image processing error:", error));

        return new Response(
          JSON.stringify({
            success: true,
            message: `Database updated from version ${storedVersion} to ${currentVersion}`,
            processed: totalProcessed,
            errors: totalErrors,
            totalCards: cards.length
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        console.error("Failed to update database version:", error);
        return new Response(
          JSON.stringify({
            success: false,
            message: "Cards processed but database version update failed",
            error: error.message,
            processed: totalProcessed,
            errors: totalErrors,
            totalCards: cards.length
          }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({
          success: false,
          message: "Database update completed with errors, version not updated",
          processed: totalProcessed,
          errors: totalErrors,
          totalCards: cards.length
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

  } catch (error) {
    console.error("Error in update-card-data function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
})
