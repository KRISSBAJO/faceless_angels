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
  patvero: {
    // PATVERO_API_URL was this setting's earlier name.
    baseUrl: (
      env('PATVERO_API_BASE_URL') ||
      env('PATVERO_API_URL') ||
      'https://api.patvero.com/api/v1'
    ).replace(/\/$/, ''),
    apiKey: env('PATVERO_API_KEY'),
  },
  seed: {
    email: env('SEED_OWNER_EMAIL').toLowerCase(),
    password: env('SEED_OWNER_PASSWORD'),
  },
};
