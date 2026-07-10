// International phone countries — Asia, Middle East, Europe (+ local PK default)

export const COUNTRY_REGIONS = [
  { id: "asia", label: "Asia" },
  { id: "middle_east", label: "Middle East" },
  { id: "europe", label: "Europe" },
];

/** @type {Array<{ iso: string, flag: string, name: string, dial: string, digits: string, region: string, localHint: string, minLen?: number, maxLen?: number }>} */
export const COUNTRIES = [
  // Asia
  { iso: "PK", flag: "🇵🇰", name: "Pakistan", dial: "+92", digits: "92", region: "asia", localHint: "03XXXXXXXXX", minLen: 11, maxLen: 11 },
  { iso: "AF", flag: "🇦🇫", name: "Afghanistan", dial: "+93", digits: "93", region: "asia", localHint: "07XXXXXXXX", minLen: 9, maxLen: 10 },
  { iso: "IN", flag: "🇮🇳", name: "India", dial: "+91", digits: "91", region: "asia", localHint: "10-digit mobile", minLen: 10, maxLen: 10 },
  { iso: "BD", flag: "🇧🇩", name: "Bangladesh", dial: "+880", digits: "880", region: "asia", localHint: "01XXXXXXXXX", minLen: 11, maxLen: 11 },
  { iso: "CN", flag: "🇨🇳", name: "China", dial: "+86", digits: "86", region: "asia", localHint: "11-digit mobile", minLen: 11, maxLen: 11 },
  { iso: "LK", flag: "🇱🇰", name: "Sri Lanka", dial: "+94", digits: "94", region: "asia", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "NP", flag: "🇳🇵", name: "Nepal", dial: "+977", digits: "977", region: "asia", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "MY", flag: "🇲🇾", name: "Malaysia", dial: "+60", digits: "60", region: "asia", localHint: "9–10 digits", minLen: 9, maxLen: 10 },
  { iso: "SG", flag: "🇸🇬", name: "Singapore", dial: "+65", digits: "65", region: "asia", localHint: "8 digits", minLen: 8, maxLen: 8 },
  { iso: "TH", flag: "🇹🇭", name: "Thailand", dial: "+66", digits: "66", region: "asia", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "ID", flag: "🇮🇩", name: "Indonesia", dial: "+62", digits: "62", region: "asia", localHint: "9–12 digits", minLen: 9, maxLen: 12 },
  { iso: "PH", flag: "🇵🇭", name: "Philippines", dial: "+63", digits: "63", region: "asia", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "JP", flag: "🇯🇵", name: "Japan", dial: "+81", digits: "81", region: "asia", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "KR", flag: "🇰🇷", name: "South Korea", dial: "+82", digits: "82", region: "asia", localHint: "9–10 digits", minLen: 9, maxLen: 10 },
  { iso: "HK", flag: "🇭🇰", name: "Hong Kong", dial: "+852", digits: "852", region: "asia", localHint: "8 digits", minLen: 8, maxLen: 8 },

  // Middle East
  { iso: "AE", flag: "🇦🇪", name: "United Arab Emirates", dial: "+971", digits: "971", region: "middle_east", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "SA", flag: "🇸🇦", name: "Saudi Arabia", dial: "+966", digits: "966", region: "middle_east", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "QA", flag: "🇶🇦", name: "Qatar", dial: "+974", digits: "974", region: "middle_east", localHint: "8 digits", minLen: 8, maxLen: 8 },
  { iso: "KW", flag: "🇰🇼", name: "Kuwait", dial: "+965", digits: "965", region: "middle_east", localHint: "8 digits", minLen: 8, maxLen: 8 },
  { iso: "BH", flag: "🇧🇭", name: "Bahrain", dial: "+973", digits: "973", region: "middle_east", localHint: "8 digits", minLen: 8, maxLen: 8 },
  { iso: "OM", flag: "🇴🇲", name: "Oman", dial: "+968", digits: "968", region: "middle_east", localHint: "8 digits", minLen: 8, maxLen: 8 },
  { iso: "IQ", flag: "🇮🇶", name: "Iraq", dial: "+964", digits: "964", region: "middle_east", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "IR", flag: "🇮🇷", name: "Iran", dial: "+98", digits: "98", region: "middle_east", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "JO", flag: "🇯🇴", name: "Jordan", dial: "+962", digits: "962", region: "middle_east", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "LB", flag: "🇱🇧", name: "Lebanon", dial: "+961", digits: "961", region: "middle_east", localHint: "7–8 digits", minLen: 7, maxLen: 8 },
  { iso: "TR", flag: "🇹🇷", name: "Turkey", dial: "+90", digits: "90", region: "middle_east", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "IL", flag: "🇮🇱", name: "Israel", dial: "+972", digits: "972", region: "middle_east", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "YE", flag: "🇾🇪", name: "Yemen", dial: "+967", digits: "967", region: "middle_east", localHint: "9 digits", minLen: 9, maxLen: 9 },

  // Europe
  { iso: "GB", flag: "🇬🇧", name: "United Kingdom", dial: "+44", digits: "44", region: "europe", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "DE", flag: "🇩🇪", name: "Germany", dial: "+49", digits: "49", region: "europe", localHint: "10–11 digits", minLen: 10, maxLen: 11 },
  { iso: "FR", flag: "🇫🇷", name: "France", dial: "+33", digits: "33", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "IT", flag: "🇮🇹", name: "Italy", dial: "+39", digits: "39", region: "europe", localHint: "9–10 digits", minLen: 9, maxLen: 10 },
  { iso: "ES", flag: "🇪🇸", name: "Spain", dial: "+34", digits: "34", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "NL", flag: "🇳🇱", name: "Netherlands", dial: "+31", digits: "31", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "BE", flag: "🇧🇪", name: "Belgium", dial: "+32", digits: "32", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "CH", flag: "🇨🇭", name: "Switzerland", dial: "+41", digits: "41", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "SE", flag: "🇸🇪", name: "Sweden", dial: "+46", digits: "46", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "NO", flag: "🇳🇴", name: "Norway", dial: "+47", digits: "47", region: "europe", localHint: "8 digits", minLen: 8, maxLen: 8 },
  { iso: "PL", flag: "🇵🇱", name: "Poland", dial: "+48", digits: "48", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "AT", flag: "🇦🇹", name: "Austria", dial: "+43", digits: "43", region: "europe", localHint: "10–11 digits", minLen: 10, maxLen: 11 },
  { iso: "PT", flag: "🇵🇹", name: "Portugal", dial: "+351", digits: "351", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "GR", flag: "🇬🇷", name: "Greece", dial: "+30", digits: "30", region: "europe", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "IE", flag: "🇮🇪", name: "Ireland", dial: "+353", digits: "353", region: "europe", localHint: "9 digits", minLen: 9, maxLen: 9 },
  { iso: "RU", flag: "🇷🇺", name: "Russia", dial: "+7", digits: "7", region: "europe", localHint: "10 digits", minLen: 10, maxLen: 10 },
  { iso: "US", flag: "🇺🇸", name: "United States", dial: "+1", digits: "1", region: "europe", localHint: "10 digits", minLen: 10, maxLen: 10 },
];

