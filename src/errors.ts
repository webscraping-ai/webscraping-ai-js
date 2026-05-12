/**
 * Error hierarchy for the WebScraping.AI client.
 *
 *   - `WebScrapingAIError` — base for everything thrown by this library.
 *   - `APIError` — non-2xx HTTP response; subclassed per documented status.
 *   - `APITimeoutError` / `APIConnectionError` — transport-level failures,
 *     no HTTP response received.
 *
 * Per-status subclasses make it easy to `catch` on the situation that
 * matters (billing vs. rate limits vs. transport) without inspecting
 * status codes.
 */

export class WebScrapingAIError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebScrapingAIError';
  }
}

export interface APIErrorInit {
  message: string;
  status: number;
  statusCode?: number | null;
  statusMessage?: string | null;
  body?: string | null;
  responseBody?: string | null;
}

export class APIError extends WebScrapingAIError {
  readonly status: number;
  readonly statusCode: number | null;
  readonly statusMessage: string | null;
  readonly body: string | null;
  readonly responseBody: string | null;

  constructor(init: APIErrorInit) {
    super(init.message);
    this.name = 'APIError';
    this.status = init.status;
    this.statusCode = init.statusCode ?? null;
    this.statusMessage = init.statusMessage ?? null;
    this.body = init.body ?? null;
    this.responseBody = init.responseBody ?? null;
  }
}

export class BadRequestError extends APIError {
  constructor(init: APIErrorInit) {
    super(init);
    this.name = 'BadRequestError';
  }
}

export class PaymentRequiredError extends APIError {
  constructor(init: APIErrorInit) {
    super(init);
    this.name = 'PaymentRequiredError';
  }
}

export class AuthenticationError extends APIError {
  constructor(init: APIErrorInit) {
    super(init);
    this.name = 'AuthenticationError';
  }
}

export class RateLimitError extends APIError {
  constructor(init: APIErrorInit) {
    super(init);
    this.name = 'RateLimitError';
  }
}

export class ServerError extends APIError {
  constructor(init: APIErrorInit) {
    super(init);
    this.name = 'ServerError';
  }
}

export class GatewayTimeoutError extends APIError {
  constructor(init: APIErrorInit) {
    super(init);
    this.name = 'GatewayTimeoutError';
  }
}

export class APITimeoutError extends WebScrapingAIError {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'APITimeoutError';
  }
}

export class APIConnectionError extends WebScrapingAIError {
  constructor(message = 'Connection failed') {
    super(message);
    this.name = 'APIConnectionError';
  }
}

export const STATUS_TO_ERROR: Record<number, new (init: APIErrorInit) => APIError> = {
  400: BadRequestError,
  402: PaymentRequiredError,
  403: AuthenticationError,
  429: RateLimitError,
  500: ServerError,
  504: GatewayTimeoutError,
};
