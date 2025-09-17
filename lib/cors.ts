import { NextRequest, NextResponse } from 'next/server';

// Define allowed origins - add your domains here
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:4201',
  'http://localhost:8080',
  'https://dashboard.novu-staging.co',
  'https://dashboard.novu.co',
  'https://eu.dashboard.novu.co',
  // Add more domains as needed
];

// Define allowed methods
const ALLOWED_METHODS = ['GET', 'OPTIONS'];

// Define allowed headers
const ALLOWED_HEADERS = [
  'Content-Type',
  'Authorization',
  'X-Requested-With',
  'Accept',
  'Origin',
  'Access-Control-Request-Method',
  'Access-Control-Request-Headers',
];

// CORS configuration
export const corsConfig = {
  origin: ALLOWED_ORIGINS,
  methods: ALLOWED_METHODS,
  allowedHeaders: ALLOWED_HEADERS,
  credentials: true, // Allow cookies and authorization headers
  maxAge: 86400, // Cache preflight response for 24 hours
};

/**
 * Validates if the request origin is allowed
 */
export function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return false;
  return ALLOWED_ORIGINS.includes(origin);
}

/**
 * Gets the appropriate CORS headers for a response
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Methods': ALLOWED_METHODS.join(', '),
    'Access-Control-Allow-Headers': ALLOWED_HEADERS.join(', '),
    'Access-Control-Max-Age': corsConfig.maxAge.toString(),
  };

  if (origin && isOriginAllowed(origin)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
  } else {
    // For requests without origin or from disallowed origins, don't set Access-Control-Allow-Origin
    // This prevents the browser from using the response
  }

  return headers;
}

/**
 * Handles CORS preflight requests (OPTIONS)
 */
export function handleCorsPreflight(request: NextRequest): NextResponse | null {
  const origin = request.headers.get('origin');
  
  if (!isOriginAllowed(origin)) {
    return new NextResponse(null, { status: 403 });
  }

  const headers = getCorsHeaders(origin);
  return new NextResponse(null, { 
    status: 200, 
    headers 
  });
}

/**
 * Adds CORS headers to a response
 */
export function addCorsHeaders(response: NextResponse, origin: string | null): NextResponse {
  const corsHeaders = getCorsHeaders(origin);
  
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}

/**
 * Middleware function to handle CORS for API routes
 */
export function withCors(handler: (request: NextRequest, ...args: unknown[]) => Promise<NextResponse>) {
  return async (request: NextRequest, ...args: unknown[]): Promise<NextResponse> => {
    const origin = request.headers.get('origin');
    
    // Handle preflight requests
    if (request.method === 'OPTIONS') {
      const preflightResponse = handleCorsPreflight(request);
      if (preflightResponse) {
        return preflightResponse;
      }
    }

    // Check if origin is allowed for actual requests
    if (origin && !isOriginAllowed(origin)) {
      return new NextResponse(
        JSON.stringify({ 
          success: false, 
          error: 'CORS policy violation: Origin not allowed' 
        }),
        { 
          status: 403,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    // Execute the original handler
    const response = await handler(request, ...args);
    
    // Add CORS headers to the response
    return addCorsHeaders(response, origin);
  };
}
