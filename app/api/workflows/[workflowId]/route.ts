import { NextResponse, NextRequest } from 'next/server';
import { getWorkflowById } from '@/lib/workflows';
import { withCors, handleCorsPreflight } from '@/lib/cors';

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflight(request) || new NextResponse(null, { status: 200 });
}

export const GET = withCors(async function(
  _request: NextRequest,
  { params }: { params: Promise<{ workflowId: string }> }
) {
  try {
    const { workflowId } = await params;
    if (!workflowId) {
      return NextResponse.json(
        { success: false, error: 'Missing workflowId in path' },
        { status: 400 }
      );
    }

    const workflow = await getWorkflowById(workflowId);
    return NextResponse.json({ success: true, data: workflow });
  } catch (error) {
    console.error('Error fetching workflow details:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error | undefined)?.message ?? 'Failed to fetch workflow',
        details: (error as { details?: string } | undefined)?.details ?? (error instanceof Error ? undefined : 'Unknown error'),
      },
      { status: (error as { status?: number } | undefined)?.status ?? 500 }
    );
  }
});


