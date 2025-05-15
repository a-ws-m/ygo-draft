// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
// Import the image processor
import { checkImageExistsInS3, processBatchOfImages } from "../_shared/image-processor.ts";

console.log("Card Image Fetcher Function Initialized")

// Define card types
interface Card {
  id: string;
  card_images?: Array<{
    image_url?: string;
    image_url_small?: string;
  }>;
}

// Define processing result type
interface ProcessingResult {
  cardId: string;
  isSmall: boolean;
  processed: boolean;
  skipped?: boolean;
  url?: string;
  error?: string;
}

// Maximum number of images to send in a single batch to Lambda
// Reduced from 50 to prevent timeouts
const MAX_LAMBDA_BATCH_SIZE = 15;

// Add delay between Lambda calls to prevent throttling
const LAMBDA_CALL_DELAY_MS = 1000;

// Function to process a batch of cards with automatic batch size reduction on failure
async function processBatch(cards: Card[], attemptReduction: boolean = true): Promise<{
  totalCards: number;
  processedLargeImages: number;
  processedSmallImages: number;
  skippedLargeImages: number;
  skippedSmallImages: number;
  results: ProcessingResult[];
}> {
  try {
    // First, check which images need to be processed by checking if they exist in S3
    const existenceCheckPromises: Promise<{
      cardId: string;
      isSmall: boolean;
      imageUrl: string;
      needsProcessing: boolean;
    }>[] = [];

    // Queue up existence checks for all images
    for (const card of cards) {
      const cardId = card.id;
      const imageUrl = card.card_images?.[0]?.image_url;
      const smallImageUrl = card.card_images?.[0]?.image_url_small;

      if (imageUrl) {
        existenceCheckPromises.push(
          checkImageExistsInS3(cardId, false).then((exists) => ({
            cardId,
            isSmall: false,
            imageUrl,
            needsProcessing: !exists
          }))
        );
      }

      if (smallImageUrl) {
        existenceCheckPromises.push(
          checkImageExistsInS3(cardId, true).then((exists) => ({
            cardId,
            isSmall: true,
            imageUrl: smallImageUrl,
            needsProcessing: !exists
          }))
        );
      }
    }

    // Wait for all existence checks to complete
    const existenceResults = await Promise.all(existenceCheckPromises);

    // Filter to only the images that need processing
    const imagesToProcess = existenceResults.filter(result => result.needsProcessing);

    // Create skipped results for images that don't need processing
    const skippedResults: ProcessingResult[] = existenceResults
      .filter(result => !result.needsProcessing)
      .map(result => ({
        cardId: result.cardId,
        isSmall: result.isSmall,
        processed: false,
        skipped: true
      }));

    console.log(`Found ${imagesToProcess.length} images that need processing`);
    console.log(`Skipping ${skippedResults.length} images that already exist in S3`);

    // Process the images in batches to avoid overwhelming Lambda
    const processedResults: ProcessingResult[] = [];

    // Split the images into batches for Lambda
    for (let i = 0; i < imagesToProcess.length; i += MAX_LAMBDA_BATCH_SIZE) {
      const batch = imagesToProcess.slice(i, i + MAX_LAMBDA_BATCH_SIZE);
      console.log(`Processing batch ${Math.floor(i / MAX_LAMBDA_BATCH_SIZE) + 1} of ${Math.ceil(imagesToProcess.length / MAX_LAMBDA_BATCH_SIZE)} (${batch.length} images)`);

      // Add a delay between Lambda calls to prevent throttling, except for the first batch
      if (i > 0) {
        console.log(`Waiting ${LAMBDA_CALL_DELAY_MS}ms before processing next batch to prevent throttling...`);
        await new Promise(resolve => setTimeout(resolve, LAMBDA_CALL_DELAY_MS));
      }

      // Format the batch for Lambda
      const lambdaBatch = batch.map(item => ({
        imageUrl: item.imageUrl,
        cardId: item.cardId,
        isSmall: item.isSmall
      }));

      try {
        // Add retry mechanism for Lambda processing
        const MAX_RETRIES = 2;
        let retryCount = 0;
        let lambdaResults = null;
        
        while (retryCount <= MAX_RETRIES) {
          try {
            // Process the batch with Lambda, with a timeout to prevent hanging forever
            const LAMBDA_TIMEOUT_MS = 25000; // 25 seconds timeout (Lambda has 30s limit)
            
            const timeoutPromise = new Promise<Array<{
              success: boolean,
              cardId: string,
              isSmall: boolean,
              url?: string,
              error?: string
            }>>((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Lambda processing timed out after ${LAMBDA_TIMEOUT_MS}ms`));
              }, LAMBDA_TIMEOUT_MS);
            });
            
            // Race between the Lambda call and the timeout
            const lambdaPromise = processBatchOfImages(lambdaBatch);
            lambdaResults = await Promise.race([lambdaPromise, timeoutPromise]);
            
            // If we get here, it means the batch was processed successfully
            break;
          } catch (error) {
            retryCount++;
            if (retryCount <= MAX_RETRIES) {
              console.log(`Attempt ${retryCount} failed, retrying after delay... Error: ${error instanceof Error ? error.message : String(error)}`);
              // Exponential backoff for retries
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, retryCount)));
            } else {
              // All retries failed, propagate the error
              throw error;
            }
          }
        }
        
        // If all retries failed and lambdaResults is still null, throw an error
        if (lambdaResults === null) {
          throw new Error("Failed to process images after all retry attempts");
        }

        // Map the Lambda results to our result format
        const formattedResults = lambdaResults.map(result => ({
          cardId: result.cardId,
          isSmall: result.isSmall,
          processed: result.success,
          url: result.url,
          error: result.error
        }));

        processedResults.push(...formattedResults);
      } catch (error) {
        console.error(`Error processing batch ${i / MAX_LAMBDA_BATCH_SIZE + 1}:`, error);

        // Add error results for each image in this batch
        const errorResults = batch.map(item => ({
          cardId: item.cardId,
          isSmall: item.isSmall,
          processed: false,
          error: `Batch processing error: ${error instanceof Error ? error.message : String(error)}`
        }));

        processedResults.push(...errorResults);
      }
    }

    // Combine the processed and skipped results
    const allResults = [...processedResults, ...skippedResults];

    // Calculate statistics
    const processedCards = new Set(allResults.map(img => img.cardId));
    const totalCards = processedCards.size;
    const skippedLargeImages = allResults.filter(img => img.isSmall === false && img.skipped).length;
    const skippedSmallImages = allResults.filter(img => img.isSmall === true && img.skipped).length;
    const processedLargeImages = allResults.filter(img => img.isSmall === false && img.processed).length;
    const processedSmallImages = allResults.filter(img => img.isSmall === true && img.processed).length;

    console.log(`Batch completed: ${totalCards} cards processed`);
    console.log(`Large images: ${processedLargeImages} processed (${skippedLargeImages} skipped)`);
    console.log(`Small images: ${processedSmallImages} processed (${skippedSmallImages} skipped)`);

    return {
      totalCards,
      processedLargeImages,
      processedSmallImages,
      skippedLargeImages,
      skippedSmallImages,
      results: allResults
    };
  } catch (error) {
    console.error(`Error processing batch: ${error instanceof Error ? error.message : String(error)}`);
    
    // If this was already a retry with reduced batch size or reduction is disabled, just propagate the error
    if (!attemptReduction || cards.length <= 5) {
      throw error;
    }
    
    // Split the batch in half and try each half separately
    console.log(`Splitting batch of ${cards.length} cards into smaller batches due to processing failure`);
    const midpoint = Math.floor(cards.length / 2);
    const firstHalf = cards.slice(0, midpoint);
    const secondHalf = cards.slice(midpoint);
    
    // Process each half with attemptReduction=false to prevent infinite recursion
    try {
      console.log(`Processing first half (${firstHalf.length} cards)`);
      const firstResults = await processBatch(firstHalf, false);
      
      console.log(`Processing second half (${secondHalf.length} cards)`);
      const secondResults = await processBatch(secondHalf, false);
      
      // Combine the results
      return {
        totalCards: firstResults.totalCards + secondResults.totalCards,
        processedLargeImages: firstResults.processedLargeImages + secondResults.processedLargeImages,
        processedSmallImages: firstResults.processedSmallImages + secondResults.processedSmallImages,
        skippedLargeImages: firstResults.skippedLargeImages + secondResults.skippedLargeImages,
        skippedSmallImages: firstResults.skippedSmallImages + secondResults.skippedSmallImages,
        results: [...firstResults.results, ...secondResults.results]
      };
    } catch (splitError) {
      console.error(`Error processing split batches: ${splitError instanceof Error ? splitError.message : String(splitError)}`);
      throw splitError;
    }
  }
}

// Interface for the request body
interface RequestBody {
  cards: Card[];
  batchSize?: number;
  isRecursiveCall?: boolean;
}

Deno.serve(async (req) => {
  try {
    // Parse the request body
    const { cards, batchSize = 50, isRecursiveCall = false } = await req.json() as RequestBody;

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
    const batchResult = await processBatch(currentBatch);

    // If there are remaining cards, call the function again with the remaining cards
    // but only if this is not already a recursive call (to prevent deep recursion)
    if (remainingCards.length > 0 && !isRecursiveCall) {
      try {
        // Add a delay before making a recursive call to prevent overwhelming the server
        console.log(`Waiting 2 seconds before processing the next batch of ${remainingCards.length} cards...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Split remaining cards into smaller sub-batches to ensure timely processing
        // This prevents too many cards from being processed at once in recursive calls
        const subBatchSize = Math.min(batchSize, 30); // Further limit sub-batch size
        
        const functionUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-card-images`;
        const recursiveResponse = await fetch(functionUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization') || ''
          },
          body: JSON.stringify({
            cards: remainingCards,
            batchSize: subBatchSize,
            isRecursiveCall: true
          })
        });

        if (!recursiveResponse.ok) {
          const errorText = await recursiveResponse.text();
          console.error('Failed to call recursive function:', errorText);
          
          // Continue with current batch results even if recursive call failed
          return new Response(
            JSON.stringify({
              success: true,
              message: `Processed ${batchResult.totalCards} card images. Warning: Failed to process remaining ${remainingCards.length} cards.`,
              results: batchResult.results,
              hasMoreCards: remainingCards.length > 0,
              remainingCards: remainingCards.length,
              recursiveError: errorText
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } else {
          const recursiveResult = await recursiveResponse.json();
          console.log(`Recursive call processed ${recursiveResult.message || 'additional cards'}`);

          // Combine results if this was the initial call
          return new Response(
            JSON.stringify({
              success: true,
              message: `Processed all ${cards.length} card images in batches`,
              currentBatchResults: batchResult.results,
              totalProcessed: cards.length,
              recursiveResults: recursiveResult
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
      } catch (error) {
        console.error('Error during recursive function call:', error);
        
        // Return current batch results even if recursive call failed
        return new Response(
          JSON.stringify({
            success: true,
            message: `Processed ${batchResult.totalCards} card images. Failed to process remaining ${remainingCards.length} cards due to error.`,
            results: batchResult.results,
            hasMoreCards: remainingCards.length > 0,
            remainingCards: remainingCards.length,
            recursiveError: error instanceof Error ? error.message : String(error)
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
    }

    // Return results for this batch (for recursive calls or when there are no more cards)
    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${batchResult.totalCards} card images`,
        stats: {
          totalCards: batchResult.totalCards,
          processedLargeImages: batchResult.processedLargeImages,
          processedSmallImages: batchResult.processedSmallImages,
          skippedLargeImages: batchResult.skippedLargeImages,
          skippedSmallImages: batchResult.skippedSmallImages,
        },
        results: batchResult.results,
        hasMoreCards: remainingCards.length > 0,
        remainingCards: remainingCards.length
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in fetch-card-images function:", error);
    
    // For timeout or connection errors, return a 503 (Service Unavailable) to suggest retrying
    if (error instanceof Error && 
        (error.message.includes('timeout') || 
         error.message.includes('network') || 
         error.message.includes('connection'))) {
      return new Response(
        JSON.stringify({ 
          error: "Service temporarily unavailable. The Lambda function may have timed out.", 
          message: error instanceof Error ? error.message : "An unexpected timeout occurred",
          retryAfter: 30 // Suggest client retry after 30 seconds
        }),
        { 
          status: 503, 
          headers: { 
            "Content-Type": "application/json",
            "Retry-After": "30" 
          } 
        }
      );
    }
    
    // For other errors, return a 500 Internal Server Error
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
})
