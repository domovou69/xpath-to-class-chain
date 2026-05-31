// Type declarations for xpath-to-class-chain.
// The package itself is plain CommonJS (no build step); these hand-written
// declarations describe the public surface re-exported from the entry file.

/** Outcome of a conversion / validation. Mirrors the frozen `STATUS` object. */
export type Status =
  | 'success'
  | 'skipped_not_xpath'
  | 'skipped_android'
  | 'skipped_unsupported_logic'
  | 'skipped_validation_failed'
  | 'skipped_no_change';

export interface ConvertOptions {
  /**
   * Run the optimizer pass instead of plain validation. Recovers chains that
   * would otherwise fail validation (e.g. wildcard equality `name == "a*"`
   * becomes `name LIKE "a*"`). Default: `false`.
   */
  optimize?: boolean;
}

export interface ConvertResult {
  /** The converted class chain on success, or the original input when skipped. */
  locator: string;
  status: Status;
  /** Diagnostic message when available; absent for the common skip cases. */
  reason?: string | null;
}

export interface ValidateResult {
  valid: boolean;
  /** The healed `-ios class chain:` string when `valid`, otherwise `null`. */
  fixedLocator: string | null;
  /** Diagnostic message on failure, otherwise `null`. */
  reason: string | null;
}

/** Convert a single iOS XPath locator to an iOS Class Chain. */
export function convertXpathToClassChain(xpath: string, opts?: ConvertOptions): ConvertResult;

/** Validate and auto-heal an existing `-ios class chain:` string. */
export function validateAndFixClassChain(classChain: string): ValidateResult;

/** Apply all optimizer rules to an existing class chain until it stabilises. */
export function optimizeClassChain(chain: string): ValidateResult;

/** Split an XPath into separator/node tokens, respecting brackets and quotes. */
export function tokenizeXpath(xpath: string): string[];

/** Heuristic gate: does this raw string look like an iOS locator worth touching? */
export function isLikelyIosLocator(str: string): boolean;

export interface ParsedFlags {
  positionals: string[];
  json: boolean;
  quiet: boolean;
  dryRun: boolean;
  optimize: boolean;
}

/** Parse CLI argv (without `node`/script) into the flag object the CLI uses. */
export function parseFlags(argv: string[]): ParsedFlags;

/** Frozen map of status string constants. */
export const STATUS: Readonly<Record<string, Status>>;
