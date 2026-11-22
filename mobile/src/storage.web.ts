// Web không có SecureStore (bản web của expo-secure-store rỗng) — dùng localStorage cùng API.
export const getItemAsync = async (key: string) => localStorage.getItem(key);
export const setItemAsync = async (key: string, value: string) => localStorage.setItem(key, value);
export const deleteItemAsync = async (key: string) => localStorage.removeItem(key);
