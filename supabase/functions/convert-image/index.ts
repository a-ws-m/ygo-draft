// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { initializeImageMagick, ImageMagick, MagickFormat } from "https://deno.land/x/imagemagick_deno/mod.ts";

await initialize();
console.log("Image Conversion Function Initialized")

async function initialize() {
  const wasmUrl = new URL(
    "https://cdn.jsdelivr.net/npm/@imagemagick/magick-wasm@0.0.31/dist/magick.wasm",
  );

  const response = await fetch(wasmUrl);
  await initializeImageMagick(new Int8Array(await response.arrayBuffer()));
  return;
}

// Function to convert image to WebP format
async function convertToWebP(imageBlob: Blob): Promise<Blob | null> {
  try {
    // Convert the input Blob to ArrayBuffer - do this only once
    const buffer = await imageBlob.arrayBuffer();
    let outputBuffer: Uint8Array | null = null;

    // Use ImageMagick to convert the image with optimized settings
    ImageMagick.read(new Uint8Array(buffer), (image) => {
      // Lower quality for faster processing and smaller file size
      image.quality = 85;

      // Write the image as WebP with minimal processing
      image.write(MagickFormat.WebP, (data) => {
        // Create a copy of the data to prevent working with detached ArrayBuffer
        outputBuffer = data;
      });
    });

    if (!outputBuffer) {
      throw new Error("Failed to convert image");
    }

    // Create a new Blob from the WebP data
    return new Blob([outputBuffer], { type: "image/webp" });
  } catch (error) {
    console.error("Error converting image to WebP:", error);
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    // Early rejection of non-image requests to save processing
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("image/") && !contentType.includes("multipart/form-data")) {
      return new Response(
        JSON.stringify({ error: "Invalid content type, expected image or form data" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Check if the request contains a file
    if (contentType.includes("multipart/form-data")) {
      // Handle form data with file upload
      const formData = await req.formData();
      const imageFile = formData.get("image") as File | null;

      if (!imageFile) {
        return new Response(
          JSON.stringify({ error: "No image file provided" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
      }

      // Convert the image to WebP
      const imageBlob = new Blob([await imageFile.arrayBuffer()], { type: imageFile.type });
      const webpBlob = await convertToWebP(imageBlob);

      if (!webpBlob) {
        return new Response(
          JSON.stringify({ error: "Failed to convert image" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Return the WebP image
      return new Response(webpBlob, {
        headers: { "Content-Type": "image/webp" }
      });
    } else {
      // Handle direct binary data
      const imageBlob = await req.blob();
      const webpBlob = await convertToWebP(imageBlob);

      if (!webpBlob) {
        return new Response(
          JSON.stringify({ error: "Failed to convert image" }),
          { status: 500, headers: { "Content-Type": "application/json" } }
        );
      }

      // Return the WebP image
      return new Response(webpBlob, {
        headers: { "Content-Type": "image/webp" }
      });
    }
  } catch (error) {
    console.error("Error in convert-image function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "An unexpected error occurred" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
})

/* To invoke locally:

  1. Run `supabase start` (see: https://supabase.com/docs/reference/cli/supabase-start)
  2. Make an HTTP request with an image file:

  curl -i --location --request POST 'http://127.0.0.1:54321/functions/v1/convert-image' \
    --header 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0' \
    --form 'image=@"/path/to/your/image.jpg"'

*/
