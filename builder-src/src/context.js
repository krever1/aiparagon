// What the editor shares with the parts Puck renders for it (the header buttons, the AI panel):
// the page id, the save state, flush and publish, and the AI session (see useAiSession)
import { createContext } from 'react';

export const EditorCtx = createContext(null);

// What the published view tells the page it renders (the chatbot reads it): the page id, its data,
// the brand and words the chatbot answers from, where its contacts go and where to sign in
export const PageCtx = createContext(null);
