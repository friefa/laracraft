/** Settings for the static preview build (served below an unknown path, no SPA fallback). */
export const environment = {
  hashRouting: true,
  /** The artifact viewer's CSP blocks requests to AI providers: Lara cannot connect here. */
  sandboxedPreview: true,
};
