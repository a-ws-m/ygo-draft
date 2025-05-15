const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');

// Initialize S3 client
const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const OUTPUT_BUCKET = process.env.OUTPUT_BUCKET || 'ygo-card-images-avif';

console.log('Environment setup:', {
    AWS_REGION: process.env.AWS_REGION || 'us-east-1',
    OUTPUT_BUCKET: OUTPUT_BUCKET
});

/**
 * AWS Lambda handler for processing card images and storing them in S3
 * This function can be triggered by:
 * 1. Direct API Gateway invocation with binary image data
 * 2. S3 event when a new image is uploaded
 * 3. Supabase edge function calling this Lambda
 */
exports.handler = async (event) => {
    try {
        console.log('Processing image conversion request');
        console.log('Event type:', typeof event);
        console.log('Event structure:', JSON.stringify(event).substring(0, 500));
        
        // If event is a string (which can happen with API Gateway), try to parse it
        if (typeof event === 'string') {
            try {
                event = JSON.parse(event);
                console.log('Parsed string event to:', JSON.stringify(event).substring(0, 500));
            } catch (e) {
                console.error('Failed to parse string event:', e);
            }
        }
        
        // If event is from API Gateway, body may be a string that needs parsing
        if (event.body && typeof event.body === 'string' && !event.isBase64Encoded) {
            try {
                const parsedBody = JSON.parse(event.body);
                console.log('Successfully parsed body JSON:', JSON.stringify(parsedBody).substring(0, 500));
                
                // If body contains batch, process it directly
                if (parsedBody.batch && Array.isArray(parsedBody.batch) && parsedBody.batch.length > 0) {
                    console.log(`Found batch in parsed body with ${parsedBody.batch.length} images`);
                    console.log('First batch item:', JSON.stringify(parsedBody.batch[0]));
                    
                    const batchResults = await processBatch(parsedBody.batch);
                    return {
                        statusCode: 200,
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            success: true,
                            message: `Successfully processed ${batchResults.length} images from batch`,
                            results: batchResults
                        })
                    };
                }
                
                // Replace event with parsed body for further processing
                event = parsedBody;
            } catch (error) {
                console.error('Error parsing event.body as JSON:', error);
            }
        }
        
        // Determine input source and get image data
        let imageBuffer;
        let imageMetadata = {};
        let fileName;
        let cardId = 'unknown';
        let isSmall = false;
        
        // Check if this is an S3 event
        if (event.Records && event.Records[0]?.s3) {
            // This is an S3 event trigger
            const s3Record = event.Records[0].s3;
            const sourceBucket = s3Record.bucket.name;
            fileName = s3Record.object.key;
            
            console.log(`Processing S3 event for ${fileName} from bucket ${sourceBucket}`);
            
            // Extract cardId from filename if it follows the pattern {cardId}[_small].ext
            const fileNameMatch = fileName.match(/^(\d+)(_small)?\..*$/);
            if (fileNameMatch) {
                cardId = fileNameMatch[1];
                isSmall = !!fileNameMatch[2];
            }
            
            // Get the object from S3
            const getObjectCommand = new GetObjectCommand({
                Bucket: sourceBucket,
                Key: fileName
            });
            
            const s3Object = await s3Client.send(getObjectCommand);
            imageBuffer = await streamToBuffer(s3Object.Body);
            
            // Check if metadata contains cardId
            if (s3Object.Metadata && s3Object.Metadata.cardid) {
                cardId = s3Object.Metadata.cardid;
                isSmall = s3Object.Metadata.issmall === 'true';
            }
        } 
        // Check if this is a direct invocation with base64 encoded image
        else if (event.body && !event.batch) { // Skip if we already found batch
            // This could be either API Gateway or direct Lambda invocation
            const body = typeof event.body === 'string' ? 
                (event.isBase64Encoded ? Buffer.from(event.body, 'base64') : JSON.parse(event.body)) :
                event.body;
            
            if (Buffer.isBuffer(body)) {
                imageBuffer = body;
            } else if (body.image) {
                // Handle base64 encoded image in JSON
                imageBuffer = Buffer.from(body.image, 'base64');
            }
            
            // Get cardId, size information, and image URL
            if (body.cardId) {
                cardId = body.cardId.toString();
                isSmall = !!body.isSmall;
                
                // Use the card ID for the filename
                fileName = `${cardId}${isSmall ? '_small' : ''}.avif`;
                
                // If image URL is provided, fetch it
                if (body.imageUrl) {
                    try {
                        console.log(`Fetching image from URL: ${body.imageUrl}`);
                        const imageResponse = await fetch(body.imageUrl);
                        if (!imageResponse.ok) {
                            throw new Error(`Failed to fetch image: ${imageResponse.statusText}`);
                        }
                        imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
                    } catch (error) {
                        console.error('Error fetching image from URL:', error);
                        throw error;
                    }
                }
            } else {
                fileName = body.fileName || `image-${Date.now()}.avif`;
            }
            
            imageMetadata = body.metadata || {};
            // Add cardId to metadata
            imageMetadata.cardId = cardId;
            imageMetadata.isSmall = isSmall.toString();
        }
        // Check if we have a binary payload directly
        else if (Buffer.isBuffer(event)) {
            imageBuffer = event;
            fileName = `image-${Date.now()}.avif`;
        } 
        // Check if this is a batch processing request
        else if (event.batch && Array.isArray(event.batch)) {
            console.log(`Received batch processing request with ${event.batch.length} images`);
            
            // Make sure each batch item has required properties
            if (event.batch.length > 0 && event.batch.some(item => !item.cardId)) {
                console.error('Invalid batch format: some items are missing cardId');
                return {
                    statusCode: 400,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        success: false,
                        error: 'Invalid batch format: all items must have cardId'
                    })
                };
            }
            
            // Debug first few items in the batch
            console.log('First batch item sample:', JSON.stringify(event.batch[0]));
            
            // This is a batch processing request, process them one by one
            const batchResults = await processBatch(event.batch);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    success: true,
                    message: `Successfully processed and stored ${batchResults.length} images in batch`,
                    results: batchResults
                })
            };
        } else {
            throw new Error('Unsupported event format');
        }
        
        if (!imageBuffer) {
            throw new Error('No image data found in the request');
        }
        
        console.log(`Processing image ${fileName} and storing as AVIF format`);
        
        // Process the image with Sharp - convert to AVIF with quality settings
        const avifBuffer = await sharp(imageBuffer)
            .avif({
                quality: 80, // Higher quality setting for card images
                effort: 5    // Medium effort for reasonable encode time
            })
            .toBuffer();
        
        // Generate the output file name based on cardId if available
        let outputFileName;
        if (cardId !== 'unknown') {
            outputFileName = `${cardId}${isSmall ? '_small' : ''}.avif`;
        } else {
            // Fallback to the original filename pattern
            outputFileName = fileName.replace(/\.[^/.]+$/, '') + '.avif';
        }
        
        // Upload the converted image to S3 permanently (no expiration)
        const uploadParams = {
            Bucket: OUTPUT_BUCKET,
            Key: outputFileName,
            Body: avifBuffer,
            ContentType: 'image/avif',
            Metadata: {
                ...imageMetadata,
                originalFormat: getImageFormat(fileName),
                convertedAt: new Date().toISOString(),
                cardId: imageMetadata.cardId || 'unknown',
                isSmall: imageMetadata.isSmall === 'true' ? 'true' : 'false'
            }
            // No expiration - files will be stored indefinitely
        };
        
        console.log(`Uploading converted image to S3: ${outputFileName} (${avifBuffer.length} bytes)`);
        try {
            console.log(`Executing S3 upload command for ${outputFileName}`);
            await s3Client.send(new PutObjectCommand(uploadParams));
            console.log(`Successfully uploaded ${outputFileName} to S3`);
        } catch (uploadError) {
            console.error(`Failed to upload ${outputFileName} to S3:`, uploadError);
            throw uploadError;
        }
        
        // Generate a public URL for the image (if the bucket is configured for public access)
        const imageUrl = `https://${OUTPUT_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${outputFileName}`;
        
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: true,
                message: 'Image successfully processed and stored in AVIF format',
                url: imageUrl,
                fileName: outputFileName,
                cardId: cardId,
                isSmall: isSmall
            })
        };
    } catch (error) {
        console.error('Error processing image:', error);
        
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                success: false,
                error: error.message || 'Failed to process image'
            })
        };
    }
};

