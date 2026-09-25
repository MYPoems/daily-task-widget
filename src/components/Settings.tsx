import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import type { Language, Translation } from "../i18n";
import { useSettingsStore, type Theme } from "../stores/settingsStore";

interface Props {
  t: Translation;
  language: Language;
  onLanguage: (language: Language) => void;
  onBack: () => void;
  onAlwaysOnTop: (enabled: boolean) => Promise<void>;
  onError: (error: unknown) => void;
}

export function Settings({ t, language, onLanguage, onBack, onAlwaysOnTop, onError }: Props) {
  const theme = useSettingsStore((state) => state.theme);
  const opacity = useSettingsStore((state) => state.opacity);
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setOpacity = useSettingsStore((state) => state.setOpacity);
  const [autostart, setAutostart] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    void isEnabled().then(setAutostart).catch(onError);
  }, [onError]);

  async function changeAutostart(enabled: boolean) {
    setBusy(true);
    try {
      if (enabled) await enable(); else await disable();
      setAutostart(await isEnabled());
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  }

  return <div className="page settings-page">
    <div className="page-heading"><button className="text-button" type="button" onClick={onBack}>← {t.back}</button><h2>{t.settings}</h2></div>
    <section className="settings-section"><h3>{t.appearance}</h3>
      <label className="settings-line"><span>{t.theme}</span><select value={theme} onChange={(event) => setTheme(event.target.value as Theme)}><option value="system">{t.systemTheme}</option><option value="light">{t.lightTheme}</option><option value="dark">{t.darkTheme}</option></select></label>
      <label className="settings-line"><span>{language === "zh" ? "语言" : "Language"}</span><select value={language} onChange={(event) => onLanguage(event.target.value as Language)}><option value="zh">中文</option><option value="en">English</option></select></label>
    </section>
    <section className="settings-section"><h3>{t.widgetSettings}</h3>
      <label className="settings-line"><span>{t.alwaysOnTop}</span><input type="checkbox" checked={alwaysOnTop} onChange={(event) => void onAlwaysOnTop(event.target.checked).catch(onError)} /></label>
      <label className="settings-line"><span>{t.opacity} · {opacity}%</span><input type="range" min="65" max="100" value={opacity} onChange={(event) => setOpacity(Number(event.target.value))} /></label>
    </section>
    <section className="settings-section"><h3>{t.systemSettings}</h3>
      <label className="settings-line"><span>{t.launchStartup}</span><input type="checkbox" checked={autostart} disabled={busy || !isTauri()} onChange={(event) => void changeAutostart(event.target.checked)} /></label>
      <div className="settings-line"><span>{t.shortcut}</span><strong>Ctrl + Alt + T</strong></div>
    </section>
  </div>;
}
