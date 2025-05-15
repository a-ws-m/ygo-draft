#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const sharp = require('sharp');
const axios = require('axios');
const cliProgress = require('cli-progress');

// Configuration
const CONFIG = {
  // S3 Configuration
  region: process.env.AWS_REGION || 'us-east-1',
  bucket: process.env.S3_BUCKET || 'ygo-card-images-avif',
  
  // Local paths
  tempDir: path.join(__dirname, 'temp_images'),
  
  // YGOProdeck API URL
  apiUrl: 'https://db.ygoprodeck.com/api/v7/cardinfo.php',
  
  // Image processing settings
  avifQuality: 80,
  avifEffort: 5,
  
  // Batch processing settings
  batchSize: 50,
  maxConcurrent: 10, // Maximum concurrent image processing tasks
  
  // Download timeout in milliseconds (5 seconds)
  downloadTimeout: 5000,
};

// Initialize S3 client
const s3Client = new S3Client({ region: CONFIG.region });

// Ensure temp directory exists
if (!fs.existsSync(CONFIG.tempDir)) {
  fs.mkdirSync(CONFIG.tempDir, { recursive: true });
}

/**
 * Fetches all card data from YGOProdeck API
 */
async function fetchCardData() {
  try {
    console.log('Fetching card data from YGOProdeck API...');
    const response = await axios.get(CONFIG.apiUrl);
    
    if (!response.data || !response.data.data || !Array.isArray(response.data.data)) {
      throw new Error('Invalid response format from YGOProdeck API');
    }
    
    console.log(`Fetched data for ${response.data.data.length} cards`);
    return response.data.data;
  } catch (error) {
    console.error('Error fetching card data:', error.message);
    throw error;
  }
}

/**
 * Downloads an image from a URL to a local file
 */
async function downloadImage(url, filepath) {
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'arraybuffer',
      timeout: CONFIG.downloadTimeout,
    });
    
    fs.writeFileSync(filepath, response.data);
    return filepath;
  } catch (error) {
    console.error(`Error downloading image from ${url}:`, error.message);
    throw error;
  }
}

/**
 * Converts an image to AVIF format using sharp
 */
async function convertToAvif(inputPath) {
  try {
    const avifBuffer = await sharp(inputPath)
      .avif({
        quality: CONFIG.avifQuality,
        effort: CONFIG.avifEffort
      })
      .toBuffer();
    
    return avifBuffer;
  } catch (error) {
    console.error(`Error converting image to AVIF:`, error.message);
    throw error;
  }
}

/**
 * Uploads an image buffer to S3
 */
async function uploadToS3(imageBuffer, key, metadata = {}) {
  try {
    const uploadParams = {
      Bucket: CONFIG.bucket,
      Key: key,
      Body: imageBuffer,
      ContentType: 'image/avif',
      Metadata: {
        ...metadata,
        convertedAt: new Date().toISOString(),
      }
    };
    
    await s3Client.send(new PutObjectCommand(uploadParams));
    return `https://${CONFIG.bucket}.s3.${CONFIG.region}.amazonaws.com/${key}`;
  } catch (error) {
    console.error(`Error uploading to S3:`, error.message);
    throw error;
  }
}

/**
 * Check if an image already exists in S3
 */
async function checkImageExistsInS3(cardId, isSmall = false) {
  try {
    const key = `${cardId}${isSmall ? '_small' : ''}.avif`;
    const url = `https://${CONFIG.bucket}.s3.${CONFIG.region}.amazonaws.com/${key}`;
    
    // Simple HEAD request to check if the file exists
    const response = await axios.head(url, { validateStatus: null });
    return response.status === 200;
  } catch {
    // If we get any error, assume the image doesn't exist
    return false;
  }
}

/**
 * Process a single card image
 */
async function processCardImage(card, imageUrl, isSmall = false) {
  const cardId = card.id.toString();
  const key = `${cardId}${isSmall ? '_small' : ''}.avif`;
  const localPath = path.join(CONFIG.tempDir, `${cardId}${isSmall ? '_small' : ''}.jpg`);
  
  try {
    // Check if image already exists in S3
    const exists = await checkImageExistsInS3(cardId, isSmall);
    if (exists) {
      console.log(`Image for card ${cardId}${isSmall ? ' (small)' : ''} already exists in S3, skipping...`);
      return {
        cardId,
        isSmall,
        success: true,
        skipped: true,
        url: `https://${CONFIG.bucket}.s3.${CONFIG.region}.amazonaws.com/${key}`
      };
    }
    
    // Download the image
    await downloadImage(imageUrl, localPath);
    
    // Convert to AVIF
    const avifBuffer = await convertToAvif(localPath);
    
    // Upload to S3
    const url = await uploadToS3(avifBuffer, key, {
      cardId,
      isSmall: isSmall.toString(),
      originalFormat: 'jpeg'
    });
    
    // Clean up local file
    fs.unlinkSync(localPath);
    
    console.log(`Successfully processed ${cardId}${isSmall ? ' (small)' : ''}`);
    
    return {
      cardId,
      isSmall,
      success: true,
      url
    };
  } catch (error) {
    console.error(`Failed to process image for card ${cardId}${isSmall ? ' (small)' : ''}:`, error.message);
    
    // Clean up local file if it exists
    if (fs.existsSync(localPath)) {
      fs.unlinkSync(localPath);
    }
    
    return {
      cardId,
      isSmall,
      success: false,
      error: error.message
    };
  }
}

