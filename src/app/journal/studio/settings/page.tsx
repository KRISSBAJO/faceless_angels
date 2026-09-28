"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Field, FormError } from "@/components/Field";
import StudioShell, { JOURNAL_STAFF } from "@/components/journal/StudioShell";
import { api, errorMessage } from "@/lib/api";
import { mediaUrl, type StudioCategory, type StudioSeries } from "@/lib/journal";
import { useRequiredUser } from "@/lib/session";

interface Byline {
  displayName: string;
  title: string;
  bio: string;
  photoMediaId: string | null;
  set: boolean;
}

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex max-w-3xl flex-col gap-4 border-t border-line pt-6">
      <div className="flex flex-col gap-1">
        <h2 className="font-serif text-2xl">{title}</h2>
        <p className="text-sm leading-6 text-muted">{intro}</p>
      </div>
      {children}
    </section>
  );
}

/** Saves a small form and reports what happened beside its button. */
function useSaver(reload: () => Promise<unknown>) {
  const [state, setState] = useState<"idle" | "saved" | string>("idle");
  const [busy, setBusy] = useState(false);
  async function save(action: () => Promise<unknown>) {
    setBusy(true);
    setState("idle");
    try {
      await action();
      await reload();
      setState("saved");
      return true;
    } catch (err) {
      setState(errorMessage(err));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const status =
    state === "saved" ? (
      <span role="status" className="text-sm text-verified">
        Saved
      </span>
    ) : state !== "idle" ? (
      <span role="alert" className="text-sm">
        {state}
      </span>
    ) : null;
  return { save, busy, status };
}

function SeriesRow({
  series,
  reload,
}: {
  series: StudioSeries | null;
  reload: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const { save, busy, status } = useSaver(reload);
  const id = series?.id ?? "new-series";

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formEl = event.currentTarget;
        const data = new FormData(formEl);
        void save(() =>
          api(
            series
              ? `/journal/studio/series/${series.id}`
              : "/journal/studio/series",
            {
              method: series ? "PATCH" : "POST",
              body: {
                title: String(data.get("title")).trim(),
                description: String(data.get("description")).trim(),
              },
            },
          ),
        ).then((ok) => {
          if (ok && !series) {
            formEl.reset();
            setOpen(false);
          }
        });
      }}
      className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5"
    >
      <Field id={`${id}-title`} label="Title">
        <input
          id={`${id}-title`}
          name="title"
          className="input"
          defaultValue={series?.title}
          required
          minLength={3}
          maxLength={120}
        />
      </Field>
      <Field id={`${id}-description`} label="What the series covers">
        <textarea
          id={`${id}-description`}
          name="description"
          className="input"
          rows={2}
          defaultValue={series?.description}
          required
          minLength={10}
          maxLength={600}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-4">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {series ? "Save" : "Add series"}
        </button>
        {status}
      </div>
    </form>
  );

  if (!series) {
    return open ? (
      form
    ) : (
      <div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(true)}
        >
          Add a series
        </button>
      </div>
    );
  }

  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className="font-medium">{series.title}</span>
        <span className="flex gap-4 text-sm">
          <span className="text-muted tabular-nums">
            {series.articles === 1 ? "1 article" : `${series.articles} articles`}
          </span>
          <button
            type="button"
            className="underline underline-offset-4"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : "Change"}
          </button>
        </span>
      </div>
      {open ? <div className="pt-4">{form}</div> : null}
    </li>
  );
}

