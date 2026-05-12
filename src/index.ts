export { WebScrapingAI } from './client.js';
export type {
  ClientOptions,
  CommonRequestOptions,
  HtmlOptions,
  TextOptions,
  SelectedOptions,
  SelectedMultipleOptions,
  QuestionOptions,
  FieldsOptions,
} from './client.js';

export {
  WebScrapingAIError,
  APIError,
  BadRequestError,
  PaymentRequiredError,
  AuthenticationError,
  RateLimitError,
  ServerError,
  GatewayTimeoutError,
  APITimeoutError,
  APIConnectionError,
} from './errors.js';
export type { APIErrorInit } from './errors.js';

export { VERSION } from './version.js';