/**
 * Helper function to convert a stream to a buffer
 */
async function streamToBuffer(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
    });
}

/**
 * Helper function to determine image format from filename
 */
function getImageFormat(fileName) {
    const extension = fileName.split('.').pop().toLowerCase();
    const formatMap = {
        'jpg': 'jpeg',
        'jpeg': 'jpeg',
        'png': 'png',
        'webp': 'webp',
        'gif': 'gif'
    };
    
    return formatMap[extension] || 'unknown';
}

/**
 * Process a batch of images serially to avoid timeout issues
 * @param {Array} batch - Array of objects with image data/URL and cardId
 * @returns {Promise<Array>} - Results of each image conversion
 */
async function processBatch(batch) {
    try {
        console.log(`Starting to process batch of ${batch.length} images serially`);
        const results = [];
        
        // Process images one by one to avoid timeout issues
        for (let i = 0; i < batch.length; i++) {
            try {
                const item = batch[i];
                const { image, imageUrl, cardId, isSmall = false, fileName = null } = item;
                
                console.log(`Processing batch item ${i + 1}/${batch.length}: cardId=${cardId}, isSmall=${isSmall}, hasImageUrl=${!!imageUrl}`);
                
                if ((!image && !imageUrl) || !cardId) {
                    console.error(`Missing image data for card ${cardId || 'unknown'}`);
                    results.push({
                        success: false,
                        cardId: cardId || 'unknown',
                        isSmall: isSmall || false,
                        error: 'Missing image data/URL or cardId'
                    });
                    continue; // Skip to next item
                }
                
                // Generate proper filename
                const outputFileName = `${cardId}${isSmall ? '_small' : ''}.avif`;
                
                // Get image buffer - either from base64 or URL
                let imageBuffer;
                if (image) {
                    // Decode base64 image
                    imageBuffer = Buffer.from(image, 'base64');
                } else if (imageUrl) {
                    // Fetch from URL
                    try {
                        console.log(`Fetching image from URL for card ${cardId}: ${imageUrl}`);
                        
                        if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
                            throw new Error(`Invalid image URL: ${imageUrl}`);
                        }
                        
                        const imageResponse = await fetch(imageUrl, {
                            method: 'GET',
                            headers: {
                                'Accept': 'image/*'
                            }
                        });
                        
                        if (!imageResponse.ok) {
                            throw new Error(`Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`);
                        }
                        
                        const contentType = imageResponse.headers.get('content-type');
                        if (!contentType || !contentType.startsWith('image/')) {
                            throw new Error(`URL did not return an image (got ${contentType})`);
                        }
                        
                        const arrayBuffer = await imageResponse.arrayBuffer();
                        if (!arrayBuffer || arrayBuffer.byteLength === 0) {
                            throw new Error('Received empty image data');
                        }
                        
                        imageBuffer = Buffer.from(arrayBuffer);
                        console.log(`Successfully fetched image for card ${cardId} (${imageBuffer.length} bytes)`);
                    } catch (error) {
                        console.error(`Error fetching image from URL for card ${cardId}:`, error);
                        results.push({
                            success: false,
                            cardId,
                            isSmall,
                            error: `Failed to fetch image from URL: ${error.message}`
                        });
                        continue; // Skip to next item
                    }
                } else {
                    results.push({
                        success: false,
                        cardId,
                        isSmall,
                        error: 'No image data or URL provided'
                    });
                    continue; // Skip to next item
                }
                
                try {
                    // Convert to AVIF
                    console.log(`Converting image for card ${cardId} to AVIF format`);
                    const avifBuffer = await sharp(imageBuffer)
                        .avif({
                            quality: 80,
                            effort: 5
                        })
                        .toBuffer();
                    
                    console.log(`Converted image for card ${cardId} to AVIF format (${avifBuffer.length} bytes)`);
                    
                    // Upload to S3
                    const uploadParams = {
                        Bucket: OUTPUT_BUCKET,
                        Key: outputFileName,
                        Body: avifBuffer,
                        ContentType: 'image/avif',
                        Metadata: {
                            originalFormat: fileName ? getImageFormat(fileName) : 'unknown',
                            convertedAt: new Date().toISOString(),
                            cardId: cardId.toString(),
                            isSmall: isSmall.toString()
                        }
                    };
                    
                    console.log(`Attempting to upload to S3: ${OUTPUT_BUCKET}/${outputFileName} (${avifBuffer.length} bytes)`);
                    
                    try {
                        console.log(`Executing S3 upload command for card ${cardId}`);
                        await s3Client.send(new PutObjectCommand(uploadParams));
                        console.log(`Successfully uploaded card ${cardId} to S3`);
                        
                        // Generate a public URL for the image
                        const s3Url = `https://${OUTPUT_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${outputFileName}`;
                        
                        results.push({
                            success: true,
                            cardId,
                            isSmall,
                            url: s3Url,
                            fileName: outputFileName
                        });
                    } catch (uploadError) {
                        console.error(`Failed to upload card ${cardId} to S3:`, uploadError);
                        results.push({
                            success: false,
                            cardId,
                            isSmall,
                            error: `Failed to upload to S3: ${uploadError.message}`
                        });
                    }
                } catch (conversionError) {
                    console.error(`Error converting image for card ${cardId}:`, conversionError);
                    results.push({
                        success: false,
                        cardId,
                        isSmall,
                        error: `Failed to convert image: ${conversionError.message}`
                    });
                }
            } catch (itemError) {
                console.error(`Error processing batch item:`, itemError);
                results.push({
                    success: false,
                    cardId: item?.cardId || 'unknown',
                    isSmall: item?.isSmall || false,
                    error: `Unexpected error: ${itemError.message}`
                });
            }
        }
        
        return results;
    } catch (error) {
        console.error('Error processing batch:', error);
        throw error;
    }
}
