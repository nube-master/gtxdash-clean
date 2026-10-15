type HourlySpendRow = {
  account_id: string | null;
  date: string;
  hour: number;
  spend: number;
  /** Investimento já convertido para BRL — fonte autoritativa */
  spend_brl?: number | null;
  clicks?: number;
  inline_link_clicks?: number;
  initiate_checkout?: number;
  landing_page_views?: number;
  fb_pixel_initiate_checkout?: number;
  campaign_name?: string;
};

type AccountTimezoneRow = {
  account_id: string;
  timezone: string | null;
};

type NormalizedSpendRow = {
  sp_date: string;
  total_spend: number;
};

const SAO_PAULO_TZ = "America/Sao_Paulo";

function addDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function convertLocalHourToBrt(localDate: string, localHour: number, timezone: string) {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric', second: 'numeric',
      hour12: false
    });
    
    const now = new Date();
    const parts = formatter.formatToParts(now);
    const dateInTZ = new Date(
      Number(parts.find(p => p.type === 'year')?.value),
      Number(parts.find(p => p.type === 'month')?.value) - 1,
      Number(parts.find(p => p.type === 'day')?.value),
      Number(parts.find(p => p.type === 'hour')?.value),
      Number(parts.find(p => p.type === 'minute')?.value)
    );
    const offsetMs = dateInTZ.getTime() - now.getTime();
    
    const localTimeAsDate = new Date(`${localDate}T${String(localHour).padStart(2, "0")}:00:00`);
    const utcInstant = new Date(localTimeAsDate.getTime() - offsetMs);

    return {
      brtDate: new Intl.DateTimeFormat("en-CA", { timeZone: SAO_PAULO_TZ }).format(utcInstant),
      brtHour: parseInt(
        new Intl.DateTimeFormat("en-US", {
          timeZone: SAO_PAULO_TZ,
          hour: "numeric",
          hour12: false,
        }).format(utcInstant),
        10,
      ),
    };
  } catch (err) {
    console.error("[Hourly] TZ conversion error:", err);
    return {
      brtDate: localDate,
      brtHour: localHour,
    };
  }
}

export function getHourlySpendFetchBounds(startDate: string, endDate: string) {
  return {
    fetchStartDate: addDays(startDate, -1),
    fetchEndDate: addDays(endDate, 1),
  };
}

