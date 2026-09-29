import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { SessionUser } from '../auth/auth.service';
import { DbService } from '../db/db.service';
import {
  ACCEPTED_FILE_TYPES,
  sniffMimeType,
  VaultService,
} from '../storage/vault.service';
import { paystackStatus, stripeStatus } from './providers';

/** What running Faceless Angels costs, as shown to the public. */
export const EXPENSE_CATEGORIES: Record<string, string> = {
  hosting: 'Hosting and software',
  messages: 'Email and messages',
  checks: 'Identity and document checks',
  people: 'Staff and volunteer support',
  outreach: 'Outreach and printing',
  legal: 'Legal and accounting',
  banking: 'Bank charges',
  other: 'Other costs',
};

export interface LedgerInput {
  kind: 'expense' | 'help';
  category: string;
  description: string;
  payee: string;
  currency: 'usd' | 'ngn';
  amount: number;
  paidOn: string;
  caseRef?: string;
}

interface EntryRow {
  id: string;
  kind: string;
  category: string;
  description: string;
  payee: string;
  currency: string;
  amount_minor: string;
  paid_on: string;
  case_ref: string | null;
  status: string;
  proposed_by: string;
  proposed_by_name: string;
  decided_by_name: string | null;
  decision_note: string | null;
  receipt_name: string | null;
  created_at: Date;
  decided_at: Date | null;
}

@Injectable()
export class LedgerService {
  constructor(
    private readonly db: DbService,
    private readonly audit: AuditService,
    private readonly vault: VaultService,
  ) {}

  private async helpCategories() {
    const found = await this.db.query<{ key: string; label: string }>(
      'select key, label from need_categories order by sort',
    );
    return Object.fromEntries(found.rows.map((r) => [r.key, r.label]));
  }

  async categories() {
    return { expense: EXPENSE_CATEGORIES, help: await this.helpCategories() };
  }

  // ---- Staff view

  async overview() {
    const gifts = await this.db.query<{
      id: string;
      provider: string;
      kind: string;
      currency: string;
      amount_minor: string;
      fee_minor: string | null;
      refunded_minor: string;
      status: string;
      email: string | null;
      livemode: boolean;
      received_at: Date;
      receipt_sent_at: Date | null;
    }>(
      `select id, provider, kind, currency, amount_minor, fee_minor, refunded_minor,
              status, email, livemode, received_at, receipt_sent_at
       from donations order by received_at desc limit 100`,
    );
    const hooks = await this.db.query<{
      provider: string;
      last_event: string;
      received_at: Date;
    }>('select * from giving_webhooks');
    return {
      providers: [stripeStatus(), paystackStatus()].map((p) => ({
        ...p,
        lastWebhook:
          hooks.rows.find((h) => h.provider === p.provider) ?? null,
      })),
      gifts: gifts.rows.map((g) => ({
        id: g.id,
        provider: g.provider,
        kind: g.kind,
        currency: g.currency,
        amount: Number(g.amount_minor) / 100,
        fee: g.fee_minor === null ? null : Number(g.fee_minor) / 100,
        refunded: Number(g.refunded_minor) / 100,
        status: g.status,
        email: g.email,
        testMode: !g.livemode,
        receivedAt: g.received_at,
        receiptSent: Boolean(g.receipt_sent_at),
      })),
      entries: await this.entries(),
      categories: await this.categories(),
    };
  }

  private async entries() {
    const found = await this.db.query<EntryRow>(
      `select e.id, e.kind, e.category, e.description, e.payee, e.currency,
              e.amount_minor, to_char(e.paid_on, 'YYYY-MM-DD') as paid_on,
              c.public_ref as case_ref, e.status, e.proposed_by,
              p.full_name as proposed_by_name, d.full_name as decided_by_name,
              e.decision_note, e.receipt_name, e.created_at, e.decided_at
       from ledger_entries e
       join users p on p.id = e.proposed_by
       left join users d on d.id = e.decided_by
       left join cases c on c.id = e.case_id
       order by (e.status = 'proposed') desc, e.paid_on desc, e.created_at desc
       limit 200`,
    );
    return found.rows.map((e) => ({
      id: e.id,
      kind: e.kind,
      category: e.category,
      description: e.description,
      payee: e.payee,
      currency: e.currency,
      amount: Number(e.amount_minor) / 100,
      paidOn: e.paid_on,
      caseRef: e.case_ref,
      status: e.status,
      proposedById: e.proposed_by,
      proposedBy: e.proposed_by_name,
      decidedBy: e.decided_by_name,
      decisionNote: e.decision_note,
      hasReceipt: Boolean(e.receipt_name),
      createdAt: e.created_at,
      decidedAt: e.decided_at,
    }));
  }

