import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Theme = "system" | "light" | "dark";

interface SettingsState {
  theme: Theme;
  opacity: number;
  alwaysOnTop: boolean;
  setTheme: (theme: Theme) => void;
  setOpacity: (opacity: number) => void;
  setAlwaysOnTop: (enabled: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "system",
      opacity: 96,
      alwaysOnTop: false,
      setTheme: (theme) => set({ theme }),
      setOpacity: (opacity) => set({ opacity: Math.max(65, Math.min(100, opacity)) }),
      setAlwaysOnTop: (alwaysOnTop) => set({ alwaysOnTop }),
    }),
    {
      name: "daily-task-widget-settings",
      partialize: (state) => ({
        theme: state.theme,
        opacity: state.opacity,
        alwaysOnTop: state.alwaysOnTop,
      }),
    },
  ),
);