export function buildNormalizedHourlySpend(
  hourlyRows: HourlySpendRow[],
  accountTimezones: AccountTimezoneRow[],
  normalizedDailySpend: NormalizedSpendRow[],
  startDate: string,
  endDate: string,
  rawIcEvents?: { occurred_at: string; operation_id: string }[],
  isEscolaDolar?: boolean,
  authoritativeIcTotal?: number
) {
  const timezoneByAccount = new Map(
    accountTimezones.map((account) => [account.account_id, account.timezone || SAO_PAULO_TZ]),
  );

  const rawHourlyByDate = new Map<string, Map<number, { spend: number; clicks: number; ic: number; lpv: number }>>();
  const rawDailyTotals = new Map<string, number>();

  const rtIcByBrtHour = new Map<string, Map<number, number>>();
  if (rawIcEvents && rawIcEvents.length > 0) {
    for (const event of rawIcEvents) {
      const ts = event.occurred_at;
      const d = new Date(ts);
      const brtDate = new Intl.DateTimeFormat("en-CA", { timeZone: SAO_PAULO_TZ }).format(d);
      const brtHour = parseInt(
        new Intl.DateTimeFormat("en-US", { timeZone: SAO_PAULO_TZ, hour: "numeric", hour12: false }).format(d),
        10
      );
      
      const dayMap = rtIcByBrtHour.get(brtDate) || new Map<number, number>();
      dayMap.set(brtHour, (dayMap.get(brtHour) || 0) + 1);
      rtIcByBrtHour.set(brtDate, dayMap);
    }
  }

  for (const row of hourlyRows) {
    const timezone = timezoneByAccount.get(row.account_id || "") || SAO_PAULO_TZ;
    // SEMPRE spend_brl: a coluna `spend` vem na moeda da conta (USD/EUR) e subnotificava ~5x
    const spend = Number(row.spend_brl ?? row.spend ?? 0);
    const clicks = Number(row.clicks || row.inline_link_clicks || 0);
    // IMPORTANTE: traffic_data_hourly usa 'fb_pixel_initiate_checkout' para ICs nativos do Meta
    // O campo 'initiate_checkout' geralmente vem do RedTrack se injetado.
    const rowIc = Number(row.fb_pixel_initiate_checkout || row.initiate_checkout || 0);
    const lpv = Number(row.landing_page_views || 0);
    
    // Mesmo que o spend seja 0, queremos processar a hora se houver cliques ou ICs
    if (spend === 0 && clicks === 0 && rowIc === 0 && lpv === 0) continue;

    const { brtDate, brtHour } = convertLocalHourToBrt(row.date, Number(row.hour), timezone);
    if (brtDate < startDate || brtDate > endDate || brtHour < 0 || brtHour > 23) continue;

    const dayMap = rawHourlyByDate.get(brtDate) || new Map<number, { spend: number; clicks: number; ic: number; lpv: number }>();
    const existing = dayMap.get(brtHour) || { spend: 0, clicks: 0, ic: 0, lpv: 0 };
    existing.spend += spend;
    existing.clicks += clicks;
    existing.ic += rowIc;
    existing.lpv += lpv;
    dayMap.set(brtHour, existing);
    rawHourlyByDate.set(brtDate, dayMap);
    
    if (spend > 0) {
      rawDailyTotals.set(brtDate, (rawDailyTotals.get(brtDate) || 0) + spend);
    }
  }

  // Second pass: Ensure hours with granular events but NO traffic rows are also in rawHourlyByDate
  if (rtIcByBrtHour.size > 0) {
    for (const [date, hours] of rtIcByBrtHour.entries()) {
      if (date < startDate || date > endDate) continue;
      const dayMap = rawHourlyByDate.get(date) || new Map<number, { spend: number; clicks: number; ic: number; lpv: number }>();
      for (const [hour, count] of hours.entries()) {
        if (!dayMap.has(hour)) {
          // Note: we set ic to 0 here because it will be added from granularIcs in the aggregation loop
          dayMap.set(hour, { spend: 0, clicks: 0, ic: 0, lpv: 0 });
        }
      }
      rawHourlyByDate.set(date, dayMap);
    }
  }


  const aggregatedByHour = new Map<number, { spend: number; clicks: number; ic: number; lpv: number }>();
  const allDates = new Set([
    ...Array.from(rawHourlyByDate.keys()),
    ...normalizedDailySpend.map(d => d.sp_date)
  ]);

  for (const date of allDates) {
    const dailyNormalizedRow = normalizedDailySpend.find(d => d.sp_date === date);
    const dailyNormalizedSpend = dailyNormalizedRow ? Number(dailyNormalizedRow.total_spend) : 0;
    
    const hourlyMap = rawHourlyByDate.get(date);
    const dailyRawSpend = rawDailyTotals.get(date) || 0;

    if (hourlyMap) {
      const scale = dailyRawSpend > 0 ? dailyNormalizedSpend / dailyRawSpend : 1;
      
      for (const [hour, data] of hourlyMap.entries()) {
        const existing = aggregatedByHour.get(hour) || { spend: 0, clicks: 0, ic: 0, lpv: 0 };
        existing.spend += data.spend * scale;
        existing.clicks += data.clicks;
        
        const granularIcs = rtIcByBrtHour.get(date)?.get(hour) ?? 0;
        existing.ic += (granularIcs > 0) ? granularIcs : (data.ic || 0);
        
        existing.lpv += data.lpv;
        aggregatedByHour.set(hour, existing);
      }
    } else if (dailyNormalizedSpend > 0) {
      const perHour = dailyNormalizedSpend / 24;
      for (let h = 0; h < 24; h++) {
        const existing = aggregatedByHour.get(h) || { spend: 0, clicks: 0, ic: 0, lpv: 0 };
        existing.spend += perHour;
        const granularIcs = rtIcByBrtHour.get(date)?.get(h) ?? 0;
        existing.ic += granularIcs;
        aggregatedByHour.set(h, existing);
      }
    }
  }
  
  // Final safeguard for specific operations with known total but missing granular data
  const finalAggregated = Array.from(aggregatedByHour.entries())
    .sort(([a], [b]) => a - b)
    .map(([hour, data]) => ({ hour, ...data }));

  const currentTotalIc = finalAggregated.reduce((sum, d) => sum + d.ic, 0);
  
  if (authoritativeIcTotal && authoritativeIcTotal > 0 && currentTotalIc === 0) {
    const totalClicks = finalAggregated.reduce((sum, d) => sum + d.clicks, 0);
    const totalSpend = finalAggregated.reduce((sum, d) => sum + d.spend, 0);
    
    return finalAggregated.map(d => {
      let distributedIc = 0;
      if (totalClicks > 0) {
        distributedIc = (d.clicks / totalClicks) * authoritativeIcTotal;
      } else if (totalSpend > 0) {
        distributedIc = (d.spend / totalSpend) * authoritativeIcTotal;
      } else {
        distributedIc = authoritativeIcTotal / 24;
      }
      return { ...d, ic: Math.round(distributedIc * 100) / 100 };
    });
  }

  return finalAggregated;
}
