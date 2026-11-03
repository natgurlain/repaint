// A small CSS tokenizer for the editor's syntax highlighting. It is forgiving by design: any input produces
// tokens whose text concatenates back to the exact source, so the highlighted layer always lines up with the textarea.

export type TokenType =
  | "comment"
  | "string"
  | "at"
  | "selector"
  | "property"
  | "value"
  | "number"
  | "color"
  | "important"
  | "punct"
  | "space";

export interface Token {
  type: TokenType;
  text: string;
}

const COLOR_FN = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/i;
const NUMBER = /^-?(?:\d+\.?\d*|\.\d+)(?:[a-z%]+)?/i;
const HEX = /^#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![0-9a-z_-])/i;

export function tokenize(css: string): Token[] {
  const tokens: Token[] = [];
  const push = (type: TokenType, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.type === type && (type === "space" || type === "selector" || type === "value")) last.text += text;
    else tokens.push({ type, text });
  };
  let i = 0;
  let depth = 0;
  // Inside a block we are either before a property name or in its value (after the colon).
  let inValue = false;

  while (i < css.length) {
    const rest = css.slice(i);
    const c = css[i]!;

    if (rest.startsWith("/*")) {
      const end = css.indexOf("*/", i + 2);
      const stop = end < 0 ? css.length : end + 2;
      push("comment", css.slice(i, stop));
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < css.length && css[j] !== c && css[j] !== "\n") j += css[j] === "\\" ? 2 : 1;
      const stop = Math.min(css.length, j + 1);
      push("string", css.slice(i, stop));
      i = stop;
      continue;
    }
    if (/\s/.test(c)) {
      const m = /^\s+/.exec(rest)!;
      push("space", m[0]);
      i += m[0].length;
      continue;
    }
    if (c === "{" || c === "}" || c === ";" || (c === ":" && depth > 0 && !inValue && isPropertyColon(css, i))) {
      push("punct", c);
      if (c === "{") (depth++, (inValue = false));
      else if (c === "}") (depth = Math.max(0, depth - 1), (inValue = false));
      else if (c === ";") inValue = false;
      else inValue = true;
      i++;
      continue;
    }
    if (c === "@") {
      const m = /^@[\w-]+/.exec(rest);
      if (m) {
        push("at", m[0]);
        i += m[0].length;
        continue;
      }
    }

    if (inValue) {
      if (rest.startsWith("!")) {
        const m = /^!\s*important/i.exec(rest);
        if (m) {
          push("important", m[0]);
          i += m[0].length;
          continue;
        }
      }
      const hex = HEX.exec(rest);
      if (hex) {
        push("color", hex[0]);
        i += hex[0].length;
        continue;
      }
      if (COLOR_FN.test(rest)) {
        let j = rest.indexOf("(") + 1;
        let open = 1;
        while (j < rest.length && open > 0 && rest[j] !== ";" && rest[j] !== "}") {
          if (rest[j] === "(") open++;
          else if (rest[j] === ")") open--;
          j++;
        }
        push("color", rest.slice(0, j));
        i += j;
        continue;
      }
      const num = NUMBER.exec(rest);
      if (num && !/[\w-]/.test(css[i - 1] ?? "")) {
        push("number", num[0]);
        i += num[0].length;
        continue;
      }
      push("value", c);
      i++;
      continue;
    }

    if (depth > 0 && isPropertyStart(css, i)) {
      const m = /^[\w-]+/.exec(rest);
      if (m) {
        push("property", m[0]);
        i += m[0].length;
        continue;
      }
    }
    push("selector", c);
    i++;
  }
  return tokens;
}

/** Inside a block, a word is a property if a ":" comes before any "{", ";" or "}" (otherwise it's a nested selector). */
function isPropertyStart(css: string, i: number): boolean {
  for (let j = i; j < css.length; j++) {
    const c = css[j];
    if (c === ":") return /^[\w-]+\s*$/.test(css.slice(i, j));
    if (c === "{" || c === ";" || c === "}") return false;
  }
  return false;
}

/** A ":" inside a block separates property and value unless the declaration is really a nested selector like a:hover {. */
function isPropertyColon(css: string, i: number): boolean {
  for (let j = i + 1; j < css.length; j++) {
    const c = css[j];
    if (c === ";" || c === "}") return true;
    if (c === "{") return false;
  }
  return true;
}

function escape(text: string): string {
  return text.replace(/[&<>]/g, (c) => (c === "&" ? "&amp;" : c === "<" ? "&lt;" : "&gt;"));
}

/** Highlighted HTML for the editor's backdrop layer. Colors get an underline swatch that takes no extra width. */
export function highlight(css: string): string {
  let html = "";
  for (const t of tokenize(css)) {
    if (t.type === "space") html += escape(t.text);
    else if (t.type === "color") html += `<span class="tok-color" style="--swatch:${escape(t.text).replace(/"/g, "")}">${escape(t.text)}</span>`;
    else html += `<span class="tok-${t.type}">${escape(t.text)}</span>`;
  }
  // A trailing newline needs a character after it or the last empty line collapses and the layers drift apart.
  return `${html}\n`;
}
