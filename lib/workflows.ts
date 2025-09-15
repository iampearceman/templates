type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  inFlight?: Promise<T>;
};

export interface NormalizedWorkflow {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  description?: string;
  tags?: string[];
  workflowId?: string;
  [key: string]: unknown;
}

export class HttpError extends Error {
  status: number;
  details?: string;
  constructor(status: number, message: string, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const WORKFLOWS_CACHE_TTL_MS = parseInt(process.env.WORKFLOWS_CACHE_TTL_SECONDS || '300', 10) * 1000;
const FULL_WORKFLOWS_CACHE_KEY = 'full-workflows:page=0:pageSize=50';

const workflowsListCache: Map<string, CacheEntry<WorkflowsListPayload>> = new Map();
const workflowDetailCache: Map<string, CacheEntry<unknown>> = new Map();

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonArray = JsonValue[];
interface JsonObject { [key: string]: JsonValue }

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(obj: JsonObject, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(obj: JsonObject, key: string): boolean | undefined {
  const value = obj[key];
  return typeof value === 'boolean' ? value : undefined;
}

function readObject(obj: JsonObject, key: string): JsonObject | undefined {
  const value = obj[key];
  return isJsonObject(value) ? value : undefined;
}

function readNumber(obj: JsonObject, key: string): number | undefined {
  const value = obj[key];
  return typeof value === 'number' ? value : undefined;
}

function extractWorkflowsFromListResponse(listResponseJson: unknown): unknown[] {
  if (Array.isArray(listResponseJson)) return listResponseJson as unknown[];
  if (isJsonObject(listResponseJson)) {
    if (Array.isArray(listResponseJson['workflows'])) return listResponseJson['workflows'] as unknown[];
    const data = listResponseJson['data'];
    if (Array.isArray(data)) return data as unknown[];
    if (isJsonObject(data) && Array.isArray(data['workflows'])) return data['workflows'] as unknown[];
  }
  return [];
}

export function normalizeWorkflow(workflow: unknown): NormalizedWorkflow {
  const w: JsonObject = isJsonObject(workflow) ? workflow : {};

  const id = readString(w, 'id') ?? readString(w, '_id') ?? readString(w, 'workflowId') ?? '';
  const name = (readString(w, 'name') ?? readString(w, 'workflowName') ?? id) || 'unknown';
  const createdAt =
    readString(w, 'createdAt') ??
    readString(w, 'created_at') ??
    readString(w, 'created') ??
    '';
  const updatedAt =
    readString(w, 'updatedAt') ??
    readString(w, 'updated_at') ??
    readString(w, 'updated') ??
    '';
  const status = readString(w, 'status');
  const isActive = readBoolean(w, 'active') ?? (status ? status.toUpperCase() === 'ACTIVE' : false);
  const description =
    readString(w, 'description') ??
    (readObject(w, 'metadata') ? readString(readObject(w, 'metadata') as JsonObject, 'description') : undefined) ??
    (readObject(w, 'workflow') ? readString(readObject(w, 'workflow') as JsonObject, 'description') : undefined) ??
    undefined;

  let tags: string[] | undefined;
  const metadata = readObject(w, 'metadata');
  const rawTags = (w['tags'] as unknown) ?? (metadata ? (metadata['tags'] as unknown) : undefined);
  if (Array.isArray(rawTags)) {
    const arr: unknown[] = rawTags as unknown[];
    if (arr.every((tag) => typeof tag === 'string')) {
      tags = arr as string[];
    } else if (arr.every((tag) => isJsonObject(tag) && typeof (tag as JsonObject)['name'] === 'string')) {
      tags = (arr as JsonObject[]).map((tag) => String(tag['name']));
    } else {
      tags = arr.map((tag) => String(tag));
    }
  } else if (typeof rawTags === 'string') {
    tags = [rawTags];
  }

  const result: NormalizedWorkflow = {
    ...(w as Record<string, unknown>),
    id,
    name,
    active: Boolean(isActive),
    createdAt,
    updatedAt,
    description,
    tags,
    workflowId: readString(w, 'workflowId'),
  };
  return result;
}

export type WorkflowsListPayload = {
  success: true;
  data: {
    data: NormalizedWorkflow[];
    totalCount: number;
    page: number;
    pageSize: number;
  };
};

export type WorkflowsListResult = {
  data: NormalizedWorkflow[];
  totalCount: number;
  page: number;
  pageSize: number;
  cacheStatus: string;
  cacheKey: string;
};

export async function getWorkflowsList(isForceRefresh: boolean): Promise<WorkflowsListResult> {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new HttpError(500, 'NOVU_SECRET_KEY environment variable is not set');
  }

  const cachedListEntry = workflowsListCache.get(FULL_WORKFLOWS_CACHE_KEY);
  const nowMillis = Date.now();
  if (!isForceRefresh && cachedListEntry && cachedListEntry.value && cachedListEntry.expiresAt > nowMillis) {
    return {
      data: cachedListEntry.value.data.data,
      totalCount: cachedListEntry.value.data.totalCount,
      page: cachedListEntry.value.data.page,
      pageSize: cachedListEntry.value.data.pageSize,
      cacheStatus: 'HIT',
      cacheKey: FULL_WORKFLOWS_CACHE_KEY,
    };
  }

  if (cachedListEntry && cachedListEntry.inFlight && !isForceRefresh) {
    const cachedValue = await cachedListEntry.inFlight;
    return {
      data: cachedValue.data.data,
      totalCount: cachedValue.data.totalCount,
      page: cachedValue.data.page,
      pageSize: cachedValue.data.pageSize,
      cacheStatus: 'HIT-STALE-INFLIGHT',
      cacheKey: FULL_WORKFLOWS_CACHE_KEY,
    };
  }

  const refreshPromise: Promise<WorkflowsListPayload> = (async () => {
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
      throw new HttpError(listResponse.status, 'API request failed', errorText);
    }

    const listResponseJson = await listResponse.json();
    const rawWorkflowsFromList = extractWorkflowsFromListResponse(listResponseJson);

    const workflowIdsToFetch: string[] = rawWorkflowsFromList
      .map((wf) => {
        if (!isJsonObject(wf)) return undefined;
        return readString(wf, 'workflowId') ?? readString(wf, 'id') ?? readString(wf, '_id');
      })
      .filter((v): v is string => typeof v === 'string' && v.length > 0);

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
          throw new HttpError(detailResponse.status, `Detail ${workflowId} failed`, errText);
        }
        const detailJson = await detailResponse.json();
        const detail = (detailJson as { data?: unknown }).data ?? detailJson;
        workflowDetailCache.set(cacheKey, { value: detail, expiresAt: Date.now() + WORKFLOWS_CACHE_TTL_MS });
        return detail;
      })();
      workflowDetailCache.set(cacheKey, { expiresAt: 0, inFlight });
      return inFlight;
    };

    const workflowDetailsResults = await Promise.allSettled<unknown>(
      workflowIdsToFetch.map((workflowId) => getWorkflowDetailWithCache(workflowId))
    );

    const normalizedWorkflows: NormalizedWorkflow[] = workflowDetailsResults
      .filter((result): result is PromiseFulfilledResult<unknown> => result.status === 'fulfilled')
      .map((result) => normalizeWorkflow(result.value));

    let totalCount: number = normalizedWorkflows.length;
    let page: number = 0;
    let pageSize: number = 50;
    if (isJsonObject(listResponseJson)) {
      totalCount =
        readNumber(listResponseJson, 'totalCount') ??
        (readObject(listResponseJson, 'data') ? readNumber(readObject(listResponseJson, 'data') as JsonObject, 'totalCount') : undefined) ??
        normalizedWorkflows.length;
      page =
        readNumber(listResponseJson, 'page') ??
        (readObject(listResponseJson, 'data') ? readNumber(readObject(listResponseJson, 'data') as JsonObject, 'page') : undefined) ??
        0;
      pageSize =
        readNumber(listResponseJson, 'pageSize') ??
        (readObject(listResponseJson, 'data') ? readNumber(readObject(listResponseJson, 'data') as JsonObject, 'pageSize') : undefined) ??
        50;
    }

    const payload: WorkflowsListPayload = {
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

  return {
    data: freshPayload.data.data,
    totalCount: freshPayload.data.totalCount,
    page: freshPayload.data.page,
    pageSize: freshPayload.data.pageSize,
    cacheStatus: cachedListEntry && cachedListEntry.value ? 'MISS-REFRESH' : 'MISS',
    cacheKey: FULL_WORKFLOWS_CACHE_KEY,
  };
}

