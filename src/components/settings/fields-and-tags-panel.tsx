'use client';

import { useCan } from '@/hooks/use-can';

import { CustomFieldsSettings } from './custom-fields-settings';
import { SettingsPanelHead } from './settings-panel-head';
import { TagManager } from './tag-manager';

import { useT } from "@/i18n/provider";
/**
 * "Fields & tags" section — merges the former Tags and Custom Fields
 * tabs. Tags are visible to everyone; the custom-fields catalogue is
 * account-wide config, so the card is admin-gated (mirroring the old
 * hidden-tab behaviour). `custom_fields` RLS rejects non-admin writes
 * regardless.
 */
export function FieldsAndTagsPanel() {
  const { t } = useT();
  const canEditSettings = useCan('edit-settings');

  return (
    <section className="max-w-3xl animate-in fade-in-50 space-y-4 duration-200">
      <SettingsPanelHead
        title={t("settings_fields_and_tags_panel.001")}
        description="Two ways to organize contacts: colour-coded tags for quick grouping, and custom fields for structured data."
      />
      <TagManager />
      {canEditSettings ? <CustomFieldsSettings /> : null}
    </section>
  );
}
