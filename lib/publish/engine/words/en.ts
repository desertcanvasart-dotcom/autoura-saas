import type { LanguageWords } from './types'

export const en: LanguageWords = {
  numbers: [
    'zero', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve',
    'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
    'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety', 'hundred', 'hundreds', 'thousand',
    'thousands', 'million', 'millions', 'dozen', 'dozens', 'half', 'twice', 'triple', 'double',
    // Ordinals from "second": "first" is everyday prose ("a first glimpse").
    'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth', 'eleventh',
    'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth',
    'nineteenth', 'twentieth', 'hundredth', 'thousandth',
  ],
  currency: ['euro', 'euros', 'dollar', 'dollars', 'pound sterling', 'pounds sterling', 'cents', 'piastres'],
  dates: [
    'january', 'february', 'march', 'april', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
    'mondays', 'tuesdays', 'wednesdays', 'thursdays', 'fridays', 'saturdays', 'sundays',
    'daily', 'every day', 'everyday', 'weekly', 'every week', 'nightly', 'year-round', 'year round', 'all year',
    'weekend', 'weekends', 'tonight', 'tomorrow',
  ],
  capitalisedOnly: ['May'],
  policyStems: [
    'price*', 'pricing', 'priced', 'cost', 'costs', 'costing', 'fee', 'fees',
    'rate', 'rates', 'discount*', 'cheap*', 'affordab*', 'refund*', 'non-refundable', 'nonrefundable',
    'cancel*', 'deposit*', 'guarantee*', 'warrant*', 'free of charge', 'free', 'complimentary', 'included',
    'includes', 'inclusive', 'all-inclusive', 'excluded', 'excludes', 'book now', 'booking*', 'per person',
    'insurance', 'visa', 'visas', 'tax', 'taxes', 'vat', 'surcharge*', 'supplement*',
  ],
  claims: [
    'best', 'finest', 'greatest', 'leading', 'only', 'unique', 'unrivalled', 'unrivaled', 'unmatched',
    'unbeatable', 'award-winning', 'award winning', 'world-class', 'world class', 'number one', 'top-rated',
    'licensed', 'certified', 'official', 'exclusive', 'expert', 'experts', 'egyptologist', 'egyptologists', 'since',
  ],
}
