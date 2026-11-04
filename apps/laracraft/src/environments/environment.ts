/** Build-time settings. Replaced by `environment.artifact.ts` in the `artifact` build configuration. */
export const environment = {
  /** Hash-based routing (#/build/…) for hosts that serve the app below an unknown path. */
  hashRouting: false,
  /** Hosted preview whose content security policy blocks requests to AI providers. */
  sandboxedPreview: false,
};
