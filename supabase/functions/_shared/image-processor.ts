// File: /home/awsm/dev/ygo-draft/supabase/functions/_shared/image-processor.ts
// Function to process and store a card image in S3 by calling the AWS Lambda function with the image URL
export async function processCardImageWithUrl(imageUrl: string, cardId?: string, isSmall: boolean = false): Promise<string | null> {
    try {
        // Call the card image processor function
        const lambdaUrl = Deno.env.get('AWS_LAMBDA_URL');
        if (!lambdaUrl) {
            console.error('AWS_LAMBDA_URL environment variable not set');
            return null;
        }

        // Prepare request body with image URL
        const requestBody = {
            imageUrl,
            cardId,
            isSmall
        };

        const response = await fetch(lambdaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            console.error(`Failed to process image: ${response.statusText}`);
            return null;
        }

        const responseData = await response.json();
        return responseData.url || null;
    } catch (error) {
        console.error(`Error processing image:`, error);
        return null;
    }
}

// Process a batch of images by sending them to the Lambda function
export async function processBatchOfImages(imageBatch: Array<{ imageUrl: string, cardId: string, isSmall: boolean }>): Promise<Array<{
    success: boolean,
    cardId: string,
    isSmall: boolean,
    url?: string,
    error?: string
}>> {
    try {
        // Use the hardcoded Lambda URL if the environment variable is not set
        const lambdaUrl = Deno.env.get('AWS_LAMBDA_URL');
        if (!lambdaUrl) {
            console.error('AWS_LAMBDA_URL environment variable not set and no fallback available');
            return imageBatch.map(item => ({
                success: false,
                cardId: item.cardId,
                isSmall: item.isSmall,
                error: 'AWS_LAMBDA_URL environment variable not set and no fallback available'
            }));
        }

        console.log(`Processing batch of ${imageBatch.length} images through Lambda at ${lambdaUrl}`);

        // Call Lambda with a batch of images for parallel processing
        console.log(`Sending batch of ${imageBatch.length} images to Lambda. First item sample:`, 
                     JSON.stringify(imageBatch[0]).substring(0, 200));
        
        const response = await fetch(lambdaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                batch: imageBatch
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to process batch: ${response.statusText}. Response: ${errorText}`);
            return imageBatch.map(item => ({
                success: false,
                cardId: item.cardId,
                isSmall: item.isSmall,
                error: `Lambda batch processing failed: ${response.statusText}. Details: ${errorText}`
            }));
        }

        const result = await response.json();
        console.log(`Batch successfully processed: ${result.message || 'No message'}`);

        if (!result.results || !Array.isArray(result.results)) {
            console.error('Lambda returned invalid results format:', result);
            return imageBatch.map(item => ({
                success: false,
                cardId: item.cardId,
                isSmall: item.isSmall,
                error: 'Lambda returned invalid results format'
            }));
        }

        return result.results;
    } catch (error) {
        console.error('Error processing batch with Lambda:', error);
        return imageBatch.map(item => ({
            success: false,
            cardId: item.cardId,
            isSmall: item.isSmall,
            error: `Error: ${error instanceof Error ? error.message : String(error)}`
        }));
    }
}

// Check if an image exists in the S3 bucket
export async function checkImageExistsInS3(cardId: string, isSmall: boolean = false): Promise<boolean> {
    try {
        // Construct the S3 URL directly
        const region = Deno.env.get('AWS_REGION') || 'us-east-1';
        const bucket = Deno.env.get('S3_BUCKET_AVIF') || 'ygo-card-images-avif';
        const fileName = `${cardId}${isSmall ? '_small' : ''}.avif`;
        const url = `https://${bucket}.s3.${region}.amazonaws.com/${fileName}`;

        // Check if the file exists with a HEAD request
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (error) {
        console.error(`Error checking if image exists in S3:`, error);
        return false;
    }
}
