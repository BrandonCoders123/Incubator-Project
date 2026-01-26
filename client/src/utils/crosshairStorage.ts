const STORAGE_KEY = "selectedCrosshairId";

export const saveCrosshair = (id: string) => {
  localStorage.setItem(STORAGE_KEY, id);
};

export const loadCrosshair = (): string | null => {
  return localStorage.getItem(STORAGE_KEY);
};
