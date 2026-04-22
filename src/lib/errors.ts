// src/lib/errors.ts
export class TransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TransientError';
  }
}

export class TerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalError';
  }
}

export class ExternalApiError extends Error {
  constructor(public service: string, public status: number, public body: string) {
    super(`${service} returned ${status}: ${body.slice(0, 200)}`);
    this.name = 'ExternalApiError';
  }
}
