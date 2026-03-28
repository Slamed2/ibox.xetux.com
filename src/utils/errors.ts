export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class WebhookVerificationError extends AppError {
  constructor(message = 'Invalid webhook signature') {
    super(message, 401, 'WEBHOOK_VERIFICATION_FAILED');
    this.name = 'WebhookVerificationError';
  }
}
