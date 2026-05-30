/* eslint-disable @typescript-eslint/no-require-imports */
// Single source of truth for outcomes. convertXpathToClassChain, the file
// scanner, and the test suite all compare against these values — typos in a
// bare string would silently skip a branch.
const STATUS = Object.freeze({
  SUCCESS:                   'success',
  SKIPPED_NOT_XPATH:         'skipped_not_xpath',
  SKIPPED_ANDROID:           'skipped_android',
  SKIPPED_UNSUPPORTED_LOGIC: 'skipped_unsupported_logic',
  SKIPPED_VALIDATION_FAILED: 'skipped_validation_failed',
  SKIPPED_NO_CHANGE:         'skipped_no_change',
});

module.exports = STATUS;
