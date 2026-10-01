"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import { APP_DOWNLOAD_URL, LATEST_APP_VERSION, appVersion, isOlderVersion } from "@/lib/nativeApp";
import { useT } from "@/lib/i18n/LangContext";

const LATER_KEY = "appUpdateLaterUntil";
const LATER_DAYS = 3;

/** Inside an older Android app: a one-tap way to the newest APK. The app is
 * shared as a file, not through the Play Store, so nothing else would ever
 * tell a shop a new version exists. Installing it over the old one keeps the
 * login and everything else. The link leaves the app, so the phone's browser
 * downloads the file and offers to install it. */
export function AppUpdateBanner() {
  const { t } = useT();
  const [show, setShow] = useState(false);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const version = appVersion();
    if (!version || !isOlderVersion(version, LATEST_APP_VERSION)) return;
    let laterUntil = 0;
    try {
      laterUntil = Number(localStorage.getItem(LATER_KEY) ?? 0);
    } catch {}
    setShow(Date.now() >= laterUntil);
  }, []);

  if (!show) return null;

  function later() {
    try {
      localStorage.setItem(LATER_KEY, String(Date.now() + LATER_DAYS * 24 * 60 * 60 * 1000));
    } catch {}
    setShow(false);
  }

  return (
    <div className="no-print mb-3 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft px-3 py-2 text-xs text-brand-text">
      <Download size={14} className="shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        {started ? (
          t("Downloading… open the file and tap Install. Your login and data stay as they are.")
        ) : (
          <>
            <span className="font-semibold">{t("New app version ready.")}</span> {t("Takes a minute; your data stays.")}
          </>
        )}
      </p>
      {!started && (
        <a href={APP_DOWNLOAD_URL} onClick={() => setStarted(true)} className="shrink-0 rounded-full bg-brand px-3 py-1 font-semibold text-white">
          {t("Update")}
        </a>
      )}
      <button type="button" onClick={later} aria-label={t("Later")} className="shrink-0 rounded-full p-1">
        <X size={14} />
      </button>
    </div>
  );
}
