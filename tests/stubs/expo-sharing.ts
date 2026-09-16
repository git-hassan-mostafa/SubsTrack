// Handing a written file to the OS share sheet is platform behaviour, not a
// rule — no test drives it.
export const isAvailableAsync = async (): Promise<boolean> => false;
export const shareAsync = async (): Promise<void> => {};
export default { isAvailableAsync, shareAsync };
