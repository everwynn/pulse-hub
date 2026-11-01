import { USER_AGENT } from '../sources.mjs';

/**
 * 统一请求封装：带可识别 UA、超时控制、失败原因归一。
 * 合规要求：不伪装浏览器、不并发冲击上游。
 */
export async function request(url, { timeoutMs = 15000, headers = {}, accept = '*/*' } = {}) {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept,
      ...headers,
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) {
    const error = new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim());
    error.status = res.status;
    throw error;
  }
  return res;
}

export async function fetchText(url, options) {
  const res = await request(url, options);
  return res.text();
}

export async function fetchJson(url, options) {
  const res = await request(url, options);
  return res.json();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** 仅对网络抖动和 5xx 重试，4xx 直接失败（重试无意义，也可能加重对方负担） */
export async function withRetry(run, { attempts = 2, delayMs = 1500 } = {}) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      const status = error?.status;
      const retryable = !status || status >= 500 || status === 429;
      if (!retryable || attempt === attempts - 1) break;
      await sleep(delayMs * (attempt + 1));
    }
  }
  throw lastError;
}
