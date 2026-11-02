// The live page's script: takes over the HTML the server sent (motion, the scroll story, the chat)
import { hydrateRoot } from 'react-dom/client';
import { PageTree } from './page.jsx';

const el = document.getElementById('sb-data');
const root = document.getElementById('sb-root');
if (el && root) {
  try {
    hydrateRoot(root, <PageTree info={JSON.parse(el.textContent)} />);
  } catch (e) {
    /* the page stays as the server drew it */
  }
}
