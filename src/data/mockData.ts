// WarRoom Mock Data

export interface MetaAdData {
  id: string;
  account_id: string;
  campaign_name: string;
  adset_name: string;
  ad_name: string;
  status: "ACTIVE" | "PAUSED";
  spend: number;
  impressions: number;
  clicks: number;
  cpc: number;
  cpm: number;
  ctr: number;
  video_3s_views: number;
  video_25_percent: number;
  video_50_percent: number;
  video_75_percent: number;
  video_100_percent: number;
  thruplays: number;
  date: string;
  // Derived
  sales?: number;
  revenue?: number;
  roas?: number;
  cac?: number;
  hook_rate?: number;
  hold_rate?: number;
}

export interface SalesData {
  order_id: string;
  date: string;
  revenue: number;
  product_name: string;
  utm_source: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  status: "approved" | "refunded" | "pending";
}

export interface VslData {
  video_id: string;
  video_name: string;
  total_views: number;
  unique_views: number;
  average_watch_time: number;
  retention_rate: number;
  button_clicks: number;
  checkout_clicks: number;
  date: string;
}

// Campaigns
const structures = ["2501", "151", "151 DUP"];
const products = ["Método X", "Curso Alpha", "Mentoria Pro"];

function rand(min: number, max: number) {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100;
}

function generateAds(): MetaAdData[] {
  const ads: MetaAdData[] = [];
  const dates = Array.from({ length: 30 }, (_, i) => {
    const d = new Date(2026, 1, 11);
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  });

  let id = 0;
  for (const date of dates.slice(0, 14)) {
    for (const struct of structures) {
      const numCampaigns = struct === "2501" ? 3 : struct === "151" ? 2 : 1;
      for (let c = 0; c < numCampaigns; c++) {
        const product = products[c % products.length];
        const campaignName = `[BAIANO][${struct}][${product}][${date.slice(5)}]`;
        const adsPerCampaign = Math.floor(Math.random() * 3) + 2;
        for (let a = 0; a < adsPerCampaign; a++) {
          const impressions = Math.floor(rand(5000, 80000));
          const clicks = Math.floor(impressions * rand(0.008, 0.035));
          const spend = rand(50, 800);
          const v3s = Math.floor(impressions * rand(0.15, 0.45));
          const v25 = Math.floor(v3s * rand(0.4, 0.7));
          const v50 = Math.floor(v25 * rand(0.5, 0.75));
          const v75 = Math.floor(v50 * rand(0.4, 0.65));
          const v100 = Math.floor(v75 * rand(0.3, 0.55));
          const sales = Math.floor(clicks * rand(0.01, 0.06));
          const revenue = sales * rand(97, 497);

          ads.push({
            id: `ad_${++id}`,
            account_id: `act_${(c % 5) + 1}`,
            campaign_name: campaignName,
            adset_name: `Adset_${struct}_${a + 1}`,
            ad_name: `Creative_${struct}_V${a + 1}_${product.replace(/\s/g, "")}_Hook${Math.floor(Math.random() * 5) + 1}`,
            status: Math.random() > 0.25 ? "ACTIVE" : "PAUSED",
            spend,
            impressions,
            clicks,
            cpc: spend / clicks,
            cpm: (spend / impressions) * 1000,
            ctr: (clicks / impressions) * 100,
            video_3s_views: v3s,
            video_25_percent: v25,
            video_50_percent: v50,
            video_75_percent: v75,
            video_100_percent: v100,
            thruplays: v75,
            date,
            sales,
            revenue,
            roas: revenue / spend,
            cac: sales > 0 ? spend / sales : 0,
            hook_rate: (v3s / impressions) * 100,
            hold_rate: v3s > 0 ? (v25 / v3s) * 100 : 0,
          });
        }
      }
    }
  }
  return ads;
}

function generateSales(ads: MetaAdData[]): SalesData[] {
  const sales: SalesData[] = [];
  let orderId = 1000;
  for (const ad of ads) {
    const numSales = ad.sales || 0;
    for (let i = 0; i < numSales; i++) {
      sales.push({
        order_id: `CP_${++orderId}`,
        date: ad.date,
        revenue: rand(97, 497),
        product_name: ad.campaign_name.match(/\[(.*?)\]/g)?.[2]?.replace(/[\[\]]/g, "") || "Produto",
        utm_source: "facebook",
        utm_campaign: ad.campaign_name,
        utm_content: ad.ad_name,
        utm_term: "",
        status: Math.random() > 0.05 ? "approved" : "refunded",
      });
    }
  }
  return sales;
}

function generateVsls(): VslData[] {
  const vslNames = [
    "VSL Principal - Método X",
    "VSL Retargeting - Método X",
    "VSL Curta - Curso Alpha",
    "VSL Longa - Mentoria Pro",
    "VSL Teste A/B - Método X V2",
  ];
  const vsls: VslData[] = [];
  const dates = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(2026, 1, 11);
    d.setDate(d.getDate() - i);
    return d.toISOString().split("T")[0];
  });

  for (const date of dates) {
    for (let i = 0; i < vslNames.length; i++) {
      const views = Math.floor(rand(200, 3000));
      const unique = Math.floor(views * rand(0.7, 0.95));
      const btnClicks = Math.floor(views * rand(0.05, 0.2));
      vsls.push({
        video_id: `vsl_${i + 1}`,
        video_name: vslNames[i],
        total_views: views,
        unique_views: unique,
        average_watch_time: rand(120, 1800),
        retention_rate: rand(15, 55),
        button_clicks: btnClicks,
        checkout_clicks: Math.floor(btnClicks * rand(0.3, 0.7)),
        date,
      });
    }
  }
  return vsls;
}

