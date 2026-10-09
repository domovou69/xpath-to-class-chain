// WebdriverIO: the "-ios class chain:" prefix is a valid selector here, so rewriting is correct.
// Parse-only fixture: ambient stand-ins for the WebdriverIO globals and the template
// variables, so the file type-checks without installing @wdio/globals.
declare function $(selector: string): unknown;
declare function $$(selector: string): unknown;
declare const driver: { $(selector: string): unknown };
declare const message: string, line: number, round: number, name: string, formattedWinners: string;

export const s0 = () => $('//*[@label="Picama rajer t bevad motezef rari 0."]');
export const s1 = () =>
  $('//XCUIElementTypeStaticText[@name="Nebonozopurus gatejese"]');
export const s2 = () =>
  $(
    '//XCUIElementTypeSecureTextField[@name="GocibozuPenalIgug.voceseruBiful"]',
  );
export const s3 = () =>
  $('//XCUIElementTypeStaticText[contains(@name, "Zov retoh cuba sab")]');
export const s4 = () => $('//XCUIElementTypeButton[@name="Dobe sid"]');
export const s5 = () =>
  $('//*[@label="Bika kavemag" or @label="Bika rorefek"]');
export const d6 = () => $(`//XCUIElementTypeStaticText[@label="${message}"]`);
export const d7 = () =>
  $(
    `//*[contains(@name, "tete(${line}") and contains (@label, "Petor ${round}, Bevef daw notupisa")]`,
  );
export const d8 = () =>
  $(`//XCUIElementTypeStaticText[contains(@name, "${name}")]`);
export const d9 = () =>
  $(
    `//*[@name="Nodeg hom fericow"]/following-sibling::*[@label="${formattedWinners}"]`,
  );
export const many = () =>
  $$('//*[@label="Picama rajer t bevad motezef rari 0."]');
export const viaDriver = () =>
  driver.$('//XCUIElementTypeStaticText[@name="Nebonozopurus gatejese"]');
