"use client";

import ArticleEditor from "@/components/journal/ArticleEditor";
import StudioShell from "@/components/journal/StudioShell";
import { useRequiredUser } from "@/lib/session";

export default function NewArticlePage() {
  const user = useRequiredUser();
  if (!user) return null;
  return (
    <StudioShell user={user} title="New article">
      <ArticleEditor user={user} articleId={null} />
    </StudioShell>
  );
}