export const DEFAULT_COUNTRY = COUNTRIES.find((c) => c.iso === "PK") || COUNTRIES[0];

const BY_ISO = new Map(COUNTRIES.map((c) => [c.iso, c]));
const BY_DIAL_LEN = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
const BY_DIGITS_LEN = [...COUNTRIES].sort((a, b) => b.digits.length - a.digits.length);

export const getCountryByIso = (iso) => BY_ISO.get(iso) || DEFAULT_COUNTRY;

export const getCountriesByRegion = (regionId) =>
  COUNTRIES.filter((c) => c.region === regionId);

const regionLabel = (regionId) =>
  COUNTRY_REGIONS.find((r) => r.id === regionId)?.label || "";

/** Live country search — scored, best matches first. Empty query → null (show grouped list). */
export const searchCountries = (query = "") => {
  const q = String(query || "").trim().toLowerCase();
  if (!q) return null;

  const dialQ = q.startsWith("+") ? q : (q.replace(/\D/g, "").length >= 2 ? `+${q.replace(/\D/g, "")}` : "");
  const digitQ = q.replace(/\D/g, "");

  const results = COUNTRIES.map((c) => {
    const name = c.name.toLowerCase();
    const iso = c.iso.toLowerCase();
    const region = regionLabel(c.region).toLowerCase();
    let score = 0;

    if (name === q) score = 120;
    else if (name.startsWith(q)) score = 100;
    else if (iso === q) score = 95;
    else if (name.includes(q)) score = 75;
    else if (iso.startsWith(q)) score = 70;
    else if (dialQ && c.dial.startsWith(dialQ)) score = 65;
    else if (digitQ.length >= 2 && c.digits.startsWith(digitQ)) score = 60;
    else if (region.includes(q)) score = 35;
    else return null;

    return { ...c, score, regionLabel: regionLabel(c.region) };
  })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return results;
};

