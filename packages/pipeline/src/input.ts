export type SiteInput = {
  businessName: string;
  representativeName: string;
  foundedYear: string;
  areas: string[];
  specialties: string[];
  licenses: string[];
  note: string;
  phone: string;
  photos: string[];
};

export function normalizeSiteInput(raw: Partial<SiteInput> = {}): SiteInput {
  return {
    businessName: text(raw.businessName, "地域の塗装店"),
    representativeName: text(raw.representativeName, "代表"),
    foundedYear: text(raw.foundedYear, ""),
    areas: list(raw.areas, ["町田市", "八王子市", "相模原市"]),
    specialties: list(raw.specialties, ["外壁塗装", "屋根塗装"]),
    licenses: list(raw.licenses, []),
    note: text(raw.note, "ていねいな説明を大切にしています"),
    phone: text(raw.phone, "050-0000-0000"),
    photos: list(raw.photos, []).slice(0, 20)
  };
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown, fallback: string[]) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim()) : fallback;
}
