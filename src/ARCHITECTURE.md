# Front-end structure

`App.vue` is the composition root: it owns editor state, coordinates desktop APIs, and opens or closes dialogs.

- `components/AppSidebar.vue` — application navigation and search.
- `components/WorkspaceHeader.vue` — draft, release, and settings controls.
- `pages/DeploymentsPage.vue` — deployment/build editor.
- `pages/JsonPreviewPage.vue` — readable JSON preview.
- `composables/useDraftHistory.js` — browser draft persistence and undo/redo history.
- `services/logoProcessing.js` — image decoding and PNG logo generation.
- `utils/text.js` — name, slug, and URL normalisation.
- `utils/validation.js` — store-document validation and UI-addressable issues.
- `utils/release.js` — export cleanup and version progression.

New editor features should be placed with the concern they belong to. Keep `App.vue` focused on composing state and passing events between pages, components, and services.
