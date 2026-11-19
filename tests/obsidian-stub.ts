// Resolution stub: the real `obsidian` package has no runtime entry. Tests override via vi.mock.
export const requestUrl = (): never => {
  throw new Error("obsidian.requestUrl is not available in tests; mock it");
};
