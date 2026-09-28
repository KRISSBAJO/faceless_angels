"use client";

import { useOptionalUser } from "@/lib/session";
import SiteHeader from "./SiteHeader";

/** The shared header on the home page, which is rendered on the server. */
export default function HomeHeader() {
  const { user } = useOptionalUser();
  return <SiteHeader user={user} wide />;
}
