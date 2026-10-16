export const QLOO_ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:videogame",
] as const;

export type QlooEntityType = (typeof QLOO_ENTITY_TYPES)[number];

export interface QlooEntityProperties {
  image?: string | { url?: string; [key: string]: unknown };
  description?: string;
  akas?: string[];
  [key: string]: unknown;
}

export interface QlooEntity {
  entity_id: string;
  name: string;
  type: QlooEntityType | string;
  affinity?: number;
  popularity?: number;
  properties?: QlooEntityProperties;
  tags?: unknown[];
  query?: { affinity?: number; explainability?: Record<string, unknown>; [key: string]: unknown };
  [key: string]: unknown;
}

export interface QlooInsightsResponse {
  success: boolean;
  results: {
    entities: QlooEntity[];
    duration?: number;
  };
  query?: {
    explainability?: unknown;
    [key: string]: unknown;
  };
}

export interface QlooSearchResponse {
  success: boolean;
  results: QlooEntity[];
}

export interface QlooTag {
  tag_id?: string;
  id?: string;
  name: string;
  type?: string;
  subtype?: string;
  [key: string]: unknown;
}

export interface QlooTagSearchResponse {
  success: boolean;
  results: QlooTag[];
}
