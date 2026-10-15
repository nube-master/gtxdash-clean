# Mobile-First Standards — Traffic OS

> Guia oficial de responsividade do Traffic OS. Toda nova UI deve seguir estes padrões.
> Desktop (≥1024px) NÃO pode regredir.

## ⚡ Adaptações automáticas (CSS global)

Já aplicadas em **todas as 33 páginas** via `src/index.css` (media query `<768px`):

| Item | Efeito mobile | Opt-out |
|------|--------------|---------|
| Gráficos Recharts | min-height 240px, fontes 10-12px, legenda 11px, tooltip 12px | — |
| Tabelas | font 13px, padding 8px lateral, white-space nowrap (scroll natural) | classe `no-mobile-scroll` |
| KPI grids 3-6 cols | viram 2 colunas | classe `keep-mobile-cols` |
| Headings h1/h2/h3 | reduzidos 1 step | classe `keep-mobile-size` |
| Dialogs | full-width 100vw, max-h 95vh | classe `responsive-modal-keep` |
| Botões h-8/h-9 | min-height 40px | classe `no-touch-min` |
| Layout container | px-3 py-4 pb-24 (auto via DashboardLayout) | — |

**Quando precisar desviar do default global**, aplique a classe opt-out correspondente.

## Breakpoints

Mobile-first (Tailwind padrão).

| Token | Largura | Uso |
|-------|---------|-----|
| (base) | < 640px | Mobile (target principal: 375px iPhone SE) |
| `sm:` | ≥ 640px | Mobile landscape |
| `md:` | ≥ 768px | Tablet — fim do mobile bottom nav |
| `lg:` | ≥ 1024px | Desktop — sidebar volta |
| `xl:` | ≥ 1280px | Desktop wide |

Hook canônico: `useIsMobile()` (`@/hooks/use-mobile`) → `true` quando `window.innerWidth < 768`.

## Navegação

- **Mobile (<768px)**: sem barra inferior. Navegação 100% no menu lateral (`MobileDrawer`),
  aberto pelo botão ☰ (hambúrguer) no topo do header. O badge de vendas novas fica sobre o ☰.
- **Desktop (≥768px)**: `<AppSidebar />` (shadcn). Inalterada.
- O drawer lateral expõe TODAS as abas (Dashboard, Analytics, Vendas, Criativos, Admin, etc.).
- Página com scroll: use `pb-8` (não mais `pb-24` — a barra inferior não existe mais).

## Tabelas pesadas — `<ResponsiveTable />`

```tsx
import { ResponsiveTable } from "@/components/ui/responsive-table";

<ResponsiveTable stickyFirstColumn minWidth={720}>
  <table className="w-full">
    <thead>
      <tr>
        <th className="sticky-col">Campanha</th>
        <th>Spend</th><th>Revenue</th><th>ROI</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td className="sticky-col">Campaign A</td>
        <td>R$ 100</td><td>R$ 250</td><td>150%</td>
      </tr>
    </tbody>
  </table>
</ResponsiveTable>
```

- `stickyFirstColumn` + classe `sticky-col` na primeira `<th>`/`<td>` de cada linha.
- `minWidth`: força scroll horizontal preservando densidade.

## Modais — `<ResponsiveModal />`

API espelha shadcn Dialog. Desktop = Dialog centralizado. Mobile = bottom Sheet 90vh com handle.

```tsx
import {
  ResponsiveModal, ResponsiveModalContent, ResponsiveModalHeader,
  ResponsiveModalTitle, ResponsiveModalFooter, ResponsiveModalTrigger,
} from "@/components/ui/responsive-modal";

<ResponsiveModal open={open} onOpenChange={setOpen}>
  <ResponsiveModalTrigger asChild><Button>Abrir</Button></ResponsiveModalTrigger>
  <ResponsiveModalContent size="lg">
    <ResponsiveModalHeader>
      <ResponsiveModalTitle>Editar Campanha</ResponsiveModalTitle>
    </ResponsiveModalHeader>
    {/* conteúdo */}
    <ResponsiveModalFooter>
      <Button onClick={save}>Salvar</Button>
    </ResponsiveModalFooter>
  </ResponsiveModalContent>
</ResponsiveModal>
```

Tamanhos desktop: `sm | md | lg | xl | full`.

## Filtros — `<FilterSheet />`

Desktop renderiza inline. Mobile vira botão "Filtros" + bottom sheet.

```tsx
import { FilterSheet } from "@/components/ui/filter-sheet";

<FilterSheet
  activeCount={appliedFilters.length}
  title="Filtros de Campanha"
  onApply={() => applyFilters()}
  onClear={() => clearFilters()}
  desktopClassName="hidden md:block w-64"
>
  <SelectProjeto />
  <SelectStatus />
  <DateRangePicker />
</FilterSheet>
```

## Gráficos (Recharts — 22 instâncias)

```tsx
<ResponsiveContainer width="100%" height={isMobile ? 240 : 320}>
  <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
    <XAxis dataKey="date" tick={{ fontSize: isMobile ? 10 : 12 }} />
    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 40 : 60} />
    <Tooltip wrapperStyle={{ fontSize: isMobile ? 12 : 14 }} />
    <Line dataKey="value" strokeWidth={2} dot={isMobile ? false : { r: 3 }} />
  </LineChart>
</ResponsiveContainer>
```

Regras:
- Altura mínima 240px em mobile.
- Margins ≤ 8px lateral em mobile.
- Fontes 10-12px (mobile) / 12-14px (desktop).
- Sem dots em mobile.
- Tooltip touch-friendly.

## Touch targets

- Mínimo **44×44px** (Apple HIG / WCAG 2.5.5). Use `min-h-[44px]` quando o ícone for menor.
- Inputs/selects em forms: `h-11` em mobile.

## Tipografia & Spacing

- Headings em mobile: reduzir 1 step (h1 4xl → 2xl).
- Containers: `px-4 md:px-6 lg:px-8`. Sections: `py-4 md:py-6`.
- Páginas com bottom nav: `pb-24 md:pb-0` para evitar conteúdo coberto.

## QA Checklist

Antes de marcar uma tela como "responsive done":
1. Chrome DevTools — iPhone SE (375), iPhone 14 Pro (393), Pixel 7 (412), iPad (768).
2. Sem scroll horizontal indesejado no `<body>`.
3. Bottom nav não cobre conteúdo (use `pb-24`).
4. Lighthouse Mobile ≥ 90 Perf, ≥ 95 A11y na rota `/dashboard`.
5. Desktop 1280×720 inalterado vs. baseline.
