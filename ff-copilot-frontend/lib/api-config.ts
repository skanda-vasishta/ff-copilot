// Centralized API configuration
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000';

// Helper function to create API URLs
export const createApiUrl = (endpoint: string, params?: URLSearchParams): string => {
  const url = `${API_BASE_URL}${endpoint}`;
  return params ? `${url}?${params}` : url;
};

// Common fetch wrapper with error handling
export const apiRequest = async (
  endpoint: string, 
  options: RequestInit = {},
  params?: URLSearchParams
): Promise<Response> => {
  const url = createApiUrl(endpoint, params);
  
  const defaultHeaders = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  return response;
};
