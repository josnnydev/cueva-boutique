export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
};

export type Category = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount?: number;
};

export type ProductImage = {
  id: string;
  path: string;
  thumbPath: string | null;
  url: string | null;
  thumbUrl: string | null;
  alt: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  isPrimary: boolean;
  sortOrder: number;
};

export type Product = {
  id: string;
  slug: string;
  anchor: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  baseDiscount: number;
  badge: string | null;
  sku: string | null;
  isActive: boolean;
  offerEligible: boolean;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  category: { id: string; slug: string; name: string } | null;
  images: ProductImage[];
  image: ProductImage | null;
  createdAt: string;
  updatedAt: string;
};

export type ProductInput = {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  categoryId: string;
  badge: string;
  sku: string;
  isActive: boolean;
  offerEligible: boolean;
  baseDiscount: number;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
};

export type Stats = {
  products: {
    total: number;
    active: number;
    inactive: number;
    withoutImage: number;
    updatedLast7Days: number;
  };
  categories: Array<{ id: string; slug: string; name: string; count: number }>;
  prices: {
    catalogValue: number;
    averagePrice: number;
    min: number;
    max: number;
  };
  offers: { withDiscount: number; eligible: number };
  storage: { images: number; bytes: number };
  lastRelease: { version: string; notes: string | null; released_at: string } | null;
  recentActivity: ActivityItem[];
};

export type ActivityItem = {
  id: number;
  action: string;
  entity: string;
  entity_id: string | null;
  actor_email: string | null;
  diff?: unknown;
  created_at: string;
};

export type StoreSettings = {
  name: string;
  whatsapp: string;
  generalLink: string;
  instagramHandle: string;
  instagramUrl: string;
  locale: string;
  currency: string;
  currencySymbol: string;
};

export type DailyOffersSettings = {
  enabled: boolean;
  count: number;
  step: number;
  highDiscount: number;
  highCount: number;
  lowDiscount: number;
  startDate: string;
  seed: number;
};

export type SiteSettings = {
  version: string;
  updatedAt: string;
};

export type Settings = {
  store: StoreSettings;
  dailyOffers: DailyOffersSettings;
  site: SiteSettings;
  build: { lastTriggeredAt?: string; lastTriggeredBy?: string };
};

export type Release = {
  id: number;
  version: string;
  notes: string | null;
  released_at: string;
  deployed_at: string | null;
};

export type VisitReferrerKey =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "google"
  | "directo"
  | "otros";

export type VisitStats = {
  days: number;
  totals: {
    today: number;
    last7: number;
    last30: number;
    uniqueToday: number;
    unique7: number;
    unique30: number;
  };
  daily: Array<{
    date: string;
    label: string;
    visits: number;
    unique: number;
  }>;
  topPages: Array<{ page: string; label: string; visits: number }>;
  referrers: Array<{
    key: VisitReferrerKey;
    label: string;
    visits: number;
    share: number;
  }>;
  windowTotal: number;
  generatedAt: string;
};
