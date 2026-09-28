"use client";

import { useParams } from "next/navigation";
import ArticleEditor from "@/components/journal/ArticleEditor";
import StudioShell from "@/components/journal/StudioShell";
import { useRequiredUser } from "@/lib/session";

export default function EditArticlePage() {
  const { id } = useParams<{ id: string }>();
  const user = useRequiredUser();
  if (!user) return null;
  return (
    <StudioShell user={user} title="Article">
      {/* A new key starts the editor afresh when moving between articles. */}
      <ArticleEditor key={id} user={user} articleId={id} />
    </StudioShell>
  );
}
