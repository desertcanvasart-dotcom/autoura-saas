// The words a language's post-check refuses outside a fact slot, and the
// claims it flags for the reviewer. One file per supported language
// (docs/publish/PLAN.md D14): a language cannot be enabled on a site until
// its list exists and its tests pass.

export interface LanguageWords {
  /** Numbers and ordinals, as whole words (`*` = prefix, as below). Articles that double as "one"
   *  (en "a", fr "un", es "uno") are left out — refusing them would refuse
   *  every sentence. */
  numbers: string[]
  /** Currency names; symbols and ISO codes are checked for every language. */
  currency: string[]
  /** Month names, weekday names, and schedule words ("daily"). */
  dates: string[]
  /** Policy and promise words: price, refund, cancel, deposit, guarantee,
   *  included… Whole words or phrases; an entry ending in `*` is a prefix
   *  ("refund*" catches "refundable"). Short words stay whole ("free" must
   *  not catch "freedom", "tax" must not catch "taxi"). */
  policyStems: string[]
  /** Superlatives and claims: flagged for review unless on the brand's
   *  claim list, never rejected outright. */
  claims: string[]
  /** Month names that are also ordinary words, checked only when capitalised
   *  mid-sentence (en "May"). */
  capitalisedOnly?: string[]
}
