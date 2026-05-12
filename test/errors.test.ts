import { describe, expect, it } from 'vitest';
import {
  APIError,
  APIConnectionError,
  APITimeoutError,
  AuthenticationError,
  BadRequestError,
  GatewayTimeoutError,
  PaymentRequiredError,
  RateLimitError,
  ServerError,
  STATUS_TO_ERROR,
  WebScrapingAIError,
} from '../src/errors.js';

describe('error hierarchy', () => {
  it('all API errors extend APIError and WebScrapingAIError', () => {
    const classes = [
      BadRequestError,
      PaymentRequiredError,
      AuthenticationError,
      RateLimitError,
      ServerError,
      GatewayTimeoutError,
    ];
    for (const C of classes) {
      const e = new C({ message: 'x', status: 400 });
      expect(e).toBeInstanceOf(APIError);
      expect(e).toBeInstanceOf(WebScrapingAIError);
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('transport errors extend WebScrapingAIError but not APIError', () => {
    expect(new APITimeoutError()).toBeInstanceOf(WebScrapingAIError);
    expect(new APITimeoutError()).not.toBeInstanceOf(APIError);
    expect(new APIConnectionError()).toBeInstanceOf(WebScrapingAIError);
    expect(new APIConnectionError()).not.toBeInstanceOf(APIError);
  });

  it('preserves the API error envelope on the error object', () => {
    const e = new ServerError({
      message: 'Upstream broke',
      status: 500,
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      body: 'origin response',
      responseBody: '{"message":"Upstream broke"}',
    });
    expect(e.message).toBe('Upstream broke');
    expect(e.status).toBe(500);
    expect(e.statusCode).toBe(502);
    expect(e.statusMessage).toBe('Bad Gateway');
    expect(e.body).toBe('origin response');
    expect(e.responseBody).toBe('{"message":"Upstream broke"}');
  });

  it('STATUS_TO_ERROR maps documented statuses', () => {
    expect(STATUS_TO_ERROR[400]).toBe(BadRequestError);
    expect(STATUS_TO_ERROR[402]).toBe(PaymentRequiredError);
    expect(STATUS_TO_ERROR[403]).toBe(AuthenticationError);
    expect(STATUS_TO_ERROR[429]).toBe(RateLimitError);
    expect(STATUS_TO_ERROR[500]).toBe(ServerError);
    expect(STATUS_TO_ERROR[504]).toBe(GatewayTimeoutError);
  });

  it('error `name` matches the class name (useful for cross-realm checks)', () => {
    expect(new BadRequestError({ message: 'x', status: 400 }).name).toBe('BadRequestError');
    expect(new APITimeoutError().name).toBe('APITimeoutError');
  });
});
