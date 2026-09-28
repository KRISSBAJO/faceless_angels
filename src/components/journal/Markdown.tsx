import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Only pictures uploaded through the Studio are shown. A picture address
// pointing anywhere else is dropped, so an article cannot load from, or
// report readers to, another site.
const OWN_PICTURE = /^\/api\/journal\/media\/[0-9a-f-]{36}$/i;

/**
 * Article text. Raw HTML in the source is shown as text, never run, and
 * links to other sites open in a new tab.
 */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="journal-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // The page already has an h1: the article's title.
          h1: ({ children: text }) => <h2>{text}</h2>,
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
