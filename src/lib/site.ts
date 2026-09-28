/** The public address of the site. Links in shares and feeds are built from it. */
export const SITE_URL = (process.env.WEB_URL ?? "http://localhost:3230").replace(
  /\/$/,
  "",
);

export const SITE_NAME = "Faceless Angels";
