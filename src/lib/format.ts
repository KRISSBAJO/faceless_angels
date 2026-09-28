const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

export function formatCents(cents: number) {
  return money.format(cents / 100);
}

/** Reads "187.42" or "$1,187" as cents. Returns null when it is not an amount. */
export function parseCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(Number(cleaned) * 100);
}

/** Formats a YYYY-MM-DD date without shifting it across time zones. */
export function formatDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatMoment(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export const STATE_LABELS: Record<string, string> = {
  draft: "Not sent yet",
  submitted: "Submitted",
  in_review: "In review",
  needs_more_information: "We need more from you",
  approved: "Approved",
  published: "Listed for Angels",
  declined: "Declined",
  appealed: "Appeal in review",
  withdrawn: "Withdrawn",
};

export const EVENT_LABELS: Record<string, string> = {
  "case.created": "Request started",
  "evidence.added": "Document added",
  "case.submitted": "Request submitted",
  "case.claimed": "A reviewer took the request",
  "case.released": "Reviewer handed the request back",
  "case.info_requested": "More information requested",
  "case.replied": "Requester replied",
  "check.recorded": "Check recorded",
  "case.decided": "Decision made",
  "case.appealed": "Appeal sent",
  "appeal.decided": "Appeal decided",
  "case.published": "Listed for Angels",
  "case.unpublished": "Taken off the list",
  "pledge.made": "An Angel pledged",
  "pledge.withdrawn": "A pledge was withdrawn",
  "case.viewed": "Case opened by staff",
  "evidence.viewed": "Document opened by staff",
  "case.withdrawn": "Request withdrawn",
  "user.created": "Account created",
  "user.seeded_admin": "First administrator created",
  "user.email_verified": "Email confirmed",
  "user.password_changed": "Password changed",
  "user.password_reset": "Password reset by email",
  "user.role_changed": "Role changed",
  "user.disabled": "Account turned off",
  "user.enabled": "Account turned on",
  "invite.created": "Invitation sent",
  "invite.accepted": "Invitation accepted",
  "invite.revoked": "Invitation cancelled",
  "identity.uploaded": "ID sent",
  "identity.viewed": "ID opened by staff",
  "identity.decided": "ID checked",
  "category.updated": "Need type changed",
  "policy.published": "Agreement wording changed",
  "journal.created": "Article started",
  "journal.edited": "Article changed",
  "journal.submitted": "Article sent for review",
  "journal.approved": "Article approved",
  "journal.changes_requested": "Changes asked for",
  "journal.published": "Article published",
  "journal.published_unreviewed": "Article published without a second reader",
  "journal.unpublished": "Article taken down",
  "journal.archived": "Article archived",
  "journal.restored": "Article brought back",
  "journal.restored_version": "Earlier version brought back",
  "journal.featured": "Article featured",
  "journal.unfeatured": "Article no longer featured",
  "journal.corrected": "Correction added",
  "journal.category_saved": "Journal category saved",
  "journal.comment_shown": "Comment shown",
  "journal.comment_hidden": "Comment hidden",
  "prayer_group.created": "Prayer group started",
  "prayer_group.approved": "Prayer group approved",
  "prayer_group.declined": "Prayer group not approved",
  "prayer_group.updated": "Prayer group changed",
  "prayer_group.invited": "Person invited to a prayer group",
  "prayer_group.member_approve": "Member approved",
  "prayer_group.member_remove": "Member removed",
  "prayer_group.member_make_leader": "Member made a group admin",
  "prayer_group.suspend": "Prayer group suspended",
  "prayer_group.reinstate": "Prayer group opened again",
  "prayer_group.close": "Prayer group closed",
  "prayer_group.member_make_moderator": "Member made a moderator",
  "prayer_group.member_make_member": "Group admin or moderator made a member",
  "prayer_session.created": "Prayer session scheduled",
  "prayer_session.cancelled": "Prayer session cancelled",
  "prayer_campaign.created": "Prayer campaign started",
  "prayer_campaign.cancelled": "Prayer campaign cancelled",
  "prayer_chain.created": "Prayer chain planned",
  "prayer_chain.cancelled": "Prayer chain cancelled",
  "prayer.approved": "Prayer request shared",
  "prayer.hidden": "Prayer request not shared",
  "prayer_report.keep": "Report closed, content kept",
  "prayer_report.remove": "Report closed, content removed",
  "testimony.published": "Testimony published",
  "testimony.declined": "Testimony kept private",
};

export const CLAIM_LABELS: Record<string, string> = {
  identity: "Identity",
  document: "Bill or document",
  obligation_owner: "The bill belongs to the requester",
  current_balance: "Current balance with provider",
  provider_payment: "Provider can be paid directly",
  other_assistance: "Other help for this need",
};

export const RESULT_LABELS: Record<string, string> = {
  unverified: "Unverified",
  self_reported: "Self-reported",
  document_supported: "Supported by a document",
  independently_confirmed: "Independently confirmed",
};

export const DECLINE_REASON_LABELS: Record<string, string> = {
  outside_service_area: "Outside our service area",
  outside_mission: "Outside what we can help with",
  need_not_documented: "The need was not documented",
  balance_not_outstanding: "The balance is no longer owed",
  already_covered: "Other help already covers it",
  could_not_verify: "We could not confirm the details",
  other: "Another reason",
};

/** Whole days since a moment, for showing how long a request has waited. */
export function daysSince(iso: string) {
  return Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 86_400_000));
}