  async propose(
    user: SessionUser,
    input: LedgerInput,
    file: Express.Multer.File | undefined,
  ) {
    const categories =
      input.kind === 'expense' ? EXPENSE_CATEGORIES : await this.helpCategories();
    if (!categories[input.category]) {
      throw new BadRequestException('Choose a category from the list.');
    }
    const amountMinor = Math.round(input.amount * 100);
    if (!(amountMinor > 0)) throw new BadRequestException('Enter the amount paid.');
    const paidOn = new Date(`${input.paidOn}T00:00:00Z`);
    if (Number.isNaN(paidOn.getTime()) || paidOn.getTime() > Date.now() + 86_400_000) {
      throw new BadRequestException('Enter the date it was paid. It cannot be in the future.');
    }
    if (!file) {
      throw new BadRequestException('Attach the receipt or invoice. Nothing is recorded without one.');
    }
    const mimeType = sniffMimeType(file.buffer);
    if (!mimeType) {
      throw new BadRequestException(`Upload the receipt as a ${ACCEPTED_FILE_TYPES} file.`);
    }

    let caseId: string | null = null;
    if (input.kind === 'help' && input.caseRef?.trim()) {
      const found = await this.db.query<{ id: string }>(
        'select id from cases where public_ref = $1',
        [input.caseRef.trim().toUpperCase()],
      );
      if (!found.rows[0]) throw new BadRequestException('No request has that reference.');
      caseId = found.rows[0].id;
    }

    const stored = await this.vault.put('finance', file.buffer);
    return this.db.tx(async (client) => {
      const row = await client.query<{ id: string }>(
        `insert into ledger_entries
           (kind, category, description, payee, currency, amount_minor, paid_on,
            case_id, receipt_storage, receipt_key, receipt_encryption,
            receipt_mime, receipt_name, proposed_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         returning id`,
        [
          input.kind,
          input.category,
          input.description.trim(),
          input.payee.trim(),
          input.currency,
          amountMinor,
          input.paidOn,
          caseId,
          stored.storage,
          stored.key,
          stored.encryption,
          mimeType,
          (file.originalname || 'receipt').slice(0, 200),
          user.id,
        ],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: `ledger.${input.kind}.proposed`,
        objectType: 'ledger_entry',
        objectId: row.rows[0].id,
        newState: 'proposed',
      });
      return { id: row.rows[0].id };
    });
  }

  /** A second person approves or rejects. The proposer never can. */
  async decide(
    user: SessionUser,
    id: string,
    outcome: 'approved' | 'rejected',
    note?: string,
  ) {
    await this.db.tx(async (client) => {
      const found = await client.query<{
        status: string;
        proposed_by: string;
        kind: string;
      }>(
        'select status, proposed_by, kind from ledger_entries where id = $1 for update',
        [id],
      );
      const entry = found.rows[0];
      if (!entry) throw new NotFoundException();
      if (entry.proposed_by === user.id) {
        throw new ForbiddenException(
          'Someone else must check this. You recorded it, so you cannot approve it.',
        );
      }
      if (entry.status !== 'proposed') {
        throw new ConflictException('This has already been decided.');
      }
      if (outcome === 'rejected' && !note?.trim()) {
        throw new BadRequestException('Say why it is rejected.');
      }
      await client.query(
        `update ledger_entries
           set status = $2, decided_by = $3, decision_note = $4, decided_at = now()
         where id = $1`,
        [id, outcome, user.id, note?.trim() || null],
      );
      await this.audit.record(client, {
        actorId: user.id,
        action: `ledger.${entry.kind}.${outcome}`,
        objectType: 'ledger_entry',
        objectId: id,
        priorState: 'proposed',
        newState: outcome,
        reason: note?.trim() || null,
      });
    });
  }

  async receipt(user: SessionUser, id: string) {
    const found = await this.db.query<{
      receipt_storage: string;
      receipt_key: string;
      receipt_encryption: string | null;
      receipt_mime: string;
      receipt_name: string;
    }>('select * from ledger_entries where id = $1', [id]);
    const entry = found.rows[0];
    if (!entry?.receipt_key) throw new NotFoundException();
    const bytes = await this.vault.get({
      storage: entry.receipt_storage,
      key: entry.receipt_key,
      encryption: entry.receipt_encryption,
    });
    await this.db.tx((client) =>
      this.audit.record(client, {
        actorId: user.id,
        action: 'ledger.receipt.opened',
        objectType: 'ledger_entry',
        objectId: id,
      }),
    );
    return { bytes, mimeType: entry.receipt_mime, name: entry.receipt_name };
  }

  // ---- The public page

  /**
   * Totals only. No names, no addresses, and no single gift with its time,
   * so no one can be picked out. Each currency stands on its own.
   */
  async transparency() {
    const providers = [stripeStatus(), paystackStatus()];
    const helpLabels = await this.helpCategories();
    const currencies = await Promise.all(
      (['usd', 'ngn'] as const).map(async (currency) => {
        const provider = providers.find((p) => p.currency === currency)!;
        const livemode = provider.livemode;

        const gifts = await this.db.query<{
          received: string | null;
          fees: string | null;
          gifts: string;
          givers: string;
          unknown_fees: string;
        }>(
          `select sum(amount_minor - refunded_minor) filter (where status <> 'disputed') as received,
                  sum(fee_minor) as fees,
                  count(*) filter (where status = 'succeeded') as gifts,
                  count(distinct coalesce(user_id::text, email))
                    filter (where status = 'succeeded') as givers,
                  count(*) filter (where fee_minor is null) as unknown_fees
           from donations where currency = $1 and livemode = $2`,
          [currency, livemode],
        );
        const monthlyGivers = await this.db.query<{ n: string }>(
          `select count(*) as n from recurring_gifts
           where currency = $1 and livemode = $2 and status = 'active'`,
          [currency, livemode],
        );
        const out = await this.db.query<{
          kind: string;
          category: string;
          total: string;
          entries: string;
        }>(
          `select kind, category, sum(amount_minor) as total, count(*) as entries
           from ledger_entries
           where status = 'approved' and currency = $1
           group by kind, category order by total desc`,
          [currency],
        );
        const months = await this.db.query<{
          month: string;
          received: string;
          spent: string;
          helped: string;
        }>(
          `with months as (
             select to_char(d, 'YYYY-MM') as month
             from generate_series(date_trunc('month', now()) - interval '11 months',
                                  date_trunc('month', now()), interval '1 month') d
           )
           select m.month,
             coalesce((select sum(amount_minor - refunded_minor) from donations
                       where currency = $1 and livemode = $2 and status <> 'disputed'
                         and to_char(received_at, 'YYYY-MM') = m.month), 0) as received,
             coalesce((select sum(amount_minor) from ledger_entries
                       where status = 'approved' and currency = $1 and kind = 'expense'
                         and to_char(paid_on, 'YYYY-MM') = m.month), 0) as spent,
             coalesce((select sum(amount_minor) from ledger_entries
                       where status = 'approved' and currency = $1 and kind = 'help'
                         and to_char(paid_on, 'YYYY-MM') = m.month), 0) as helped
           from months m order by m.month`,
          [currency, livemode],
        );

        const g = gifts.rows[0];
        const received = Number(g.received ?? 0);
        const fees = Number(g.fees ?? 0);
        const pick = (kind: string, labels: Record<string, string>) =>
          out.rows
            .filter((r) => r.kind === kind)
            .map((r) => ({
              category: r.category,
              label: labels[r.category] ?? r.category,
              total: Number(r.total) / 100,
              entries: Number(r.entries),
            }));
        const expenses = pick('expense', EXPENSE_CATEGORIES);
        const help = pick('help', helpLabels);
        const spent = expenses.reduce((n, e) => n + e.total, 0);
        const helped = help.reduce((n, e) => n + e.total, 0);

        return {
          currency,
          open: provider.ready,
          testMode: !livemode,
          received: received / 100,
          fees: fees / 100,
          feesPartlyUnknown: Number(g.unknown_fees) > 0,
          gifts: Number(g.gifts),
          givers: Number(g.givers),
          monthlyGivers: Number(monthlyGivers.rows[0].n),
          expenses,
          help,
          spent,
          helped,
          balance: (received - fees) / 100 - spent - helped,
          months: months.rows.map((m) => ({
            month: m.month,
            received: Number(m.received) / 100,
            spent: Number(m.spent) / 100,
            helped: Number(m.helped) / 100,
          })),
        };
      }),
    );

    // Promises Angels have made toward needs. No money has moved for these.
    const pledges = await this.db.query<{
      total: string | null;
      needs: string;
      angels: string;
    }>(
      `select sum(amount_cents) as total, count(distinct case_id) as needs,
              count(distinct angel_id) as angels
       from pledges where status = 'active'`,
    );
    return {
      updatedAt: new Date().toISOString(),
      currencies,
      pledges: {
        total: Number(pledges.rows[0].total ?? 0) / 100,
        needs: Number(pledges.rows[0].needs),
        angels: Number(pledges.rows[0].angels),
      },
    };
  }
}
