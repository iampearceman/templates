import { NextResponse } from 'next/server';

interface RouteContext {
  params: { workflowId: string };
}

export async function GET(
  _request: Request,
  context: RouteContext
) {
  try {
    if (!process.env.NOVU_SECRET_KEY) {
      throw new Error('NOVU_SECRET_KEY environment variable is not set');
    }

    const workflowId = context.params?.workflowId;
    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'Missing workflowId in path' },
        { status: 400 }
      );
    }

    const url = new URL(`https://api.novu.co/v2/workflows/${encodeURIComponent(workflowId)}`);

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `ApiKey ${process.env.NOVU_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to fetch workflow',
          details: `Status ${response.status}: ${errorText}`,
        },
        { status: response.status }
      );
    }

    const result = await response.json();

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error fetching workflow details:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch workflow',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}


