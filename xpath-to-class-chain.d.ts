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
  /** Flags that are not recognised. Non-empty means the CLI should refuse to run. */
  unknown: string[];
  help: boolean;
  version: boolean;
  json: boolean;
  quiet: boolean;
  dryRun: boolean;
  optimize: boolean;
}

/** Parse CLI argv (without `node`/script) into the flag object the CLI uses. */
export function parseFlags(argv: string[]): ParsedFlags;

export interface ScanStats {
  filesScanned: number;
  locatorsFound: number;
  locatorsUpdated: number;
  skipped: {
    android: number;
    validationFailed: number;
    unsupportedLogic: number;
    notXpath: number;
    noChangeNeeded: number;
  };
}

export interface ScanRecord {
  /** Path relative to the scan root, with `/` separators on every platform. */
  file: string;
  changed: boolean;
  /** The locator as found in the file. */
  old: string;
  /** The rewritten locator; present only when `changed`. */
  new?: string;
  status: Status;
  reason: string | null;
}

export interface MainResult {
  stats: ScanStats;
  records: ScanRecord[];
}

/**
 * Scan `targetDir` and convert every locator found. Honours `opts.dryRun`;
 * exits the process on an unusable target directory.
 */
export function main(targetDir: string | undefined, opts: ParsedFlags): MainResult;

/**
 * Frozen map of status string constants. Keys are declared literally so a typo
 * such as `STATUS.SUCESS` is a compile error rather than `undefined`.
 */
export const STATUS: Readonly<{
  SUCCESS: 'success';
  SKIPPED_NOT_XPATH: 'skipped_not_xpath';
  SKIPPED_ANDROID: 'skipped_android';
  SKIPPED_UNSUPPORTED_LOGIC: 'skipped_unsupported_logic';
  SKIPPED_VALIDATION_FAILED: 'skipped_validation_failed';
  SKIPPED_NO_CHANGE: 'skipped_no_change';
}>;
