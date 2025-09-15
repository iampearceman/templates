'use client';

import { useState, useEffect, useMemo } from 'react';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  workflowId?: string;
  tags?: string[];
  [key: string]: unknown;
}

interface ApiResponse {
  success: boolean;
  data?: {
    data: Workflow[];
    totalCount: number;
    page: number;
    pageSize: number;
  };
  error?: string;
  details?: string;
}

export default function Home() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  async function fetchWorkflows(useRefresh: boolean) {
    try {
      setIsLoading(true);
      setErrorMessage(null);

      const endpoint = useRefresh ? '/api/workflows?refresh=1' : '/api/workflows';
      const response = await fetch(endpoint);
      const result: ApiResponse = await response.json();

      if (result.success && result.data) {
        setWorkflows(result.data.data);
        setTotalCount(result.data.totalCount);
      } else {
        setErrorMessage(result.error || 'Failed to fetch workflows');
      }
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    fetchWorkflows(false);
  }, []);

  const handleRefresh = () => {
    fetchWorkflows(true);
  };

  const workflowsByTag = useMemo(() => {
    const groups: Record<string, Workflow[]> = {};
    for (const wf of workflows) {
      const tags: string[] = Array.isArray(wf.tags) ? wf.tags : ['untagged'];
      if (tags.length === 0) {
        const key = 'untagged';
        groups[key] = groups[key] || [];
        groups[key].push(wf);
      } else {
        for (const tag of tags) {
          const key = tag || 'untagged';
          groups[key] = groups[key] || [];
          groups[key].push(wf);
        }
      }
    }
    return groups;
  }, [workflows]);

  const sortedTagKeys = useMemo(() => Object.keys(workflowsByTag).sort(), [workflowsByTag]);

  return (
    <div className="font-sans min-h-screen p-8 pb-20 gap-16 sm:p-20">
      <main className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-4">Novu Workflows</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Total workflows: {totalCount}
          </p>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>

        {isLoading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            <span className="ml-2">Loading workflows...</span>
          </div>
        )}

        {errorMessage && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-6">
            <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Error</h3>
            <p className="text-red-700 dark:text-red-300">{errorMessage}</p>
          </div>
        )}

        {!isLoading && !errorMessage && workflows.length === 0 && (
          <div className="text-center py-8">
            <p className="text-gray-500 dark:text-gray-400">No workflows found.</p>
          </div>
        )}

        {!isLoading && !errorMessage && workflows.length > 0 && (
          <div className="space-y-10">
            {sortedTagKeys.map((tagKey) => (
              <section key={tagKey}>
                <h2 className="text-xl font-semibold mb-4 capitalize">{tagKey}</h2>
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {workflowsByTag[tagKey].map((workflow) => {
                    const workflowId = workflow.workflowId || workflow.id;

                    return (
                      <div
                        key={workflow.id}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between mb-4">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {workflow.name}
                          </h3>
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              workflow.active
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                            }`}
                          >
                            {workflow.active ? 'Active' : 'Inactive'}
                          </span>
                        </div>
                        
                        {workflow.description && (
                          <p className="text-gray-600 dark:text-gray-400 mb-4 text-sm">
                            {workflow.description}
                          </p>
                        )}
                        
                        <div className="space-y-2 text-sm text-gray-500 dark:text-gray-400">
                          <div>
                            <span className="font-medium">ID:</span> {workflow.id}
                          </div>
                          <div>
                            <span className="font-medium">Workflow ID:</span> {workflowId}
                          </div>
                          <div>
                            <span className="font-medium">Tags:</span>{' '}
                            {Array.isArray(workflow.tags) && workflow.tags.length > 0
                              ? workflow.tags.join(', ')
                              : 'untagged'}
                          </div>
                          <div>
                            <span className="font-medium">Created:</span>{' '}
                            {new Date(workflow.createdAt).toLocaleDateString()}
                          </div>
                          <div>
                            <span className="font-medium">Updated:</span>{' '}
                            {new Date(workflow.updatedAt).toLocaleDateString()}
                          </div>
                        </div>

                        <details className="mt-4" open>
                          <summary className="cursor-pointer text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                            Full Workflow Details
                          </summary>
                          <pre className="mt-2 p-3 bg-gray-50 dark:bg-gray-900 rounded text-xs overflow-auto max-h-60">
                            {JSON.stringify(workflow, null, 2)}
                          </pre>
                        </details>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

