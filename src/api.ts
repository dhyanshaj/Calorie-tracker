export class ApiError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : options.body
            ? { "Content-Type": "application/json" }
            : {}),
        ...options.headers,
      },
      signal: options.signal ?? AbortSignal.timeout(70000),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    throw new ApiError(
      "Could not reach the server. Check your connection and try again.",
      "NETWORK",
      0,
    );
  }
  if (response.status === 204) return undefined as T;
  let data: any;
  try {
    data = await response.json();
  } catch {
    throw new ApiError(
      "The server returned an unreadable response. Please retry.",
      "BAD_RESPONSE",
      response.status,
    );
  }
  if (response.status === 401 && !url.startsWith("/api/auth/"))
    window.dispatchEvent(new Event("session-expired"));
  if (!response.ok)
    throw new ApiError(
      data.error?.message ?? "The request failed. Please try again.",
      data.error?.code ?? "UNKNOWN",
      response.status,
    );
  return data as T;
}
