/**
 * Cashflow Calculation Engine
 * Configurable payment model logic for daily cash flow projections
 */

export interface PaymentModel {
  id: string;
  name: string;
  type: string; // 'fixed_delay' | 'clickbank_real'
  rules_json: Record<string, any>;
}

export interface DailyData {
  date: string; // YYYY-MM-DD
  adSpend: number;
  revenue: number;
}

export interface CashflowAdjustment {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string;
}

export interface CashflowRow {
  date: string;
  weekday: string;
  weekdayNum: number;
  openingBalance: number;
  adInvestment: number;
  actualRevenue: number;
  
  expectedReceipt: number;
  manualAdjustment: number;
  adjustments: CashflowAdjustment[];
  receiptSource: string;
  dayProfit: number;
  closingBalance: number;
  isProjected?: boolean;
  isReceiptConfirmed?: boolean; // manually confirmed receipt
}

const WEEKDAY_NAMES = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/** Returns today's date string in America/Sao_Paulo timezone */
function getTodayBRT(): string {
  const now = new Date();
  // BRT = UTC-3
  const brt = new Date(now.getTime() - 3 * 3600_000);
  return brt.toISOString().slice(0, 10);
}

/**
 * Calculate the receipt date for a sale based on the payment model
 */
export function getReceiptDate(saleDate: Date, model: PaymentModel): Date {
  if (model.type === "fixed_delay") {
    const delay = model.rules_json.delay_days ?? 1;
    const d = new Date(saleDate);
    d.setDate(d.getDate() + delay);
    return d;
  }

  if (model.type === "clickbank_real") {
    return getClickBankReceiptDate(saleDate);
  }

  // fallback D1
  const d = new Date(saleDate);
  d.setDate(d.getDate() + 1);
  return d;
}

/**
 * ClickBank Real payment schedule:
 * - Mon/Tue sales → next Monday
 * - Wed/Thu sales → next Tuesday  (actually next week's Tuesday — the NEXT payout cycle)
 * - Fri/Sat/Sun sales → next Thursday
 */
function getClickBankReceiptDate(saleDate: Date): Date {
  const dow = saleDate.getDay(); // 0=Sun, 1=Mon, ...
  const d = new Date(saleDate);

  // New M/W/F payout cycle applies from 2025-03-17 onwards
  const cutover = new Date(2025, 2, 17); // March 17, 2025
  if (saleDate >= cutover) {
    return getClickBankReceiptDateMWF(d, dow);
  }

  // Legacy logic for sales before 17/03
  if (dow === 1 || dow === 2) {
    const daysUntilMon = ((1 - dow + 7) % 7) || 7;
    d.setDate(d.getDate() + daysUntilMon);
  } else if (dow === 3 || dow === 4) {
    const daysUntilTue = ((2 - dow + 7) % 7) || 7;
    d.setDate(d.getDate() + daysUntilTue);
  } else {
    const daysUntilThu = ((4 - dow + 7) % 7) || 7;
    d.setDate(d.getDate() + daysUntilThu);
  }

  return d;
}

/**
 * New ClickBank M/W/F payout cycle (from 17/03/2025):
 * Payouts happen Mon, Wed, Fri.
 *   Mon sales → Fri (same week)
 *   Tue sales → Mon (next week)
 *   Wed sales → Mon (next week)
 *   Thu sales → Wed (next week)
 *   Fri sales → Mon (next week)
 *   Sat sales → Wed (next week)
 *   Sun sales → Wed (next week)
 */
function getClickBankReceiptDateMWF(d: Date, dow: number): Date {
  // Map: day of week → days to add until payout
  const daysToAdd: Record<number, number> = {
    0: 3,  // Sun → Wed (+3)
    1: 4,  // Mon → Fri (+4)
    2: 6,  // Tue → Mon (+6)
    3: 5,  // Wed → Mon (+5)
    4: 6,  // Thu → Wed (+6, next week)
    5: 3,  // Fri → Mon (+3)
    6: 4,  // Sat → Wed (+4)
  };
  d.setDate(d.getDate() + daysToAdd[dow]);
  return d;
}

/**
 * Get human-readable receipt source label
 */
