/** fetch with an abort timeout, so one slow or throttled ThriftBooks response
 *  can't stall a whole scan. Throws (AbortError) on timeout — callers already
 *  treat a failed fetch as "skip this one". */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 9000): Promise<Response> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...init, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}