/**
 * Process a batch of cards
 */
async function processBatch(cards) {
  const imageProcessingTasks = [];
  
  for (const card of cards) {
    if (!card.card_images || card.card_images.length === 0) {
      console.log(`Card ${card.id} has no images, skipping...`);
      continue;
    }
    
    const cardImages = card.card_images[0];
    
    // Queue up normal image processing task
    if (cardImages.image_url) {
      imageProcessingTasks.push(processCardImage(card, cardImages.image_url, false));
    }
    
    // Queue up small image processing task
    if (cardImages.image_url_small) {
      imageProcessingTasks.push(processCardImage(card, cardImages.image_url_small, true));
    }
  }
  
  // Process all image tasks in parallel and wait for all to complete
  const results = await Promise.all(imageProcessingTasks);
  return results;
}

/**
 * Main function to process all card images
 */
async function processAllCardImages() {
  try {
    // Fetch all card data
    const cards = await fetchCardData();
    
    // Create progress bars
    const multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: '{bar} {percentage}% | {value}/{total} | {task} | {status}'
    }, cliProgress.Presets.shades_classic);
    
    // Main progress bar for overall progress
    const mainProgressBar = multibar.create(cards.length, 0, { 
      task: 'Processing Cards', 
      status: 'Starting...' 
    });
    
    // Stats progress bars
    const processedBar = multibar.create(cards.length * 2, 0, { 
      task: 'Processed', 
      status: '0' 
    });
    const skippedBar = multibar.create(cards.length * 2, 0, { 
      task: 'Skipped', 
      status: '0' 
    });
    const failedBar = multibar.create(cards.length * 2, 0, { 
      task: 'Failed', 
      status: '0' 
    });
    
    // Process in batches
    const results = [];
    let processed = 0;
    let skipped = 0;
    let failed = 0;
    let processedCards = 0;
    
    for (let i = 0; i < cards.length; i += CONFIG.batchSize) {
      const batch = cards.slice(i, i + CONFIG.batchSize);
      mainProgressBar.update(processedCards, { status: `Batch ${Math.floor(i / CONFIG.batchSize) + 1}/${Math.ceil(cards.length / CONFIG.batchSize)}` });
      
      const batchResults = await processBatch(batch);
      
      for (const result of batchResults) {
        if (result.success) {
          if (result.skipped) {
            skipped++;
            skippedBar.update(skipped, { status: `${skipped}` });
          } else {
            processed++;
            processedBar.update(processed, { status: `${processed}` });
          }
        } else {
          failed++;
          failedBar.update(failed, { status: `${failed}` });
        }
        
        results.push(result);
      }
      
      // Update the main progress bar
      processedCards += batch.length;
      mainProgressBar.update(processedCards);
    }
    
    // Complete all progress bars
    mainProgressBar.update(cards.length, { status: 'Completed' });
    processedBar.update(processed, { status: `${processed}` });
    skippedBar.update(skipped, { status: `${skipped}` });
    failedBar.update(failed, { status: `${failed}` });
    
    // Stop the progress bars
    multibar.stop();
    
    console.log('\n=== Processing Complete ===');
    console.log(`Total Cards: ${cards.length}`);
    console.log(`Images Processed: ${processed}`);
    console.log(`Images Skipped: ${skipped}`);
    console.log(`Images Failed: ${failed}`);
    
    // Cleanup temp directory
    fs.rmdirSync(CONFIG.tempDir, { recursive: true });
    
    return {
      cards: cards.length,
      processed,
      skipped,
      failed,
      results
    };
  } catch (error) {
    console.error('Error processing card images:', error);
    throw error;
  }
}

// Run the script
(async () => {
  try {
    console.log('YuGiOh Card Image Processor Starting...');
    console.log(`Configuration:
- S3 Region: ${CONFIG.region}
- S3 Bucket: ${CONFIG.bucket}
- Batch Size: ${CONFIG.batchSize}
- Max Concurrent Processing: ${CONFIG.maxConcurrent}
- AVIF Quality: ${CONFIG.avifQuality}
- AVIF Effort: ${CONFIG.avifEffort}
`);
    
    await processAllCardImages();
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
})();
