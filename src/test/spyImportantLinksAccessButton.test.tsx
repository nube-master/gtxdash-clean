import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LinkRow } from "@/components/spy/SpyImportantLinks";

/**
 * Regressão: o botão "Acessar" da Biblioteca de Anúncios precisa ser um <a>
 * com target="_blank" + rel="noopener noreferrer" para abrir fora do iframe
 * de preview. Sem isso, o Facebook devolve ERR_BLOCKED_BY_RESPONSE
 * (Cross-Origin-Opener-Policy bloqueia popups com opener).
 */
describe("SpyImportantLinks · botão Acessar", () => {
  const FB_URL = "https://www.facebook.com/ads/library/?id=123";

  function renderRow(href: string | null) {
    return render(
      <LinkRow
        icon={null}
        iconBg=""
        label="Biblioteca de Anúncios"
        subtitle="Criativos da campanha"
        href={href}
      />
    );
  }

  it("renderiza como <a> top-level com target=_blank e rel seguro", () => {
    renderRow(FB_URL);
    const link = screen.getByRole("link", { name: /acessar/i });
    expect(link.tagName).toBe("A");
    expect(link).toHaveAttribute("href", FB_URL);
    expect(link).toHaveAttribute("target", "_blank");
    // rel deve conter noopener (sem opener -> COOP do FB não dispara) e noreferrer
    const rel = link.getAttribute("rel") || "";
    expect(rel).toMatch(/noopener/);
    expect(rel).toMatch(/noreferrer/);
  });

  it("não chama window.open programático (evita abrir aba duplicada/travada)", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => ({} as any));
    renderRow(FB_URL);
    const link = screen.getByRole("link", { name: /acessar/i });
    fireEvent.click(link, { button: 0 });
    expect(openSpy).not.toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it("quando href é null, previne navegação (não vaza '#' como destino real)", () => {
    renderRow(null);
    const link = screen.getByRole("link", { name: /acessar/i });
    const evt = new MouseEvent("click", { bubbles: true, cancelable: true });
    link.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});