function CategoryRow({
  category,
  reload,
}: {
  category: StudioCategory | null;
  reload: () => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const { save, busy, status } = useSaver(reload);
  const id = category?.key ?? "new-category";

  const form = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const formEl = event.currentTarget;
        const data = new FormData(formEl);
        void save(() =>
          api(
            category
              ? `/journal/studio/categories/${category.key}`
              : "/journal/studio/categories",
            {
              method: category ? "PATCH" : "POST",
              body: {
                label: String(data.get("label")).trim(),
                description: String(data.get("description")).trim(),
                ...(category
                  ? {
                      enabled: data.get("enabled") === "on",
                      sort: Number(data.get("sort")),
                    }
                  : {}),
              },
            },
          ),
        ).then((ok) => {
          if (ok && !category) {
            formEl.reset();
            setOpen(false);
          }
        });
      }}
      className="grid gap-4 rounded-xl border border-line bg-surface p-5 sm:grid-cols-2"
    >
      <Field id={`${id}-label`} label="Name">
        <input
          id={`${id}-label`}
          name="label"
          className="input"
          defaultValue={category?.label}
          required
          minLength={2}
          maxLength={40}
        />
      </Field>
      <Field id={`${id}-description`} label="Short description">
        <input
          id={`${id}-description`}
          name="description"
          className="input"
          defaultValue={category?.description}
          required
          minLength={5}
          maxLength={200}
        />
      </Field>
      {category ? (
        <>
          <Field
            id={`${id}-sort`}
            label="Order"
            hint="Lower numbers come first."
          >
            <input
              id={`${id}-sort`}
              name="sort"
              type="number"
              className="input"
              defaultValue={category.sort}
              min={0}
              max={10000}
              required
            />
          </Field>
          <label className="flex items-center gap-3 self-end pb-3">
            <input
              id={`${id}-enabled`}
              name="enabled"
              type="checkbox"
              className="size-4"
              defaultChecked={category.enabled}
            />
            Show this category to readers
          </label>
        </>
      ) : null}
      <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {category ? "Save" : "Add category"}
        </button>
        {status}
      </div>
    </form>
  );

  if (!category) {
    return open ? (
      form
    ) : (
      <div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setOpen(true)}
        >
          Add a category
        </button>
      </div>
    );
  }

  return (
    <li className="border-t border-line py-4 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span className={category.enabled ? "font-medium" : "text-muted"}>
          {category.label}
          {category.enabled ? "" : " (hidden)"}
        </span>
        <span className="flex gap-4 text-sm">
          <span className="text-muted tabular-nums">
            {category.articles === 1
              ? "1 article"
              : `${category.articles} articles`}
          </span>
          <button
            type="button"
            className="underline underline-offset-4"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? "Close" : "Change"}
          </button>
        </span>
      </div>
      {open ? <div className="pt-4">{form}</div> : null}
    </li>
  );
}

