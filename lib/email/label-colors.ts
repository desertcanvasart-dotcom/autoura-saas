// Folder colours: Gmail accepts only colours from its own palette for labels,
// so these are a selection of Gmail's pairs. The folder menu offers them; the
// labels route refuses anything else.

/** Gmail's label colour palette (https://developers.google.com/gmail/api/reference/rest/v1/users.labels). */
export const GMAIL_LABEL_COLORS: Array<{ backgroundColor: string; textColor: string }> = [
  { backgroundColor: '#fb4c2f', textColor: '#ffffff' },
  { backgroundColor: '#ffad47', textColor: '#ffffff' },
  { backgroundColor: '#fad165', textColor: '#000000' },
  { backgroundColor: '#16a766', textColor: '#ffffff' },
  { backgroundColor: '#43d692', textColor: '#ffffff' },
  { backgroundColor: '#4a86e8', textColor: '#ffffff' },
  { backgroundColor: '#a479e2', textColor: '#ffffff' },
  { backgroundColor: '#f691b3', textColor: '#ffffff' },
  { backgroundColor: '#2da2bb', textColor: '#ffffff' },
  { backgroundColor: '#b99aff', textColor: '#ffffff' },
  { backgroundColor: '#cca6ac', textColor: '#ffffff' },
  { backgroundColor: '#999999', textColor: '#ffffff' },
]
