function env(name: string) {
  return process.env[name]?.trim() ?? '';
}

export const ROLES = [
  'requester',
  'angel',
  'reviewer',
  'senior_reviewer',
  'payment_approver',
  'editor',
  'prayer_team',
  'pastor',
  'auditor',
  'admin',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that read prayer requests sent to the prayer team. */
export const PRAYER_TEAM_ROLES: Role[] = ['prayer_team', 'pastor', 'admin'];

/** Roles that approve what appears in public and approve new groups. */
export const PRAYER_MODERATOR_ROLES: Role[] = ['pastor', 'editor', 'admin'];

/** Roles that write, review, and moderate the Journal. */
export const JOURNAL_STAFF_ROLES: Role[] = ['editor', 'pastor', 'admin'];

/** Roles that may open cases and identity papers. */
export const REVIEW_ROLES: Role[] = ['reviewer', 'senior_reviewer', 'admin'];

/** Roles that see gifts and the money records. Auditors read only. */
export const FINANCE_ROLES: Role[] = ['admin', 'payment_approver', 'auditor'];

/** Roles that record and approve costs and help given. */
export const FINANCE_WRITERS: Role[] = ['admin', 'payment_approver'];

export const config = {
  production: env('NODE_ENV') === 'production',
  webUrl: (env('WEB_URL') || 'http://localhost:3230').replace(/\/$/, ''),
  mail: {
    provider: env('EMAIL_PROVIDER') || 'log',
    from: env('MAIL_FROM'),
    relykitKey: env('RELYKIT_API_KEY'),
    relykitUrl: (env('RELYKIT_URL') || 'https://api.relykit.com').replace(
      /\/$/,
      '',
    ),
    smtp: {
      host: env('SMTP_HOST'),
      port: Number(env('SMTP_PORT') || 587),
      user: env('SMTP_USER'),
      password: env('SMTP_PASSWORD'),
      secure: env('SMTP_SECURE') === 'true',
    },
  },
  storage: {
    bucket: env('AWS_S3_BUCKET'),
    disabledInTest: env('ALLOW_STORAGE_DISABLED_FOR_TEST') === 'true',
    region: env('AWS_REGION') || 'us-east-1',
    localDir: env('EVIDENCE_DIR') || './data/evidence',
    encryptionKey: env('EVIDENCE_ENCRYPTION_KEY'),
  },
  patvero: {
    // PATVERO_API_URL was this setting's earlier name.
    baseUrl: (
      env('PATVERO_API_BASE_URL') ||
      env('PATVERO_API_URL') ||
      'https://api.patvero.com/api/v1'
    ).replace(/\/$/, ''),
    apiKey: env('PATVERO_API_KEY'),
  },
  giving: {
    // Real money moves only when this is true and the keys are live keys.
    // Until the legal body is settled it stays false, and live keys are refused.
    live: env('GIVING_LIVE') === 'true',
    stripe: {
      secretKey: env('STRIPE_SECRET_KEY'),
      webhookSecret: env('STRIPE_WEBHOOK_SECRET'),
      apiBase: (env('STRIPE_API_BASE') || 'https://api.stripe.com').replace(
        /\/$/,
        '',
      ),
    },
    paystack: {
      // Paystack signs its webhooks with this same secret key.
      secretKey: env('PAYSTACK_SECRET_KEY'),
      apiBase: (env('PAYSTACK_API_BASE') || 'https://api.paystack.co').replace(
        /\/$/,
        '',
      ),
    },
    // An extra line for every receipt, if wanted. The tax wording comes
    // from each legal body's details, set in Admin -> Money.
    receiptNote: env('GIVING_RECEIPT_NOTE'),
  },
  seed: {
    email: env('SEED_OWNER_EMAIL').toLowerCase(),
    password: env('SEED_OWNER_PASSWORD'),
  },
};
