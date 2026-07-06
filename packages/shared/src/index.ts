export const SERVICE = {
  code: "craftsite",
  name: "職人ホームページ制作所",
  setupPriceYen: 9900,
  monthlyPriceYen: 4980,
  firstMonthFree: true
} as const;

export const ORDER_STATUS = {
  draft: "draft",
  generating: "generating",
  previewReady: "preview_ready",
  failed: "failed"
} as const;

export type OrderStatus = (typeof ORDER_STATUS)[keyof typeof ORDER_STATUS];

export type OwnerAlert = {
  subject: string;
  message: string;
};

export const TEMPLATE_NAMES = ["classic", "caseFirst", "singlePage"] as const;
export const THEME_NAMES = ["honestNavy", "livelyOrange", "premiumGreen"] as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[number];
export type ThemeName = (typeof THEME_NAMES)[number];

export type SiteConfig = {
  businessName: string;
  representativeName: string;
  template: TemplateName;
  theme: ThemeName;
  phone: string;
  lineUrl: string;
  formUrl: string;
  area: string;
  hero: string;
  tagline: string;
  strengths: string[];
  cases: Array<{ title: string; area: string; image: string; caption?: string }>;
  prices: Array<{ label: string; price: string }>;
  flow: string[];
  greeting: string;
  company: { address: string; hours: string; closed: string };
  eventsBaseUrl?: string;
  previewBanner?: { leadId?: string; message: string; applyUrl: string };
};

export type Lead = {
  id?: string;
  placeId?: string;
  slug: string;
  businessName: string;
  address: string;
  phone: string;
  website?: string;
  source: string;
  reviewSummary?: string;
  placesPhotoUrl?: string;
  excluded: boolean;
  raw?: unknown;
};