/** Resolve country from phone input — defaults to Pakistan. */
export const resolveCountryFromPhone = (phone = "", fallbackIso = "PK") => {
  const raw = String(phone || "").trim().replace(/[\s\-()]/g, "");
  const fallback = getCountryByIso(fallbackIso);

  if (!raw) return fallback;

  if (raw.startsWith("+")) {
    return BY_DIAL_LEN.find((c) => raw.startsWith(c.dial)) || fallback;
  }

  if (raw.startsWith("00")) {
    const intl = "+" + raw.slice(2);
    return BY_DIAL_LEN.find((c) => intl.startsWith(c.dial)) || fallback;
  }

  // Local Pakistan mobile
  if (/^03\d{0,9}$/.test(raw) || (raw.startsWith("0") && !raw.startsWith("00") && fallbackIso === "PK")) {
    return getCountryByIso("PK");
  }

  // International digits without +
  for (const c of BY_DIGITS_LEN) {
    if (c.digits && raw.startsWith(c.digits)) return c;
  }

  return fallback;
};

export const stripCountryPrefix = (phone = "", country = DEFAULT_COUNTRY) => {
  const raw = String(phone || "").trim().replace(/[\s\-()]/g, "");
  if (!raw) return "";
  if (raw.startsWith("+")) {
    if (raw.startsWith(country.dial)) return raw.slice(country.dial.length);
    return raw.replace(/^\+/, "");
  }
  if (raw.startsWith("00" + country.digits)) return raw.slice(2 + country.digits.length);
  if (raw.startsWith(country.digits)) return raw.slice(country.digits.length);
  return raw;
};

export const formatPhoneForCountry = (phone = "", country = DEFAULT_COUNTRY) => {
  const raw = String(phone || "").trim().replace(/[\s\-()]/g, "");
  if (!raw) return "";

  if (country.iso === "PK") {
    let d = raw.replace(/\D/g, "");
    if (d.startsWith("0092")) d = "0" + d.slice(4);
    else if (d.startsWith("92") && d.length >= 12) d = "0" + d.slice(2);
    if (d.length === 10 && d.startsWith("3")) d = "0" + d;
    return d;
  }

  if (raw.startsWith("+")) return raw;
  const local = stripCountryPrefix(raw, country).replace(/\D/g, "");
  if (!local) return "";
  return `${country.dial}${local}`;
};

/** Strip erroneous leading 0 after country dial (e.g. +9203… → +923…). */
const fixLeadingZeroAfterDial = (e164 = "", country = DEFAULT_COUNTRY) => {
  const dial = country?.dial || "";
  if (!e164.startsWith(dial)) return e164;
  let rest = e164.slice(dial.length).replace(/\D/g, "");
  while (rest.startsWith("0")) rest = rest.slice(1);
  return rest ? `${dial}${rest}` : e164;
};

/** E.164 storage format — PK: +923162502498 (never +920316…). */
export const toE164Phone = (phone = "", country = DEFAULT_COUNTRY) => {
  const c = typeof country === "string" ? getCountryByIso(country) : country;
  const raw = String(phone || "").trim().replace(/[\s\-()]/g, "");
  if (!raw) return "";

  if (c.iso === "PK") {
    let d = raw.replace(/\D/g, "");
    if (raw.startsWith("+") || d.startsWith("92") || d.startsWith("0092")) {
      if (d.startsWith("0092")) d = d.slice(4);
      else if (d.startsWith("92")) d = d.slice(2);
      while (d.startsWith("0")) d = d.slice(1);
      if (d.length === 10 && /^3\d{9}$/.test(d)) return `+92${d}`;
      return "";
    }
    const local = formatPhoneForCountry(raw, c);
    if (PK_PHONE.test(local)) return `+92${local.slice(1)}`;
    return "";
  }

  let e164 = raw.startsWith("+") ? raw : formatPhoneForCountry(raw, c);
  if (!e164.startsWith("+")) e164 = e164.startsWith(c.dial) ? e164 : `${c.dial}${e164.replace(/\D/g, "")}`;
  return fixLeadingZeroAfterDial(e164, c);
};

