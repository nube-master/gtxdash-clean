// Global patches that intercept BRL currency formatting and rewrite values + symbols
// into the user-selected display currency. Installed once at module load.
//
// Strategy
// --------
// 1. Wrap `Intl.NumberFormat` constructor: when called with `{style:'currency', currency:'BRL'}`,
//    return a formatter that converts the input (BRL) into the active display currency.
// 2. Wrap `Number.prototype.toLocaleString`: when called with locale 'pt-BR' AND
//    `{style:'currency', currency:'BRL'}` → convert + reformat in target currency.
//    When called with locale 'pt-BR' WITHOUT currency style → just convert the number
//    (so hardcoded "R$ " + toLocaleString patterns end up showing the converted number).
// 3. A MutationObserver replaces the literal "R$" prefix in text nodes with the active
//    currency symbol when the active currency is not BRL.

export type CurrencyCode = "BRL" | "USD" | "EUR";

interface CurrencyState {
  code: CurrencyCode;
  usdBrl: number;
  eurBrl: number;
}

const SYMBOL: Record<CurrencyCode, string> = { BRL: "R$", USD: "$", EUR: "€" };
const LOCALE: Record<CurrencyCode, string> = { BRL: "pt-BR", USD: "en-US", EUR: "de-DE" };

const STATE: CurrencyState = { code: "BRL", usdBrl: 5.15, eurBrl: 5.6 };

export function setGlobalCurrencyState(next: Partial<CurrencyState>) {
  if (next.code) STATE.code = next.code;
  if (typeof next.usdBrl === "number" && next.usdBrl > 0) STATE.usdBrl = next.usdBrl;
  if (typeof next.eurBrl === "number" && next.eurBrl > 0) STATE.eurBrl = next.eurBrl;
}

export function syncCurrencyDom() {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-display-currency", STATE.code);
    runSymbolSweep();
  }
}

function convertFromBRL(v: number): number {
  if (!Number.isFinite(v)) return v;
  // Backend returns BRL.
  // Division should only happen when the user selects USD.
  if (STATE.code === "USD") return v / STATE.usdBrl;
  if (STATE.code === "EUR") return v / STATE.eurBrl;
  // Default to BRL (return original value without division)
  return v;
}

let installed = false;

export function installCurrencyPatches() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  // ---- Patch Intl.NumberFormat ----------------------------------------------
  const OriginalNF = Intl.NumberFormat;
  function PatchedNF(locales?: any, options?: any) {
    const isBRL =
      options &&
      options.style === "currency" &&
      typeof options.currency === "string" &&
      options.currency.toUpperCase() === "BRL";

    if (!isBRL || STATE.code === "BRL") {
      // @ts-ignore
      return new OriginalNF(locales, options);
    }

    const targetOpts = { ...options, currency: STATE.code };
    const targetLocale = LOCALE[STATE.code];
    // @ts-ignore
    const inner = new OriginalNF(targetLocale, targetOpts);
    return {
      format: (v: number) => inner.format(convertFromBRL(Number(v))),
      formatToParts: (v: number) => inner.formatToParts(convertFromBRL(Number(v))),
      resolvedOptions: () => inner.resolvedOptions(),
    } as any;
  }
  PatchedNF.prototype = OriginalNF.prototype;
  // Preserve static helpers
  Object.setPrototypeOf(PatchedNF, OriginalNF);
  // @ts-ignore
  Intl.NumberFormat = PatchedNF as any;

  // ---- Patch Number.prototype.toLocaleString --------------------------------
  const originalToLocale = Number.prototype.toLocaleString;
  Number.prototype.toLocaleString = function (this: number, locales?: any, options?: any) {
    const localeStr = Array.isArray(locales) ? locales[0] : locales;
    const isPtBR = typeof localeStr === "string" && localeStr.toLowerCase().startsWith("pt");

    if (!isPtBR || STATE.code === "BRL") {
      return originalToLocale.call(this, locales, options);
    }

    const converted = convertFromBRL(Number(this));

    if (options && options.style === "currency") {
      const targetOpts = { ...options, currency: STATE.code };
      return originalToLocale.call(converted, LOCALE[STATE.code], targetOpts);
    }

    // No currency style → just convert the number, keep pt-BR locale formatting.
    return originalToLocale.call(converted, "pt-BR", options);
  };

  // ---- DOM symbol sweep -----------------------------------------------------
  const observer = new MutationObserver(() => runSymbolSweep());
  const start = () => {
    if (!document.body) return;
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    runSymbolSweep();
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
}

// Match "R$" optionally preceded by whitespace, only at word-ish boundaries
const SYMBOL_REGEX = /R\$/g;

function runSymbolSweep() {
  if (typeof document === "undefined") return;
  const target = SYMBOL[STATE.code];
  if (target === "R$") return; // fresh renders already contain BRL symbols
  const root = document.body;
  if (!root) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const v = node.nodeValue;
      if (!v || v.indexOf("R$") === -1) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      
      // Skip if data-monkey-patch-skip is true or any parent has it
      if (parent.closest('[data-monkey-patch-skip="true"]')) return NodeFilter.FILTER_REJECT;

      const tag = parent.tagName;
      if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA") return NodeFilter.FILTER_REJECT;
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  } as any);


  const nodes: Text[] = [];
  let n: Node | null;
  while ((n = walker.nextNode())) nodes.push(n as Text);
  for (const t of nodes) {
    if (t.nodeValue) t.nodeValue = t.nodeValue.replace(SYMBOL_REGEX, target);
  }
}
