// Type definitions for email options
export interface EmailOptions {
  to: string | string[];
  cc?: string | string[];
  bcc?: string | string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: Array<{
    filename: string;
    content?: string | Buffer;
    path?: string;
  }>;
}

export interface EmailResponse {
  messageId: string;
  response: string;
  accepted?: string[];
  rejected?: string[];
}