const PK_PHONE = /^03[0-9]{9}$/;

export const validatePhoneForCountry = (raw = "", country = DEFAULT_COUNTRY) => {
  if (!raw) return null;

  const resolved = resolveCountryFromPhone(raw, country.iso);
  const active = resolved.iso === country.iso || !raw.trim() ? country : resolved;

  if (active.iso === "PK") {
    const norm = formatPhoneForCountry(raw, active);
    const e164 = toE164Phone(raw, active);
    if (PK_PHONE.test(norm) && e164) {
      return { valid: true, normalized: e164, local: norm, type: "pk", country: active };
    }
    if (norm.length > 0 && norm.length < 11) {
      return { valid: false, reason: "short", country: active };
    }
    return { valid: false, reason: "format", country: active };
  }

  const rawTrim = String(raw).trim().replace(/[\s\-()]/g, "");
  const e164 = rawTrim.startsWith("+")
    ? fixLeadingZeroAfterDial(rawTrim, active)
    : toE164Phone(rawTrim, active);
  const digitsOnly = e164.replace(/\D/g, "");
  const nationalLen = stripCountryPrefix(e164, active).replace(/\D/g, "").length;
  const minLen = active.minLen || 7;
  const maxLen = active.maxLen || 15;

  if (nationalLen >= minLen && nationalLen <= maxLen && digitsOnly.length >= 8 && digitsOnly.length <= 15) {
    return { valid: true, normalized: e164.startsWith("+") ? e164 : `+${digitsOnly}`, type: "intl", country: active };
  }
  if (nationalLen > 0 && nationalLen < minLen) {
    return { valid: false, reason: "short", country: active };
  }
  return { valid: false, reason: "format", country: active };
};

// ══════════════════════════════════════════════════════════════
// COUNTRY → CITY / MARKET (2 cities + 2 markets each; biller can add more)
// ══════════════════════════════════════════════════════════════

