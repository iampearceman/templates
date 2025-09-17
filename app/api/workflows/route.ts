import { NextRequest, NextResponse } from 'next/server';
import { getWorkflowsList } from '@/lib/workflows';
import { withCors, handleCorsPreflight } from '@/lib/cors';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflight(request) || new NextResponse(null, { status: 200 });
}

export const GET = withCors(async function(request: NextRequest) {
  try {
    const requestUrl = new URL(request.url);
    const isForceRefresh = requestUrl.searchParams.get('refresh') === '1';

    const result = await getWorkflowsList(isForceRefresh);

    return NextResponse.json(
      {
        success: true,
        data: {
          data: result.data,
          totalCount: result.totalCount,
          page: result.page,
          pageSize: result.pageSize,
        },
      },
      {
        headers: { 'X-Cache': result.cacheStatus, 'X-Cache-Key': result.cacheKey },
      }
    );
  } catch (error) {
    console.error('Error in GET /api/workflows:', error);
    const status = (error as { status?: number } | undefined)?.status ?? 500;
    const message = (error as Error | undefined)?.message ?? 'Failed to fetch workflows';
    const details = (error as { details?: string } | undefined)?.details ?? undefined;
    return NextResponse.json(
      { success: false, error: message, details },
      { status }
    );
  }
});


