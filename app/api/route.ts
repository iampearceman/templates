import { NextResponse } from 'next/server';

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
};

interface NormalizedWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
  [key: string]: any;
}

const WORKFLOWS_CACHE_TTL_MS = parseInt(process.env.WORKFLOWS_CACHE_TTL_SECONDS || '300', 10) * 1000;
const FULL_WORKFLOWS_CACHE_KEY = 'full-workflows:page=0:pageSize=50';

const workflowsListCache: Map<string, CacheEntry<any>> = new Map();
const workflowDetailCache: Map<string, CacheEntry<any>> = new Map();

function extractWorkflowsFromListResponse(listResponseJson: any): any[] {
  if (Array.isArray(listResponseJson?.data?.workflows)) return listResponseJson.data.workflows;
  if (Array.isArray(listResponseJson?.workflows)) return listResponseJson.workflows;
  if (Array.isArray(listResponseJson?.data)) return listResponseJson.data;
  if (Array.isArray(listResponseJson)) return listResponseJson;
  return [];
}

function normalizeWorkflow(workflow: any): NormalizedWorkflow {
  const id = workflow?.id ?? workflow?._id ?? workflow?.workflowId;
  const createdAt = workflow?.createdAt ?? workflow?.created_at ?? workflow?.created;
  const updatedAt = workflow?.updatedAt ?? workflow?.updated_at ?? workflow?.updated;
  const isActive = workflow?.active ?? (typeof workflow?.status === 'string' ? workflow.status.toUpperCase() === 'ACTIVE' : false);
  const description = workflow?.description ?? workflow?.metadata?.description ?? workflow?.workflow?.description ?? undefined;

  let tags: string[] | undefined;
  const rawTags = workflow?.tags ?? workflow?.metadata?.tags ?? undefined;
  if (Array.isArray(rawTags)) {
    if (rawTags.every((tag) => typeof tag === 'string')) {
      tags = rawTags as string[];
    } else if (rawTags.every((tag) => tag && typeof tag === 'object' && typeof tag.name === 'string')) {
      tags = (rawTags as Array<{ name: string }>).map((tag) => tag.name);
    } else {
      tags = rawTags.map((tag) => String(tag));
    }
  } else if (typeof rawTags === 'string') {
    tags = [rawTags];
  }

  return {
    ...workflow,
    id,
    active: isActive,
    createdAt,
    updatedAt,
    description,
    tags,
  };
}

export async function GET(request: Request) {
  try {
    if (!process.env.NOVU_SECRET_KEY) {
      throw new Error('NOVU_SECRET_KEY environment variable is not set');
    }
    const requestUrl = new URL(request.url);
    const isForceRefresh = requestUrl.searchParams.get('refresh') === '1';

    const cachedListEntry = workflowsListCache.get(FULL_WORKFLOWS_CACHE_KEY);
    const nowMillis = Date.now();
    if (!isForceRefresh && cachedListEntry && cachedListEntry.value && cachedListEntry.expiresAt > nowMillis) {
      return NextResponse.json(cachedListEntry.value, {
        headers: { 'X-Cache': 'HIT', 'X-Cache-Key': FULL_WORKFLOWS_CACHE_KEY },
      });
    }

    if (cachedListEntry && cachedListEntry.inFlight && !isForceRefresh) {
      const cachedValue = await cachedListEntry.inFlight;
      return NextResponse.json(cachedValue, {
        headers: { 'X-Cache': 'HIT-STALE-INFLIGHT', 'X-Cache-Key': FULL_WORKFLOWS_CACHE_KEY },
      });
    }

    const refreshPromise = (async () => {
      const workflowsListUrl = new URL('https://api.novu.co/v2/workflows');
      workflowsListUrl.searchParams.set('page', '0');
      workflowsListUrl.searchParams.set('pageSize', '50');

      const listResponse = await fetch(workflowsListUrl, {
        method: 'GET',
        headers: {
          'Authorization': `ApiKey ${process.env.NOVU_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
      });

      if (!listResponse.ok) {
        const errorText = await listResponse.text();
        throw new Error(`API request failed with status ${listResponse.status}: ${errorText}`);
      }

      const listResponseJson = await listResponse.json();
      const rawWorkflowsFromList = extractWorkflowsFromListResponse(listResponseJson);

      const workflowIdsToFetch: string[] = rawWorkflowsFromList
        .map((workflow: any) => workflow?.workflowId ?? workflow?.id ?? workflow?._id)
        .filter(Boolean);

      const getWorkflowDetailWithCache = async (workflowId: string) => {
        const cacheKey = `workflow:${workflowId}`;
        const cachedDetailEntry = workflowDetailCache.get(cacheKey);
        const now = Date.now();
        if (cachedDetailEntry && cachedDetailEntry.value && cachedDetailEntry.expiresAt > now) return cachedDetailEntry.value;
        if (cachedDetailEntry && cachedDetailEntry.inFlight) return cachedDetailEntry.inFlight;
        const inFlight = (async () => {
          const detailUrl = new URL(`https://api.novu.co/v2/workflows/${encodeURIComponent(workflowId)}`);
          const detailResponse = await fetch(detailUrl, {
            method: 'GET',
            headers: {
              'Authorization': `ApiKey ${process.env.NOVU_SECRET_KEY}`,
              'Content-Type': 'application/json',
            },
            cache: 'no-store',
          });
          if (!detailResponse.ok) {
            const errText = await detailResponse.text();
            throw new Error(`Detail ${workflowId} failed: ${detailResponse.status} ${errText}`);
          }
          const detailJson = await detailResponse.json();
          const detail = detailJson?.data ?? detailJson;
          workflowDetailCache.set(cacheKey, { value: detail, expiresAt: Date.now() + WORKFLOWS_CACHE_TTL_MS });
          return detail;
        })();
        workflowDetailCache.set(cacheKey, { expiresAt: 0, inFlight });
        return inFlight;
      };

      const workflowDetailsResults = await Promise.allSettled(
        workflowIdsToFetch.map((workflowId) => getWorkflowDetailWithCache(workflowId))
      );

      const normalizedWorkflows: NormalizedWorkflow[] = workflowDetailsResults
        .filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled')
        .map((result) => normalizeWorkflow(result.value));

      const totalCount =
        listResponseJson?.data?.totalCount ??
        listResponseJson?.totalCount ??
        normalizedWorkflows.length;
      const page = listResponseJson?.page ?? listResponseJson?.data?.page ?? 0;
      const pageSize = listResponseJson?.pageSize ?? listResponseJson?.data?.pageSize ?? 50;

      const payload = {
        success: true,
        data: { data: normalizedWorkflows, totalCount, page, pageSize },
      };

      workflowsListCache.set(FULL_WORKFLOWS_CACHE_KEY, {
        value: payload,
        expiresAt: Date.now() + WORKFLOWS_CACHE_TTL_MS,
      });

      return payload;
    })();

    workflowsListCache.set(FULL_WORKFLOWS_CACHE_KEY, { expiresAt: 0, inFlight: refreshPromise });
    const freshPayload = await refreshPromise;

    return NextResponse.json(freshPayload, {
      headers: {
        'X-Cache': cachedListEntry && cachedListEntry.value ? 'MISS-REFRESH' : 'MISS',
        'X-Cache-Key': FULL_WORKFLOWS_CACHE_KEY,
      },
    });
  } catch (error) {
    console.error('Error fetching workflows:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch workflows',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}