export default function StudioSettingsPage() {
  const user = useRequiredUser();
  const [byline, setByline] = useState<Byline | null>(null);
  const [series, setSeries] = useState<StudioSeries[]>([]);
  const [categories, setCategories] = useState<StudioCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const staff = !!user && JOURNAL_STAFF.includes(user.role);
  const canManage = user?.role === "editor" || user?.role === "admin";

  const load = useCallback(
    () =>
      Promise.all([
        api<Byline>("/journal/studio/byline"),
        api<StudioSeries[]>("/journal/studio/series"),
        api<StudioCategory[]>("/journal/studio/categories"),
      ]).then(([b, s, c]) => {
        setByline(b);
        setSeries(s);
        setCategories(c);
      }),
    [],
  );

  useEffect(() => {
    if (!staff) return;
    load().catch((err) => setError(errorMessage(err)));
  }, [staff, load]);

  const bylineSaver = useSaver(load);
  // Undefined until the person picks or removes a photo in this visit.
  const [photo, setPhoto] = useState<string | null | undefined>(undefined);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const shownPhoto = photo === undefined ? byline?.photoMediaId : photo;

  async function uploadPhoto(file: File | undefined) {
    if (!file) return;
    setPhotoError(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const media = await api<{ id: string }>("/journal/studio/media", {
        body: form,
      });
      setPhoto(media.id);
    } catch (err) {
      setPhotoError(errorMessage(err));
    }
  }

  if (!user) return null;

  return (
    <StudioShell user={user} title="Series, categories, byline">
      <FormError message={error} />

      {byline ? (
        <Section
          title="Your byline"
          intro="How you are named on what you write. Your account name stays private."
        >
          <form
            key={`${byline.displayName}-${byline.set}-${byline.photoMediaId}`}
            onSubmit={(event) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              void bylineSaver.save(() =>
                api("/journal/studio/byline", {
                  method: "PUT",
                  body: {
                    displayName: String(data.get("displayName")).trim(),
                    title: String(data.get("title")).trim() || undefined,
                    bio: String(data.get("bio")).trim() || undefined,
                    photoMediaId: shownPhoto ?? null,
                  },
                }),
              );
            }}
            className="grid gap-4 sm:grid-cols-2"
          >
            <div className="flex flex-wrap items-center gap-5 sm:col-span-2">
              {shownPhoto ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaUrl(shownPhoto)}
                  alt="Your photo"
                  className="size-20 rounded-full object-cover"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className="flex size-20 items-center justify-center rounded-full bg-line font-serif text-3xl"
                >
                  {byline.displayName.slice(0, 1)}
                </span>
              )}
              <div className="flex min-w-56 flex-1 flex-col gap-2">
                <label
                  htmlFor="byline-photo"
                  className="text-sm font-medium"
                >
                  Your photo (optional)
                </label>
                <input
                  id="byline-photo"
                  type="file"
                  className="input"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) =>
                    void uploadPhoto(event.target.files?.[0])
                  }
                />
                <span className="text-sm text-muted">
                  JPG, PNG, or WebP, up to 5 MB. Shown beside your articles.
                  Save the byline to keep it.
                </span>
                {shownPhoto ? (
                  <button
                    type="button"
                    className="self-start text-sm text-muted underline underline-offset-4"
                    onClick={() => setPhoto(null)}
                  >
                    Remove the photo
                  </button>
                ) : null}
                {photoError ? (
                  <span role="alert" className="text-sm">
                    {photoError}
                  </span>
                ) : null}
              </div>
            </div>
            <Field id="displayName" label="Name shown">
              <input
                id="displayName"
                name="displayName"
                className="input"
                defaultValue={byline.displayName}
                required
                minLength={2}
                maxLength={80}
              />
            </Field>
            <Field id="title" label="Title (optional)">
              <input
                id="title"
                name="title"
                className="input"
                placeholder="Pastor, Grace Fellowship"
                defaultValue={byline.title}
                maxLength={80}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field id="bio" label="A few lines about you (optional)">
                <textarea
                  id="bio"
                  name="bio"
                  className="input"
                  rows={3}
                  defaultValue={byline.bio}
                  maxLength={600}
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={bylineSaver.busy}
              >
                Save byline
              </button>
              {bylineSaver.status}
            </div>
          </form>
        </Section>
      ) : null}

      <Section
        title="Series"
        intro="A series groups articles that are read in order."
      >
        {series.length > 0 ? (
          <ul className="flex flex-col">
            {series.map((s) => (
              <SeriesRow key={s.id} series={s} reload={load} />
            ))}
          </ul>
        ) : null}
        <SeriesRow series={null} reload={load} />
      </Section>

      <Section
        title="Categories"
        intro={
          canManage
            ? "What the Journal is sorted by. Hiding a category keeps its articles but takes it off the menus."
            : "Editors and administrators can change these."
        }
      >
        <ul className="flex flex-col">
          {categories.map((category) =>
            canManage ? (
              <CategoryRow
                key={category.key}
                category={category}
                reload={load}
              />
            ) : (
              <li
                key={category.key}
                className="flex justify-between gap-4 border-t border-line py-3 text-sm first:border-t-0"
              >
                <Link href={`/journal/category/${category.key}`}>
                  {category.label}
                </Link>
                <span className="text-muted tabular-nums">
                  {category.articles}
                </span>
              </li>
            ),
          )}
        </ul>
        {canManage ? <CategoryRow category={null} reload={load} /> : null}
      </Section>
    </StudioShell>
  );
}