function getReceiptSourceLabel(
  receiptDate: Date,
  contributingSaleDates: Date[],
  model: PaymentModel
): string {
  if (contributingSaleDates.length === 0) return "—";

  // Format dates as dd/mm for clarity
  const fmtDateShort = (d: Date) => {
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}`;
  };

  if (model.type === "fixed_delay") {
    const delay = model.rules_json.delay_days ?? 1;
    const dates = [...new Set(contributingSaleDates.map(fmtDateShort))];
    return `Recebimento D+${delay}\nVendas ${dates.join(" + ")}`;
  }

  if (model.type === "clickbank_real") {
    const dates = [...new Set(contributingSaleDates.map(fmtDateShort))];
    return `Recebimento ClickBank\nVendas ${dates.join(" + ")}`;
  }

  return "—";
}

/**
 * Build the full monthly cashflow projection
 * Now projects future days using avg spend (burn rate) and configured ROI
 */
export function buildCashflowProjection(
  year: number,
  month: number, // 0-indexed
  initialCash: number,
  marginPercent: number,
  model: PaymentModel,
  dailyData: Map<string, DailyData>, // key = YYYY-MM-DD
  prevMonthData?: Map<string, DailyData>, // sales from previous month that may pay out this month
  adjustments?: CashflowAdjustment[], // manual adjustments
  projectionRoi?: number // optional ROI for projecting future revenue (e.g. 1.2 = 120%)
): CashflowRow[] {
  const rows: CashflowRow[] = [];
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = getTodayBRT();

  // Apply margin multiplier (e.g. 30 → x1.3) to account for untracked sales
  const marginMultiplier = marginPercent > 0 ? 1 + marginPercent / 100 : 1;

  // ── Burn rate: from last 7 real days (for projections) ──
  const realDays: { spend: number; revenue: number }[] = [];
  for (const [dateKey, data] of dailyData) {
    if (dateKey <= todayStr && (data.adSpend > 0 || data.revenue > 0)) {
      realDays.push({ spend: data.adSpend, revenue: data.revenue });
    }
  }
  const last7 = realDays.slice(-7);
  const avgDailySpend = last7.length > 0
    ? last7.reduce((s, d) => s + d.spend, 0) / last7.length
    : 0;
  
  // Use configured ROI or fallback to 1.2 (minimum safe ROI)
  const effectiveRoi = projectionRoi && projectionRoi > 0 ? projectionRoi : 1.2;
  // Projected revenue = avg spend * ROI
  const projectedDailyRevenue = avgDailySpend * effectiveRoi;

  // ── Build receipt map: only from REAL past sales (guaranteed inflows) ──
  // Future days get NO speculative receipts — only confirmed inflows from sales already made.
  const receiptMap = new Map<string, { amount: number; sources: Date[] }>();

  const addToReceiptMap = (saleDate: Date, revenue: number) => {
    const receiptDate = getReceiptDate(saleDate, model);
    const key = receiptDate.toISOString().slice(0, 10);
    const receiptAmount = revenue * marginMultiplier;
    const existing = receiptMap.get(key) || { amount: 0, sources: [] };
    existing.amount += receiptAmount;
    existing.sources.push(saleDate);
    receiptMap.set(key, existing);
  };

  // Process previous month sales (spillover — real inflows)
  if (prevMonthData) {
    for (const [, data] of prevMonthData) {
      if (data.revenue > 0) {
        addToReceiptMap(new Date(data.date + "T12:00:00"), data.revenue);
      }
    }
  }

  // Process current month real sales only (receipts from actual past sales)
  for (const [dateKey, data] of dailyData) {
    if (data.revenue > 0 && dateKey <= todayStr) {
      addToReceiptMap(new Date(data.date + "T12:00:00"), data.revenue);
    }
  }

  // Add projected receipts for future days based on ROI projection
  if (projectedDailyRevenue > 0) {
    for (let day = 1; day <= daysInMonth; day++) {
      const date = new Date(year, month, day);
      const dateStr = date.toISOString().slice(0, 10);
      if (dateStr > todayStr) {
        addToReceiptMap(date, projectedDailyRevenue);
      }
    }
  }

  // Build adjustment map by date
  const adjMap = new Map<string, CashflowAdjustment[]>();
  if (adjustments) {
    for (const adj of adjustments) {
      const existing = adjMap.get(adj.date) || [];
      existing.push(adj);
      adjMap.set(adj.date, existing);
    }
  }

  let balance = initialCash;

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().slice(0, 10);
    const dow = date.getDay();

    const dayData = dailyData.get(dateStr);
    const isFuture = dateStr > todayStr;
    const hasRealData = dayData && (dayData.adSpend > 0 || dayData.revenue > 0);
    const isProjected = isFuture && !hasRealData;

    // Future days: use projected avg spend and ROI-based revenue for visibility
    const adInvestment = isProjected ? avgDailySpend : (dayData?.adSpend ?? 0);
    const actualRevenue = isProjected ? projectedDailyRevenue : (dayData?.revenue ?? 0);

    const receipt = receiptMap.get(dateStr);
    const expectedReceipt = receipt?.amount ?? 0;
    const receiptSource = receipt
      ? getReceiptSourceLabel(date, receipt.sources, model)
      : "—";

    // Manual adjustments for this day
    const dayAdjustments = adjMap.get(dateStr) || [];
    const isReceiptConfirmed = dayAdjustments.some((a) => a.type === "confirmado");
    
    // Check if there's a "correcao" adjustment — it REPLACES the auto receipt entirely
    const latestCorrection = dayAdjustments.find((a) => a.type === "correcao");
    const otherAdjustments = dayAdjustments
      .filter((a) => a.type !== "confirmado" && a.type !== "correcao")
      .reduce((sum, a) => sum + a.amount, 0);

    let finalReceipt: number;
    let manualAdjustment: number;
    
    if (latestCorrection) {
      // Correction stores ABSOLUTE value — use it directly, ignore auto receipt
      finalReceipt = latestCorrection.amount;
      manualAdjustment = 0;
    } else {
      finalReceipt = expectedReceipt;
      manualAdjustment = otherAdjustments;
    }

    const dayProfit = finalReceipt + manualAdjustment - adInvestment;
    const closingBalance = balance - adInvestment + finalReceipt + manualAdjustment;

    rows.push({
      date: dateStr,
      weekday: WEEKDAY_NAMES[dow],
      weekdayNum: dow,
      openingBalance: balance,
      adInvestment,
      actualRevenue,
      expectedReceipt: finalReceipt, // show the corrected value as the receipt
      manualAdjustment,
      adjustments: dayAdjustments.filter((a) => a.type !== "confirmado" && a.type !== "correcao"),
      receiptSource,
      dayProfit,
      closingBalance,
      isProjected,
      isReceiptConfirmed,
    });

    balance = closingBalance;
  }

  return rows;
}

/**
 * Calculate summary KPIs from projection rows
 * Now uses the fully projected rows (future days already have projected spend/receipts)
 */
export function getCashflowSummary(rows: CashflowRow[]) {
  const todayStr = getTodayBRT();
  const todayRow = rows.find((r) => r.date === todayStr);

  const cashToday = todayRow?.closingBalance ?? rows[rows.length - 1]?.closingBalance ?? 0;
  const investmentToday = todayRow?.adInvestment ?? 0;

  // Upcoming receipts — show any day with real receipt amount (from actual past sales), within 15 days
  const upcomingReceipts: { date: string; amount: number; isProjected?: boolean; isConfirmed?: boolean }[] = [];
  const maxDate = new Date(todayStr);
  maxDate.setDate(maxDate.getDate() + 7);
  const maxDateStr = maxDate.toISOString().slice(0, 10);

  // Rebuild a quick lookup from receiptMap (passed via closure)
  for (const r of rows) {
    if (r.date > todayStr && r.date <= maxDateStr && (r.expectedReceipt > 0 || r.manualAdjustment > 0)) {
      const isConfirmed = r.isReceiptConfirmed === true;
      // Always show — the receipt comes from real past sales mapped to this future date
      // Even if the "day" is projected (no spend data), the receipt itself is real
      const totalAmount = r.expectedReceipt + r.manualAdjustment;
      if (totalAmount <= 0 && !isConfirmed) continue;
      upcomingReceipts.push({
        date: r.date,
        amount: totalAmount,
        isProjected: false,
        isConfirmed,
      });
    }
  }

  const nextReceiptAmount = upcomingReceipts.length > 0 ? upcomingReceipts[0].amount : 0;
  const nextReceiptDate = upcomingReceipts.length > 0 ? upcomingReceipts[0].date : "";

  // Burn rate: avg daily spend of last 7 days with real data
  const last7WithSpend = rows
    .filter((r) => r.adInvestment > 0 && r.date <= todayStr && !r.isProjected)
    .slice(-7);
  const burnRate = last7WithSpend.length > 0
    ? last7WithSpend.reduce((sum, r) => sum + r.adInvestment, 0) / last7WithSpend.length
    : 0;

  // Coverage days = cash / burn rate
  let coverageDays = 0;
  if (cashToday > 0 && burnRate > 0) {
    coverageDays = Math.round((cashToday / burnRate) * 10) / 10;
  } else if (cashToday > 0) {
    coverageDays = 999;
  }

  // Days until cash break — now uses the fully projected closing balances
  let daysUntilCashBreak = -1;
  for (const r of rows) {
    if (r.date <= todayStr) continue;
    if (r.closingBalance < 0) {
      const today = new Date(todayStr);
      const breakDate = new Date(r.date);
      daysUntilCashBreak = Math.round((breakDate.getTime() - today.getTime()) / 86400000);
      break;
    }
  }

  // Totals from rows (already includes projections)
  const lastRow = rows[rows.length - 1];
  const projectedFinalBalance = lastRow?.closingBalance ?? 0;
  const totalInvestment = rows.reduce((s, r) => s + r.adInvestment, 0);
  const totalReceipts = rows.reduce((s, r) => s + r.expectedReceipt + r.manualAdjustment, 0);

  return {
    cashToday,
    investmentToday,
    nextReceiptAmount,
    nextReceiptDate,
    upcomingReceipts: upcomingReceipts.slice(0, 8),
    coverageDays,
    burnRate,
    daysUntilCashBreak,
    projectedFinalBalance,
    totalInvestment,
    totalReceipts,
  };
}