export const mockAds = generateAds();
export const mockSales = generateSales(mockAds);
export const mockVsls = generateVsls();

// Aggregation helpers
export function getOverviewMetrics(ads: MetaAdData[]) {
  const totalSpend = ads.reduce((s, a) => s + a.spend, 0);
  const totalRevenue = ads.reduce((s, a) => s + (a.revenue || 0), 0);
  const totalSales = ads.reduce((s, a) => s + (a.sales || 0), 0);
  const totalClicks = ads.reduce((s, a) => s + a.clicks, 0);
  const uniqueClients = totalSales; // simplified

  return {
    faturamento: totalRevenue,
    spend: totalSpend,
    roas: totalSpend > 0 ? totalRevenue / totalSpend : 0,
    cac: uniqueClients > 0 ? totalSpend / uniqueClients : 0,
    cpa: totalSales > 0 ? totalSpend / totalSales : 0,
    ticketMedio: totalSales > 0 ? totalRevenue / totalSales : 0,
    conversao: totalClicks > 0 ? (totalSales / totalClicks) * 100 : 0,
    margem: 0.35, // 35% default
  };
}

export function getStructureData(ads: MetaAdData[]) {
  const structMap = new Map<string, { campaigns: Set<string>; active: number; paused: number; spend: number; revenue: number }>();

  for (const ad of ads) {
    const match = ad.campaign_name.match(/\[BAIANO\]\[([^\]]+)\]/);
    if (!match) continue;
    const struct = match[1];
    if (!structMap.has(struct)) {
      structMap.set(struct, { campaigns: new Set(), active: 0, paused: 0, spend: 0, revenue: 0 });
    }
    const s = structMap.get(struct)!;
    s.campaigns.add(ad.campaign_name);
    if (ad.status === "ACTIVE") s.active++;
    else s.paused++;
    s.spend += ad.spend;
    s.revenue += ad.revenue || 0;
  }

  return Array.from(structMap.entries()).map(([name, data]) => ({
    structure: name,
    campaigns: data.campaigns.size,
    active: data.active,
    paused: data.paused,
    spend: data.spend,
    revenue: data.revenue,
    roas: data.spend > 0 ? data.revenue / data.spend : 0,
  }));
}

export function getSpendRevenueByDate(ads: MetaAdData[]) {
  const dateMap = new Map<string, { spend: number; revenue: number }>();
  for (const ad of ads) {
    if (!dateMap.has(ad.date)) dateMap.set(ad.date, { spend: 0, revenue: 0 });
    const d = dateMap.get(ad.date)!;
    d.spend += ad.spend;
    d.revenue += ad.revenue || 0;
  }
  return Array.from(dateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function getRoasByCampaign(ads: MetaAdData[]) {
  const campMap = new Map<string, { spend: number; revenue: number }>();
  for (const ad of ads) {
    const name = ad.campaign_name;
    if (!campMap.has(name)) campMap.set(name, { spend: 0, revenue: 0 });
    const c = campMap.get(name)!;
    c.spend += ad.spend;
    c.revenue += ad.revenue || 0;
  }
  return Array.from(campMap.entries())
    .map(([campaign, data]) => ({
      campaign: campaign.length > 30 ? campaign.slice(0, 30) + "…" : campaign,
      roas: data.spend > 0 ? data.revenue / data.spend : 0,
      spend: data.spend,
      revenue: data.revenue,
    }))
    .sort((a, b) => b.roas - a.roas)
    .slice(0, 10);
}

export function getCreativeData(ads: MetaAdData[]) {
  const creativeMap = new Map<string, MetaAdData & { _count: number }>();
  for (const ad of ads) {
    if (!creativeMap.has(ad.ad_name)) {
      creativeMap.set(ad.ad_name, { ...ad, _count: 1 });
    } else {
      const c = creativeMap.get(ad.ad_name)!;
      c.spend += ad.spend;
      c.impressions += ad.impressions;
      c.clicks += ad.clicks;
      c.video_3s_views += ad.video_3s_views;
      c.video_25_percent += ad.video_25_percent;
      c.video_50_percent += ad.video_50_percent;
      c.video_75_percent += ad.video_75_percent;
      c.video_100_percent += ad.video_100_percent;
      c.sales = (c.sales || 0) + (ad.sales || 0);
      c.revenue = (c.revenue || 0) + (ad.revenue || 0);
      c._count++;
    }
  }

  return Array.from(creativeMap.values()).map((c) => ({
    ...c,
    cpc: c.clicks > 0 ? c.spend / c.clicks : 0,
    cpm: c.impressions > 0 ? (c.spend / c.impressions) * 1000 : 0,
    ctr: c.impressions > 0 ? (c.clicks / c.impressions) * 100 : 0,
    roas: c.spend > 0 ? (c.revenue || 0) / c.spend : 0,
    cac: (c.sales || 0) > 0 ? c.spend / (c.sales || 1) : 0,
    hook_rate: c.impressions > 0 ? (c.video_3s_views / c.impressions) * 100 : 0,
    hold_rate: c.video_3s_views > 0 ? (c.video_25_percent / c.video_3s_views) * 100 : 0,
  }));
}
