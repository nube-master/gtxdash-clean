// Lat/Lng + ISO2 country code mapping for live-viewers globe markers.
// US states and the most common countries we serve. Fallbacks return null.

export type GeoPoint = { lat: number; lng: number; iso2: string };

// US states (centroid lat/lng)
const US_STATES: Record<string, [number, number]> = {
  Alabama: [32.806671, -86.79113], Alaska: [61.370716, -152.404419], Arizona: [33.729759, -111.431221],
  Arkansas: [34.969704, -92.373123], California: [36.116203, -119.681564], Colorado: [39.059811, -105.311104],
  Connecticut: [41.597782, -72.755371], Delaware: [39.318523, -75.507141], Florida: [27.766279, -81.686783],
  Georgia: [33.040619, -83.643074], Hawaii: [21.094318, -157.498337], Idaho: [44.240459, -114.478828],
  Illinois: [40.349457, -88.986137], Indiana: [39.849426, -86.258278], Iowa: [42.011539, -93.210526],
  Kansas: [38.5266, -96.726486], Kentucky: [37.66814, -84.670067], Louisiana: [31.169546, -91.867805],
  Maine: [44.693947, -69.381927], Maryland: [39.063946, -76.802101], Massachusetts: [42.230171, -71.530106],
  Michigan: [43.326618, -84.536095], Minnesota: [45.694454, -93.900192], Mississippi: [32.741646, -89.678696],
  Missouri: [38.456085, -92.288368], Montana: [46.921925, -110.454353], Nebraska: [41.12537, -98.268082],
  Nevada: [38.313515, -117.055374], "New Hampshire": [43.452492, -71.563896], "New Jersey": [40.298904, -74.521011],
  "New Mexico": [34.840515, -106.248482], "New York": [42.165726, -74.948051], "North Carolina": [35.630066, -79.806419],
  "North Dakota": [47.528912, -99.784012], Ohio: [40.388783, -82.764915], Oklahoma: [35.565342, -96.928917],
  Oregon: [44.572021, -122.070938], Pennsylvania: [40.590752, -77.209755], "Rhode Island": [41.680893, -71.51178],
  "South Carolina": [33.856892, -80.945007], "South Dakota": [44.299782, -99.438828], Tennessee: [35.747845, -86.692345],
  Texas: [31.054487, -97.563461], Utah: [40.150032, -111.862434], Vermont: [44.045876, -72.710686],
  Virginia: [37.769337, -78.169968], Washington: [47.400902, -121.490494], "West Virginia": [38.491226, -80.954456],
  Wisconsin: [44.268543, -89.616508], Wyoming: [42.755966, -107.30249],
};

