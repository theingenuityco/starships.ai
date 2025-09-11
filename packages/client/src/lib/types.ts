/**
 * Shared types for the client package
 */

// FetchResponse type to replace AxiosResponse
export interface FetchResponse<T = any> {
  data: T
  status: number
  statusText: string
  headers: Headers
  config?: {
    url?: string
    method?: string
  }
}
