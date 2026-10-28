// What the editor shares with the parts Puck renders for it (the header buttons, the AI panel):
// the page id, the save state, flush and publish, and the AI session (see useAiSession)
import { createContext } from 'react';

export const EditorCtx = createContext(null);