// Common country centroids
const COUNTRIES: Record<string, [number, number, string]> = {
  "United States": [37.0902, -95.7129, "US"], USA: [37.0902, -95.7129, "US"], US: [37.0902, -95.7129, "US"],
  Brazil: [-14.235, -51.9253, "BR"], BR: [-14.235, -51.9253, "BR"],
  Canada: [56.1304, -106.3468, "CA"], CA: [56.1304, -106.3468, "CA"],
  "United Kingdom": [55.3781, -3.436, "GB"], UK: [55.3781, -3.436, "GB"], GB: [55.3781, -3.436, "GB"],
  Germany: [51.1657, 10.4515, "DE"], DE: [51.1657, 10.4515, "DE"],
  France: [46.6034, 1.8883, "FR"], FR: [46.6034, 1.8883, "FR"],
  Spain: [40.4637, -3.7492, "ES"], ES: [40.4637, -3.7492, "ES"],
  Italy: [41.8719, 12.5674, "IT"], IT: [41.8719, 12.5674, "IT"],
  Portugal: [39.3999, -8.2245, "PT"], PT: [39.3999, -8.2245, "PT"],
  Mexico: [23.6345, -102.5528, "MX"], MX: [23.6345, -102.5528, "MX"],
  Argentina: [-38.4161, -63.6167, "AR"], AR: [-38.4161, -63.6167, "AR"],
  Australia: [-25.2744, 133.7751, "AU"], AU: [-25.2744, 133.7751, "AU"],
  // Europe
  Hungary: [47.1625, 19.5033, "HU"], HU: [47.1625, 19.5033, "HU"],
  Poland: [51.9194, 19.1451, "PL"], PL: [51.9194, 19.1451, "PL"],
  Romania: [45.9432, 24.9668, "RO"], RO: [45.9432, 24.9668, "RO"],
  Czechia: [49.8175, 15.473, "CZ"], "Czech Republic": [49.8175, 15.473, "CZ"], CZ: [49.8175, 15.473, "CZ"],
  Slovakia: [48.669, 19.699, "SK"], SK: [48.669, 19.699, "SK"],
  Austria: [47.5162, 14.5501, "AT"], AT: [47.5162, 14.5501, "AT"],
  Switzerland: [46.8182, 8.2275, "CH"], CH: [46.8182, 8.2275, "CH"],
  Netherlands: [52.1326, 5.2913, "NL"], NL: [52.1326, 5.2913, "NL"],
  Belgium: [50.5039, 4.4699, "BE"], BE: [50.5039, 4.4699, "BE"],
  Ireland: [53.4129, -8.2439, "IE"], IE: [53.4129, -8.2439, "IE"],
  Sweden: [60.1282, 18.6435, "SE"], SE: [60.1282, 18.6435, "SE"],
  Norway: [60.472, 8.4689, "NO"], NO: [60.472, 8.4689, "NO"],
  Finland: [61.9241, 25.7482, "FI"], FI: [61.9241, 25.7482, "FI"],
  Denmark: [56.2639, 9.5018, "DK"], DK: [56.2639, 9.5018, "DK"],
  Iceland: [64.9631, -19.0208, "IS"], IS: [64.9631, -19.0208, "IS"],
  Greece: [39.0742, 21.8243, "GR"], GR: [39.0742, 21.8243, "GR"],
  Bulgaria: [42.7339, 25.4858, "BG"], BG: [42.7339, 25.4858, "BG"],
  Croatia: [45.1, 15.2, "HR"], HR: [45.1, 15.2, "HR"],
  Serbia: [44.0165, 21.0059, "RS"], RS: [44.0165, 21.0059, "RS"],
  Slovenia: [46.1512, 14.9955, "SI"], SI: [46.1512, 14.9955, "SI"],
  Ukraine: [48.3794, 31.1656, "UA"], UA: [48.3794, 31.1656, "UA"],
  Russia: [61.524, 105.3188, "RU"], RU: [61.524, 105.3188, "RU"],
  Turkey: [38.9637, 35.2433, "TR"], TR: [38.9637, 35.2433, "TR"],
  Lithuania: [55.1694, 23.8813, "LT"], LT: [55.1694, 23.8813, "LT"],
  Latvia: [56.8796, 24.6032, "LV"], LV: [56.8796, 24.6032, "LV"],
  Estonia: [58.5953, 25.0136, "EE"], EE: [58.5953, 25.0136, "EE"],
  Luxembourg: [49.8153, 6.1296, "LU"], LU: [49.8153, 6.1296, "LU"],
  Malta: [35.9375, 14.3754, "MT"], MT: [35.9375, 14.3754, "MT"],
  Cyprus: [35.1264, 33.4299, "CY"], CY: [35.1264, 33.4299, "CY"],
  // Americas
  Chile: [-35.6751, -71.543, "CL"], CL: [-35.6751, -71.543, "CL"],
  Colombia: [4.5709, -74.2973, "CO"], CO: [4.5709, -74.2973, "CO"],
  Peru: [-9.19, -75.0152, "PE"], PE: [-9.19, -75.0152, "PE"],
  Uruguay: [-32.5228, -55.7658, "UY"], UY: [-32.5228, -55.7658, "UY"],
  Paraguay: [-23.4425, -58.4438, "PY"], PY: [-23.4425, -58.4438, "PY"],
  Bolivia: [-16.2902, -63.5887, "BO"], BO: [-16.2902, -63.5887, "BO"],
  Ecuador: [-1.8312, -78.1834, "EC"], EC: [-1.8312, -78.1834, "EC"],
  Venezuela: [6.4238, -66.5897, "VE"], VE: [6.4238, -66.5897, "VE"],
  // Asia / Oceania
  Japan: [36.2048, 138.2529, "JP"], JP: [36.2048, 138.2529, "JP"],
  China: [35.8617, 104.1954, "CN"], CN: [35.8617, 104.1954, "CN"],
  India: [20.5937, 78.9629, "IN"], IN: [20.5937, 78.9629, "IN"],
  "South Korea": [35.9078, 127.7669, "KR"], KR: [35.9078, 127.7669, "KR"],
  Indonesia: [-0.7893, 113.9213, "ID"], ID: [-0.7893, 113.9213, "ID"],
  Philippines: [12.8797, 121.774, "PH"], PH: [12.8797, 121.774, "PH"],
  Vietnam: [14.0583, 108.2772, "VN"], VN: [14.0583, 108.2772, "VN"],
  Thailand: [15.87, 100.9925, "TH"], TH: [15.87, 100.9925, "TH"],
  Malaysia: [4.2105, 101.9758, "MY"], MY: [4.2105, 101.9758, "MY"],
  Singapore: [1.3521, 103.8198, "SG"], SG: [1.3521, 103.8198, "SG"],
  "New Zealand": [-40.9006, 174.886, "NZ"], NZ: [-40.9006, 174.886, "NZ"],
  Israel: [31.0461, 34.8516, "IL"], IL: [31.0461, 34.8516, "IL"],
  "United Arab Emirates": [23.4241, 53.8478, "AE"], UAE: [23.4241, 53.8478, "AE"], AE: [23.4241, 53.8478, "AE"],
  "Saudi Arabia": [23.8859, 45.0792, "SA"], SA: [23.8859, 45.0792, "SA"],
  // Africa
  "South Africa": [-30.5595, 22.9375, "ZA"], ZA: [-30.5595, 22.9375, "ZA"],
  Egypt: [26.8206, 30.8025, "EG"], EG: [26.8206, 30.8025, "EG"],
  Nigeria: [9.082, 8.6753, "NG"], NG: [9.082, 8.6753, "NG"],
  Morocco: [31.7917, -7.0926, "MA"], MA: [31.7917, -7.0926, "MA"],
  Kenya: [-0.0236, 37.9062, "KE"], KE: [-0.0236, 37.9062, "KE"],
};

export function resolveGeo(country: string | null | undefined, state: string | null | undefined): GeoPoint | null {
  if (state && US_STATES[state]) {
    const [lat, lng] = US_STATES[state];
    return { lat, lng, iso2: "US" };
  }
  if (country) {
    const c = COUNTRIES[country] || COUNTRIES[country.toUpperCase()];
    if (c) return { lat: c[0], lng: c[1], iso2: c[2] };
  }
  return null;
}

// flag emoji from ISO2
export function flagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "🌎";
  const A = 0x1f1e6;
  const code = iso2.toUpperCase();
  return String.fromCodePoint(A + (code.charCodeAt(0) - 65), A + (code.charCodeAt(1) - 65));
}

// density bucket → opacity for marker
export function densityBucket(count: number): { label: string; size: number; alpha: number } {
  if (count >= 100) return { label: "100+", size: 0.12, alpha: 1 };
  if (count >= 50) return { label: "50–99", size: 0.1, alpha: 0.92 };
  if (count >= 20) return { label: "20–49", size: 0.08, alpha: 0.82 };
  if (count >= 10) return { label: "10–19", size: 0.06, alpha: 0.72 };
  return { label: "1–9", size: 0.045, alpha: 0.6 };
}
