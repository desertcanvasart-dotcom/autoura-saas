import LegacySettingsTabs from '@/components/settings/LegacySettingsTabs'

// The default currency and exchange rates still sit in the old Preferences
// tab, until the Currencies & rates page replaces it.
export default function CurrenciesSettingsPage() {
  return <LegacySettingsTabs tab="preferences" />
}
