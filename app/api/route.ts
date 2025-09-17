import { NextResponse, NextRequest } from 'next/server';
import packageJson from '@/package.json';
import { withCors, handleCorsPreflight } from '@/lib/cors';

// Reduced to a simple service info route. Heavy logic moved to lib and dedicated endpoints.

export async function OPTIONS(request: NextRequest) {
  return handleCorsPreflight(request) || new NextResponse(null, { status: 200 });
}

export const GET = withCors(async function(_request: NextRequest) {
  type PackageMeta = { name?: string; version?: string };
  const pkg = packageJson as PackageMeta;
  const version = pkg.version ?? '0.0.0';
  const name = pkg.name ?? 'workflow-templates';
  return NextResponse.json({
    success: true,
    service: name,
    version,
    endpoints: [
      { method: 'GET', path: '/api', description: 'Service info' },
      { method: 'GET', path: '/api/workflows', description: 'List workflows' },
      { method: 'GET', path: '/api/workflows/:workflowId', description: 'Get workflow by ID' },
    ],
  });
});