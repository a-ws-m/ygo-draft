// CORS headers for Supabase Edge Functions

// Standard CORS headers to be used in all responses
export const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Content-Type': 'application/json'
};

// Handle OPTIONS requests for CORS preflight
export function handleCorsPreflightRequest(): Response | null {
    return new Response(null, {
        status: 204,
        headers: corsHeaders,
    });
}

// Create a response with proper CORS headers
export function createCorsResponse(body: any, status: number = 200): Response {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: corsHeaders
        }
    );
}

// Create an error response with CORS headers
export function createErrorResponse(message: string, status: number = 500): Response {
    return new Response(
        JSON.stringify({ error: message }),
        {
            status,
            headers: corsHeaders
        }
    );
}