export async function getWorkflowById(workflowId: string): Promise<NormalizedWorkflow> {
  if (!process.env.NOVU_SECRET_KEY) {
    throw new HttpError(500, 'NOVU_SECRET_KEY environment variable is not set');
  }
  if (!workflowId) {
    throw new HttpError(400, 'Missing workflowId');
  }

  const cacheKey = `workflow:${workflowId}`;
  const cachedDetailEntry = workflowDetailCache.get(cacheKey);
  const now = Date.now();
  if (cachedDetailEntry && cachedDetailEntry.value && cachedDetailEntry.expiresAt > now) {
    return normalizeWorkflow(cachedDetailEntry.value);
  }
  if (cachedDetailEntry && cachedDetailEntry.inFlight) {
    const value = await cachedDetailEntry.inFlight;
    return normalizeWorkflow(value);
  }

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
      throw new HttpError(detailResponse.status, 'Failed to fetch workflow', errText);
    }
    const detailJson = await detailResponse.json();
    const detail = (detailJson as { data?: unknown }).data ?? detailJson;
    workflowDetailCache.set(cacheKey, { value: detail, expiresAt: Date.now() + WORKFLOWS_CACHE_TTL_MS });
    return detail;
  })();
  workflowDetailCache.set(cacheKey, { expiresAt: 0, inFlight });
  const value = await inFlight;
  return normalizeWorkflow(value);
}


