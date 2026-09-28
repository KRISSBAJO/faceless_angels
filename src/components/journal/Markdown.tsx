import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { uniqueHeadingId } from "@/lib/journal";

interface HastNode {
  type: string;
  value?: string;
  children?: HastNode[];
}

/** The plain text of a heading, as articleHeadings reads it from the source. */
function textOf(node: HastNode | undefined): string {
  if (!node) return "";
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(textOf).join("");
}

// Only pictures uploaded through the Studio are shown. A picture address
// pointing anywhere else is dropped, so an article cannot load from, or
// report readers to, another site.
const OWN_PICTURE = /^\/api\/journal\/media\/[0-9a-f-]{36}$/i;

/**
 * Article text. Raw HTML in the source is shown as text, never run, and
 * links to other sites open in a new tab.
 */
export default function Markdown({ children }: { children: string }) {
  // Headings get addresses so the contents list can link to them.
  const seen = new Map<string, number>();
  const heading = (node: HastNode | undefined, text: React.ReactNode) => (
    <h2 id={uniqueHeadingId(textOf(node).trim(), seen)}>{text}</h2>
  );
  return (
    <div className="journal-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // The page already has an h1: the article's title.
          h1: ({ node, children: text }) => heading(node, text),
          h2: ({ node, children: text }) => heading(node, text),
          a: ({ href, children: text }) => {
            const outside = /^https?:\/\//.test(href ?? "");
            return (
              <a
                href={href}
                {...(outside ? { target: "_blank", rel: "noreferrer" } : {})}
              >
                {text}
              </a>
            );
          },
          // A picture stands alone in its paragraph, so the paragraph
          // becomes the figure.
          p: ({ node, children: content }) => {
            const only = node?.children.length === 1 ? node.children[0] : null;
            if (only?.type === "element" && only.tagName === "img") {
              return <>{content}</>;
            }
            return <p>{content}</p>;
          },
          img: ({ src, alt, title }) => {
            if (typeof src !== "string" || !OWN_PICTURE.test(src)) return null;
            return (
              <figure>
                {/* Served by our own API from storage. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={alt ?? ""} loading="lazy" />
                {title ? <figcaption>{title}</figcaption> : null}
              </figure>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
