export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
  }
}

export interface User {
  id: string;
  email: string;
  fullName: string;
  role: string;
  emailVerified: boolean;
  identityStatus: string;
  mustChangePassword: boolean;
}

export interface Category {
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  maxAmountCents: number;
  quickMaxCents: number | null;
  requiresDocument: boolean;
}

export interface Catalog {
  categories: Category[];
  consent: { version: number; body: string };
  attestation: { version: number; body: string };
}

export interface CaseSummary {
  id: string;
  publicRef: string;
  kind: string;
  category: string;
  categoryLabel: string;
  state: string;
  whatHappened: string;
  amountRequestedCents: number;
  dueDate: string | null;
  providerName: string | null;
  alreadyPaidCents: number;
  otherAssistanceCents: number;
  otherAssistanceNote: string | null;
  consequence: string | null;
  recurrence: string | null;
  city: string;
  region: string;
  listingPreference: string;
  submittedAt: string | null;
  createdAt: string;
}

export interface Need {
  ref: string;
  kind: string;
  category: string;
  categoryLabel: string;
  city: string;
  region: string;
  summary: string;
  visibility: string;
  dueDate: string | null;
  listedAt: string;
  expiresOn: string;
  amountCents: number;
  pledgedCents: number;
  remainingCents: number;
  angels: number;
  badges: string[];
  isYours: boolean;
}

export interface Giving {
  angelRef: string | null;
  memberSince: string;
  identityStatus: string;
  activePledgedCents: number;
  needsPledgedTo: number;
  pledges: {
    id: string;
    amountCents: number;
    status: string;
    endedReason: string | null;
    at: string;
    need: {
      ref: string;
      categoryLabel: string;
      city: string;
      region: string;
      summary: string | null;
      listed: boolean;
    };
  }[];
}

export interface CaseDetail extends CaseSummary {
  documentRequired: boolean;
  evidence: {
    id: string;
    kind: string;
    name: string;
    sizeBytes: number;
    uploadedAt: string;
  }[];
  timeline: { action: string; state: string | null; at: string }[];
  messages: {
    id: string;
    kind: string;
    body: string;
    fromYou: boolean;
    at: string;
  }[];
  decision: {
    kind: string;
    outcome: string;
    approvedAmountCents: number | null;
    expiresOn: string | null;
    reasonCode: string | null;
    rationale: string;
    restrictions: string | null;
    at: string;
  } | null;
  canAppeal: boolean;
  listing: { visibility: string; summary: string } | null;
  pledgedCents: number;
  angels: number;
}

export interface Identity {
  status: string;
  note: string | null;
  documents: {
    id: string;
    docType: string;
    name: string;
    status: string;
    uploadedAt: string;
  }[];
}

export interface IdentityQueueItem {
  id: string;
  docType: string;
  name: string;
  sizeBytes: number;
  uploadedAt: string;
  person: { name: string; email: string };
  openRequests: number;
}

export interface ReviewSummary {
  id: string;
  publicRef: string;
  kind: string;
  category: string;
  categoryLabel: string;
  state: string;
  amountRequestedCents: number;
  dueDate: string | null;
  providerName: string | null;
  city: string;
  region: string;
  submittedAt: string | null;
  reviewerName: string | null;
  assignedToMe: boolean;
  assigned: boolean;
  decidedByMe: boolean;
  approvedAmountCents: number | null;
  pledgedCents: number;
}

export interface ReviewDetail extends ReviewSummary {
  whatHappened: string;
  consequence: string | null;
  recurrence: string | null;
  alreadyPaidCents: number;
  otherAssistanceCents: number;
  otherAssistanceNote: string | null;
  requester: {
    name: string;
    email: string;
    identityStatus: string;
    emailVerified: boolean;
  };
  otherRequestsLast12Months: number;
  listing: {
    preference: string;
    visibility: string | null;
    summary: string | null;
    publishedAt: string | null;
    expiresOn: string | null;
  };
  evidence: {
    id: string;
    kind: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: string;
    reusedOn: string[];
  }[];
  checks: {
    id: string;
    claim: string;
    result: string;
    method: string;
    note: string | null;
    by: string;
    at: string;
  }[];
  messages: { id: string; kind: string; body: string; by: string; at: string }[];
  decisions: {
    kind: string;
    outcome: string;
    approvedAmountCents: number | null;
    paymentDestination: string | null;
    expiresOn: string | null;
    reasonCode: string | null;
    rationale: string;
    restrictions: string | null;
    policyVersion: string;
    by: string;
    at: string;
  }[];
  timeline: {
    action: string;
    priorState: string | null;
    state: string | null;
    reason: string | null;
    by: string | null;
    at: string;
  }[];
}

export interface AdminOverview {
  usersByRole: Record<string, number>;
  casesByState: Record<string, number>;
  pendingIdentityChecks: number;
  pendingInvites: number;
  mailProvider: string;
  storage: string;
}

export interface AdminUser {
  id: string;
  email: string;
  fullName: string;
  role: string;
  status: string;
  emailVerified: boolean;
  identityStatus: string;
  mustChangePassword: boolean;
  createdAt: string;
  lastSignIn: string | null;
}

export interface Invite {
  id: string;
  email: string;
  role: string;
  invitedBy: string | null;
  createdAt: string;
  expiresAt: string;
  status: string;
}

export interface NewInvite {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  link: string;
  emailSent: boolean;
}

export interface PolicyText {
  id: string;
  kind: string;
  version: number;
  body: string;
  createdAt: string;
  author: string | null;
}

export interface AuditEntry {
  id: number;
  action: string;
  objectType: string;
  object: string | null;
  priorState: string | null;
  newState: string | null;
  reason: string | null;
  by: string | null;
  at: string;
}

const FALLBACK = "Something went wrong. Try again in a moment.";

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { body } = options;
  const isForm = body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? (body === undefined ? "GET" : "POST"),
      headers:
        body === undefined || isForm
          ? undefined
          : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : isForm ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "We could not reach the server. Check your connection.");
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new ApiError(413, "That file is larger than 8 MB. Upload a smaller one.");
    }
    if (res.status === 429) {
      throw new ApiError(429, "Too many tries. Wait a minute, then try again.");
    }
    let message = FALLBACK;
    let code: string | undefined;
    try {
      const data: { message?: string | string[]; code?: string } =
        await res.json();
      const first = Array.isArray(data.message) ? data.message[0] : data.message;
      if (first) message = first;
      code = data.code;
    } catch {
      // The body was not JSON, which happens when the API is down.
    }
    throw new ApiError(res.status, message, code);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown) {
  return err instanceof ApiError ? err.message : FALLBACK;
}
