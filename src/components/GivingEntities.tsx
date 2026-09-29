"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { CURRENCY_NAMES, type GivingEntity } from "@/lib/giving";

const WHO: Record<string, string> = {
  usd: "The US body that receives gifts in dollars",
  ngn: "The Nigerian body that receives gifts in naira",
};

/** The legal details printed on every receipt and statement. */
export default function GivingEntities({ canEdit }: { canEdit: boolean }) {
  const [entities, setEntities] = useState<GivingEntity[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api<GivingEntity[]>("/finance/entities")
      .then((e) => active && setEntities(e))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="flex flex-col gap-4">
      <div className="flex max-w-2xl flex-col gap-1">
        <h2 className="font-serif text-2xl">Legal details on receipts</h2>
        <p className="text-sm leading-6 text-muted">
          Every receipt and yearly statement shows these. Until a body is
          marked as recognised, receipts say the gift may not be
          tax-deductible. Have your accountant confirm the wording.
        </p>
      </div>
      {error ? <p role="alert" className="text-sm">{error}</p> : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {entities?.map((e) => (
          <EntityForm key={e.currency} entity={e} canEdit={canEdit} />
        ))}
      </div>
    </section>
  );
}

function EntityForm({ entity, canEdit }: { entity: GivingEntity; canEdit: boolean }) {
  const [draft, setDraft] = useState(entity);
  const [state, setState] = useState<"idle" | "saving" | "saved" | string>("idle");
  const set = <K extends keyof GivingEntity>(key: K, value: GivingEntity[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setState("idle");
  };

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    try {
      await api(`/finance/entities/${entity.currency}`, {
        method: "PUT",
        body: {
          legalName: draft.legalName,
          registrationNumber: draft.registrationNumber,
          address: draft.address,
          taxStatus: draft.taxStatus,
          taxStatement: draft.taxStatement,
          religiousBenefits: draft.religiousBenefits,
        },
      });
      setState("saved");
    } catch (err) {
      setState(errorMessage(err));
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-medium">{CURRENCY_NAMES[entity.currency]}</h3>
        <p className="text-xs text-muted">{WHO[entity.currency]}</p>
      </div>
      <fieldset disabled={!canEdit} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Legal name
          <input className="input font-normal" value={draft.legalName} onChange={(e) => set("legalName", e.target.value)} placeholder={entity.currency === "usd" ? "Faceless Angels Inc." : "The Incorporated Trustees of Faceless Angels"} maxLength={200} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {entity.registrationLabel}
          <input className="input font-normal" value={draft.registrationNumber} onChange={(e) => set("registrationNumber", e.target.value)} placeholder={entity.currency === "usd" ? "12-3456789" : "IT/123456"} maxLength={60} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Address
          <textarea className="input font-normal" rows={2} value={draft.address} onChange={(e) => set("address", e.target.value)} maxLength={400} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Tax status
          <select className="input font-normal" value={draft.taxStatus} onChange={(e) => set("taxStatus", e.target.value as GivingEntity["taxStatus"])}>
            <option value="not_recognised">Not yet recognised as tax-exempt</option>
            <option value="recognised">Recognised as tax-exempt</option>
          </select>
        </label>
        {draft.taxStatus === "recognised" ? (
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Tax statement on receipts
            <textarea
              className="input font-normal"
              rows={3}
              value={draft.taxStatement}
              onChange={(e) => set("taxStatement", e.target.value)}
              maxLength={600}
              placeholder={
                entity.currency === "usd"
                  ? "Faceless Angels Inc. is a tax-exempt organization under section 501(c)(3) of the Internal Revenue Code. Gifts are tax-deductible to the extent allowed by law."
                  : "The wording your tax adviser gives you."
              }
            />
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={draft.religiousBenefits} onChange={(e) => set("religiousBenefits", e.target.checked)} />
          <span>
            This is a church. Receipts say no goods or services were given
            other than intangible religious benefits.
          </span>
        </label>
      </fieldset>
      {canEdit ? (
        <div className="flex items-center gap-3">
          <button type="submit" className="btn btn-primary px-4 py-2 text-sm" disabled={state === "saving"}>
            {state === "saving" ? "Saving…" : "Save"}
          </button>
          {state === "saved" ? (
            <span role="status" className="text-sm text-verified">Saved. New receipts use it.</span>
          ) : state !== "idle" && state !== "saving" ? (
            <span role="alert" className="text-sm">{state}</span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted">Only an administrator can change these.</p>
      )}
    </form>
  );
}
