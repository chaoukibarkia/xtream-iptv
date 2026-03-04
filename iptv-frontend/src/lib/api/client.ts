import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";

// Use proxy path for same-origin requests (works with remote access/tunnels)
// This avoids CORS issues and works regardless of how the frontend is accessed
const API_URL = typeof window !== 'undefined' ? '/api-proxy' : 'http://127.0.0.1:3001';
const ADMIN_API_KEY = process.env.NEXT_PUBLIC_ADMIN_API_KEY || "admin-dev-key";

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 300000, // 5 minutes for large file uploads
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": ADMIN_API_KEY, // Admin API key for backend
      },
    });

    // Request interceptor for auth
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        if (typeof window !== "undefined") {
          const token = localStorage.getItem("token");
          if (token) {
            config.headers.Authorization = `Bearer ${token}`;
          }
          // Also check for admin API key in localStorage
          const adminKey = localStorage.getItem("adminApiKey");
          if (adminKey) {
            config.headers["X-API-Key"] = adminKey;
          }
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for errors
    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        if (error.response?.status === 401) {
          if (typeof window !== "undefined") {
            localStorage.removeItem("token");
            // Keep cookie auth-token in sync with localStorage token
            document.cookie = "auth-token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; SameSite=Lax";
            window.location.href = "/login";
          }
        }
        return Promise.reject(error);
      }
    );
  }

  // Generic methods
  get = async <T>(url: string, params?: object): Promise<T> => {
    const response = await this.client.get<T>(url, { params });
    return response.data;
  };

  post = async <T>(url: string, data?: object | FormData): Promise<T> => {
    // For FormData, don't set Content-Type - let browser/axios set it with boundary
    const config = data instanceof FormData ? {
      headers: {
        'Content-Type': undefined,
      },
    } : {};
    const response = await this.client.post<T>(url, data, config);
    return response.data;
  };

  put = async <T>(url: string, data?: object): Promise<T> => {
    const response = await this.client.put<T>(url, data);
    return response.data;
  };

  patch = async <T>(url: string, data?: object): Promise<T> => {
    const response = await this.client.patch<T>(url, data);
    return response.data;
  };

  delete = async <T>(url: string, data?: object): Promise<T> => {
    const response = await this.client.delete<T>(url, { data });
    return response.data;
  };
}

export const api = new ApiClient();
