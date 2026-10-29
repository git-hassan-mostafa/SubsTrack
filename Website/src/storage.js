// Private browsing can block storage; a lost setting must never break the page.
export function saveSetting(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}
