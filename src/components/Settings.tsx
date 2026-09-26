import { useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { documentDir, join } from "@tauri-apps/api/path";
import { disable, enable, isEnabled } from "@tauri-apps/plugin-autostart";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Language, Translation } from "../i18n";
import { taskService } from "../services/taskService";
import { useSettingsStore, type Theme } from "../stores/settingsStore";

interface Props {
  t: Translation;
  language: Language;
  onLanguage: (language: Language) => void;
  onBack: () => void;
  onAlwaysOnTop: (enabled: boolean) => Promise<void>;
  onError: (error: unknown) => void;
  onImported: () => Promise<void>;
  onNotice: (message: string) => void;
}

export function Settings({ t, language, onLanguage, onBack, onAlwaysOnTop, onError, onImported, onNotice }: Props) {
  const theme = useSettingsStore((state) => state.theme);
  const opacity = useSettingsStore((state) => state.opacity);
  const alwaysOnTop = useSettingsStore((state) => state.alwaysOnTop);
  const setTheme = useSettingsStore((state) => state.setTheme);
  const setOpacity = useSettingsStore((state) => state.setOpacity);
  const [autostart, setAutostart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);

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

  async function exportBackup() {
    setBackupBusy(true);
    try {
      const defaultPath = await join(await documentDir(), `daily-task-widget-${new Date().toISOString().slice(0, 10)}.json`);
      const path = await save({ defaultPath, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (path) onNotice(t.backupExported(await taskService.exportBackup(path)));
    } catch (error) { onError(error); }
    finally { setBackupBusy(false); }
  }

  async function importBackup() {
    setBackupBusy(true);
    try {
      const path = await open({ multiple: false, directory: false, filters: [{ name: "JSON", extensions: ["json"] }] });
      if (path) {
        const summary = await taskService.importBackup(path);
        await onImported();
        onNotice(t.backupImported(summary.imported, summary.skipped));
      }
    } catch (error) { onError(error); }
    finally { setBackupBusy(false); }
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
    <section className="settings-section"><h3>{t.backupTitle}</h3>
      <p className="settings-help">{t.backupHint}</p>
      <div className="backup-actions">
        <button className="secondary-button" type="button" disabled={backupBusy || !isTauri()} onClick={() => void exportBackup()}>{t.exportBackup}</button>
        <button className="secondary-button" type="button" disabled={backupBusy || !isTauri()} onClick={() => void importBackup()}>{t.importBackup}</button>
      </div>
    </section>
  </div>;
}
