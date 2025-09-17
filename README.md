## REST API Documentation

This service exposes a small REST API for listing and retrieving Novu workflows. It is built with Next.js App Router. All responses are JSON and include a `success` field.

Base URL when running locally: `http://localhost:3000`

### Service Info

- **Method**: GET
- **Path**: `/api`
- **Description**: Returns service metadata and available endpoints.

Response example:

```json
{
  "success": true,
  "service": "workflow-templates",
  "version": "0.1.0",
  "endpoints": [
    { "method": "GET", "path": "/api", "description": "Service info" },
    { "method": "GET", "path": "/api/workflows", "description": "List workflows" },
    { "method": "GET", "path": "/api/workflows/:workflowId", "description": "Get workflow by ID" }
  ]
}
```

### List Workflows

- **Method**: GET
- **Path**: `/api/workflows`
- **Query params**:
  - **refresh** (optional): `1` to bypass cache and refresh.

Response example:

```json
{
  "success": true,
  "data": {
    "data": [
      {
        "id": "abc123",
        "workflowId": "abc123",
        "name": "Welcome Flow",
        "active": true,
        "description": "Sends a welcome sequence",
        "tags": ["onboarding"],
        "createdAt": "2024-01-01T00:00:00.000Z",
        "updatedAt": "2024-02-01T00:00:00.000Z"
      }
    ],
    "totalCount": 1,
    "page": 0,
    "pageSize": 50
  }
}
```

Headers:

- `X-Cache`: `HIT` | `MISS` | `MISS-REFRESH` | `HIT-STALE-INFLIGHT`
- `X-Cache-Key`: Cache key for the list resource

### Get Workflow By ID

- **Method**: GET
- **Path**: `/api/workflows/:workflowId`

Response example:

```json
{
  "success": true,
  "data": {
    "id": "abc123",
    "workflowId": "abc123",
    "name": "Welcome Flow",
    "active": true,
    "description": "Sends a welcome sequence",
    "tags": ["onboarding"],
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-02-01T00:00:00.000Z"
  }
}
```

### Error Responses

Errors follow this shape and use appropriate HTTP status codes:

```json
{
  "success": false,
  "error": "Failed to fetch workflows",
  "details": "Optional details from upstream provider"
}
```

### Authentication

Set the Novu API key in environment variables:

```bash
export NOVU_SECRET_KEY=your_novu_api_key
```

### Running Locally

```bash
pnpm dev
# build:
pnpm build
# production serve:
pnpm start
```

Open `http://localhost:3000/api` to view service info.

### Notes

- Caching: The list and detail endpoints use an in-memory cache with TTL controlled via `WORKFLOWS_CACHE_TTL_SECONDS` (default 300s).
- The UI at `/` consumes the same API (`/api/workflows`).
# CORS Configuration Updated
