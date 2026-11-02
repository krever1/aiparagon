// A live page as visitors get it: the same sections the editor uses (render.jsx draws them the way
// Puck does), with the visitor chat for its chatbot.
import { PageRender } from './render.jsx';
import { config } from '../blocks.jsx';
import { PageCtx } from '../context.js';
import { brandOf } from '../chat.js';
import { visitorChat } from '../chat-visitor.js';

// info: { id, slug, live } as the site_page() database function gives it
export function PageTree({ info }) {
  const data = info.live;
  const rp = (data && data.root && data.root.props) || {};
  const chat = visitorChat(info.id);
  const ctx = {
    pageId: info.id,
    data,
    brand: brandOf(data),
    title: typeof rp.title === 'string' ? rp.title : '',
    pageText: '',
    ask: chat.ask,
    onLead: chat.lead,
  };
  return (
    <PageCtx.Provider value={ctx}>
      <PageRender config={config} data={data} />
    </PageCtx.Provider>
  );
}
