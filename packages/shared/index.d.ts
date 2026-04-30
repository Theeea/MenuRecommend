export declare const CUISINE_LABELS: Record<string, string>;
export declare const CUISINE_VALUES: readonly string[];
export declare const CUISINE_OPTIONS: readonly Readonly<{
  value: string;
  label: string;
}>[];
export declare const RECOMMEND_CUISINE_VALUES: readonly string[];
export declare const RECOMMEND_CUISINE_OPTIONS: readonly Readonly<{
  value: string;
  label: string;
}>[];
export declare const DISH_TYPE_LABELS: Record<string, string>;
export declare const PROOF_RESULT_LABELS: Record<string, string>;
export declare const PROOF_PROCESSING_LABEL: string;
export declare const PROOF_UPLOAD_BLOCK_MESSAGES: Record<string, string>;
export declare const MENU_DRAFT_STATUS_LABELS: Record<string, string>;
export declare const RECOMMEND_STATUS_LABELS: Record<string, string>;
export declare const POINT_KIND_LABELS: Record<string, string>;
export declare const POINT_SOURCE_LABELS: Record<string, string>;
export declare const INGREDIENT_ROLE_LABELS: Record<string, string>;
export declare const REMOVABLE_LABELS: Record<string, string>;

export declare function cuisineLabel(value?: string | null, fallback?: string): string;
export declare function dishTypeLabel(value?: string | null, fallback?: string): string;
export declare function proofResultLabel(value?: string | null, fallback?: string): string;
export declare function proofProcessingLabel(): string;
export declare function proofUploadBlockMessage(value?: string | null, fallback?: string): string;
export declare function menuDraftStatusLabel(value?: string | null, fallback?: string): string;
export declare function recommendStatusLabel(value?: string | null, fallback?: string): string;
export declare function pointKindLabel(value?: string | null, fallback?: string): string;
export declare function pointSourceLabel(value?: string | null, fallback?: string): string;
export declare function ingredientRoleLabel(value?: string | null, fallback?: string): string;
export declare function removableLabel(value?: string | null, fallback?: string): string;
