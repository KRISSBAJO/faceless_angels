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
  'auditor',
  'admin',
] as const;

export type Role = (typeof ROLES)[number];

/** Roles that may open cases and identity papers. */
export const REVIEW_ROLES: Role[] = ['reviewer', 'senior_reviewer', 'admin'];

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
    region: env('AWS_REGION') || 'us-east-1',
    localDir: env('EVIDENCE_DIR') || './data/evidence',
    encryptionKey: env('EVIDENCE_ENCRYPTION_KEY'),
  },
  seed: {
    email: env('SEED_OWNER_EMAIL').toLowerCase(),
    password: env('SEED_OWNER_PASSWORD'),
  },
};