/** @type {Record<string, { cities: string[], markets: Record<string, string[]>, defaultCity: string }>} */
export const COUNTRY_LOCATIONS = {
  PK: {
    cities: ["Karachi", "Lahore"],
    markets: { Karachi: ["Saddar", "Hyderi"], Lahore: ["Anarkali", "Liberty"] },
    defaultCity: "Karachi",
  },
  CN: {
    cities: ["Guangzhou", "Yiwu"],
    markets: { Guangzhou: ["Liwan", "Tianhe"], Yiwu: ["Yiwu Market", "Huangyuan"] },
    defaultCity: "Guangzhou",
  },
  IN: {
    cities: ["Mumbai", "Delhi"],
    markets: { Mumbai: ["Zaveri Bazaar", "Bandra"], Delhi: ["Karol Bagh", "Chandni Chowk"] },
    defaultCity: "Mumbai",
  },
  BD: {
    cities: ["Dhaka", "Chittagong"],
    markets: { Dhaka: ["Gulshan", "Old Dhaka"], Chittagong: ["Agrabad", "Chawkbazar"] },
    defaultCity: "Dhaka",
  },
  AF: {
    cities: ["Kabul", "Herat"],
    markets: { Kabul: ["Chicken Street", "Mandawi"], Herat: ["Bazaar-e-Kohan", "Timani"] },
    defaultCity: "Kabul",
  },
  AE: {
    cities: ["Dubai", "Abu Dhabi"],
    markets: { Dubai: ["Gold Souk", "Deira"], "Abu Dhabi": ["Mussafah", "Khalifa City"] },
    defaultCity: "Dubai",
  },
  SA: {
    cities: ["Riyadh", "Jeddah"],
    markets: { Riyadh: ["Olaya", "Batha"], Jeddah: ["Al Balad", "Gold Market"] },
    defaultCity: "Riyadh",
  },
  QA: {
    cities: ["Doha", "Al Wakrah"],
    markets: { Doha: ["Souq Waqif", "Gold Souq"], "Al Wakrah": ["Main Market", "Industrial"] },
    defaultCity: "Doha",
  },
  KW: {
    cities: ["Kuwait City", "Hawally"],
    markets: { "Kuwait City": ["Mubarakiya", "Salmiya"], Hawally: ["Hawally Market", "Ibn Khaldoun"] },
    defaultCity: "Kuwait City",
  },
  TR: {
    cities: ["Istanbul", "Ankara"],
    markets: { Istanbul: ["Grand Bazaar", "Kuyumcukent"], Ankara: ["Ulus", "Kizilay"] },
    defaultCity: "Istanbul",
  },
  GB: {
    cities: ["London", "Birmingham"],
    markets: { London: ["Hatton Garden", "Bond Street"], Birmingham: ["Jewellery Quarter", "Bull Ring"] },
    defaultCity: "London",
  },
  US: {
    cities: ["New York", "Los Angeles"],
    markets: { "New York": ["Diamond District", "47th Street"], "Los Angeles": ["Jewelry District", "Beverly Hills"] },
    defaultCity: "New York",
  },
  DE: {
    cities: ["Berlin", "Munich"],
    markets: { Berlin: ["Mitte", "Charlottenburg"], Munich: ["Marienplatz", "Sendlinger"] },
    defaultCity: "Berlin",
  },
  MY: {
    cities: ["Kuala Lumpur", "Penang"],
    markets: { "Kuala Lumpur": ["Pasar Seni", "Bukit Bintang"], Penang: ["Little India", "Komtar"] },
    defaultCity: "Kuala Lumpur",
  },
  SG: {
    cities: ["Singapore Central", "Jurong"],
    markets: { "Singapore Central": ["Chinatown", "Orchard"], Jurong: ["JEM", "IMM"] },
    defaultCity: "Singapore Central",
  },
  TH: {
    cities: ["Bangkok", "Chiang Mai"],
    markets: { Bangkok: ["Yaowarat", "Pratunam"], "Chiang Mai": ["Night Bazaar", "Warorot"] },
    defaultCity: "Bangkok",
  },
  ID: {
    cities: ["Jakarta", "Surabaya"],
    markets: { Jakarta: ["Pasar Pagi", "Glodok"], Surabaya: ["Tunjungan", "Pasar Atom"] },
    defaultCity: "Jakarta",
  },
  PH: {
    cities: ["Manila", "Cebu"],
    markets: { Manila: ["Binondo", "Greenhills"], Cebu: ["Colon", "Ayala"] },
    defaultCity: "Manila",
  },
  JP: {
    cities: ["Tokyo", "Osaka"],
    markets: { Tokyo: ["Ginza", "Shinjuku"], Osaka: ["Shinsaibashi", "Umeda"] },
    defaultCity: "Tokyo",
  },
  KR: {
    cities: ["Seoul", "Busan"],
    markets: { Seoul: ["Myeongdong", "Dongdaemun"], Busan: ["Gukje", "Nampo"] },
    defaultCity: "Seoul",
  },
  HK: {
    cities: ["Hong Kong Island", "Kowloon"],
    markets: { "Hong Kong Island": ["Central", "Causeway Bay"], Kowloon: ["Tsim Sha Tsui", "Mong Kok"] },
    defaultCity: "Hong Kong Island",
  },
  IR: {
    cities: ["Tehran", "Isfahan"],
    markets: { Tehran: ["Grand Bazaar", "Tajrish"], Isfahan: ["Bazaar", "Chahar Bagh"] },
    defaultCity: "Tehran",
  },
  LK: {
    cities: ["Colombo", "Kandy"],
    markets: { Colombo: ["Pettah", "Fort"], Kandy: ["Dalada Veediya", "Central Market"] },
    defaultCity: "Colombo",
  },
  NP: {
    cities: ["Kathmandu", "Pokhara"],
    markets: { Kathmandu: ["Asan", "Thamel"], Pokhara: ["Mahendrapul", "Lakeside"] },
    defaultCity: "Kathmandu",
  },
};

/** 2 cities + 2 markets per country; auto-fallback for unlisted ISO codes. */
export const getCountryLocations = (iso) => {
  const key = String(iso || "PK").toUpperCase();
  if (COUNTRY_LOCATIONS[key]) return COUNTRY_LOCATIONS[key];
  const c = getCountryByIso(key);
  const short = c.name.replace(/^United\s+/i, "").split(/\s+/)[0] || c.name;
  const cityA = `${short} City`;
  const cityB = `${short} North`;
  return {
    cities: [cityA, cityB],
    markets: {
      [cityA]: ["Market 1", "Market 2"],
      [cityB]: ["Market 1", "Market 2"],
    },
    defaultCity: cityA,
  };
};

export const getMarketsForCity = (iso, city) => {
  const loc = getCountryLocations(iso);
  return loc.markets[city] || [];
};
