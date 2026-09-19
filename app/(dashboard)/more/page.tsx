import { getTranslator } from "@/lib/i18n/server";
import { MoreDrawerShell } from "./MoreDrawerShell";
import { MoreMenu } from "./MoreMenu";

/** Direct visits to /more (bookmarks, old links). In the app the menu opens
 * as a drawer over the current page instead (MenuDrawer). */
export default async function MorePage() {
  const { t } = await getTranslator();
  return (
    <MoreDrawerShell title={t("more.title")}>
      <MoreMenu />
    </MoreDrawerShell>
  );
}
