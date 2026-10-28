// Starting points for a new page. Each returns Puck data: page settings in root.props, sections in
// content. "Cinematic" is the showcase (a made-up studio's homepage); "Business" is a plain layout
// whose copy tells the owner what to write; "Blank" starts empty.
// No invented testimonials, logos or numbers in any of them.

export const ROOT_DEFAULTS = {
  title: 'Untitled page',
  description: '',
  slug: 'page',
  theme: 'dark',
  accent: 'cyan',
  font: 'grotesk',
};

const TEMPLATES = {
  cinematic: {
    label: 'Cinematic',
    blurb: 'A moving hero, a scene that plays as you scroll, then the usual sections.',
    root: {
      theme: 'dark',
      accent: 'cyan',
      font: 'grotesk',
      description: 'Kinetic Studio builds cinematic websites: a scene that moves as visitors scroll, with every word kept as real, searchable text.',
    },
    content: () => [
      { type: 'Navbar', props: { brand: 'Kinetic Studio', links: [{ label: 'Story', href: '#story' }, { label: 'Services', href: '#services' }, { label: 'Process', href: '#process' }, { label: 'FAQ', href: '#faq' }], ctaLabel: 'Start a project', ctaHref: '#contact' } },
      {
        type: 'Hero',
        props: {
          anchor: 'top',
          eyebrow: 'Websites that move',
          headline: 'Your story, told at the speed of scroll',
          subhead: 'Cinematic pages built around your brand. A scene plays as visitors scroll, and every word stays real text that search engines can read.',
          primaryLabel: 'Start a project',
          primaryHref: '#contact',
          secondaryLabel: 'See how it works',
          secondaryHref: '#story',
          background: 'particles',
          videoUrl: '',
          imageUrl: '',
          imageAlt: '',
          align: 'center',
          size: 'full',
        },
      },
      {
        type: 'ScrollStory',
        props: {
          anchor: 'story',
          scene: 'space',
          videoUrl: '',
          layout: 'alternate',
          chapters: [
            { kicker: 'Scene 1', heading: 'Open on a scene', text: 'The first screen sets the mood with one continuous shot, made for your brand.' },
            { kicker: 'Scene 2', heading: 'Let the scroll drive it', text: 'As visitors scroll, the scene moves with them. Scroll back and it rewinds.' },
            { kicker: 'Scene 3', heading: 'Land the message', text: 'Each chapter carries one idea, so the story reads clearly on any screen.' },
          ],
        },
      },
      {
        type: 'Features',
        props: {
          anchor: 'services',
          eyebrow: 'What you get',
          title: 'Everything a cinematic site needs',
          intro: 'Motion where it counts, and a page your team can keep changing.',
          columns: '3',
          items: [
            { icon: 'film', title: 'Scroll-driven scenes', text: 'A background that plays as visitors scroll, and holds still for anyone who turns motion off.' },
            { icon: 'cursor', title: 'Edit it yourself', text: 'Click any text to change it, drag sections into place and check phone and desktop views.' },
            { icon: 'search', title: 'Built to be found', text: 'Real headings, page titles and descriptions, so search engines can read every page.' },
          ],
        },
      },
      {
        type: 'Steps',
        props: {
          anchor: 'process',
          eyebrow: 'How it works',
          title: 'From first idea to live page',
          items: [
            { title: 'Tell us about your business', text: 'What you sell, who it is for and the feeling the site should leave.' },
            { title: 'Pick a scene and a look', text: 'Choose the scene that plays behind your story, then the colors and fonts.' },
            { title: 'Edit, preview, publish', text: 'Change anything on the page, check it on a phone, then publish when it is ready.' },
          ],
        },
      },
      {
        type: 'Split',
        props: {
          anchor: '',
          eyebrow: 'Always editable',
          heading: 'A page you can keep changing',
          text: 'Swap a headline, add a section or try a new color. Changes save as you go, and nothing goes live until you publish.',
          buttonLabel: 'Start a project',
          buttonHref: '#contact',
          visual: 'orb',
          imageUrl: '',
          imageAlt: '',
          side: 'right',
        },
      },
      {
        type: 'Faq',
        props: {
          anchor: 'faq',
          title: 'Questions, answered',
          items: [
            { question: 'Can I edit the site after it launches?', answer: 'Yes. Every word, color and section can be changed in the editor, and changes go live when you publish.' },
            { question: 'What about visitors who turn motion off?', answer: 'The scenes hold still and every chapter stays on the page, so nobody misses the story.' },
            { question: 'Will it work on phones?', answer: 'Every section adapts to phone, tablet and desktop, and the editor previews all three.' },
          ],
        },
      },
      { type: 'Cta', props: { anchor: 'contact', headline: 'Ready to see your story move?', text: 'Tell us about your business and we will come back with a first draft.', buttonLabel: 'Start a project', buttonHref: 'mailto:hello@example.com' } },
      { type: 'Footer', props: { brand: 'Kinetic Studio', note: 'Sample page made in the AI Paragon site builder demo.', links: [{ label: 'Story', href: '#story' }, { label: 'FAQ', href: '#faq' }, { label: 'Contact', href: '#contact' }], smallprint: '© 2026 Kinetic Studio' } },
    ],
  },

  business: {
    label: 'Business',
    blurb: 'A clean page for a service business. The copy tells you what to write where.',
    root: {
      theme: 'light',
      accent: 'blue',
      font: 'editorial',
      description: 'Say what the business does and who it is for in one or two sentences. This shows under the page title in search results.',
    },
    content: () => [
      { type: 'Navbar', props: { brand: 'Your business', links: [{ label: 'Services', href: '#services' }, { label: 'How it works', href: '#process' }, { label: 'FAQ', href: '#faq' }], ctaLabel: 'Get in touch', ctaHref: '#contact' } },
      {
        type: 'Hero',
        props: {
          anchor: 'top',
          eyebrow: 'Your one-line promise',
          headline: 'Say what you do in one clear line',
          subhead: 'Add a sentence on who it is for and what changes for them. Click any text on the page to edit it.',
          primaryLabel: 'Book a call',
          primaryHref: '#contact',
          secondaryLabel: 'See services',
          secondaryHref: '#services',
          background: 'grid',
          videoUrl: '',
          imageUrl: '',
          imageAlt: '',
          align: 'left',
          size: 'tall',
        },
      },
      {
        type: 'Features',
        props: {
          anchor: 'services',
          eyebrow: 'Services',
          title: 'What you offer',
          intro: 'Three short cards work best. Select a card section to change its icons, titles and text.',
          columns: '3',
          items: [
            { icon: 'spark', title: 'First service', text: 'One or two sentences on what it is and the result it brings.' },
            { icon: 'layers', title: 'Second service', text: 'Keep each card about one thing, in the words your clients use.' },
            { icon: 'shield', title: 'Third service', text: 'Add or remove cards in the panel on the right.' },
          ],
        },
      },
      {
        type: 'Split',
        props: {
          anchor: '',
          eyebrow: 'About',
          heading: 'Why clients choose you',
          text: 'Tell your story in a short paragraph: how you started, what you believe and how you work.',
          buttonLabel: 'Get in touch',
          buttonHref: '#contact',
          visual: 'rings',
          imageUrl: '',
          imageAlt: '',
          side: 'left',
        },
      },
      {
        type: 'Steps',
        props: {
          anchor: 'process',
          eyebrow: 'How it works',
          title: 'Three steps to get started',
          items: [
            { title: 'Reach out', text: 'Say how people get in touch: a call, a form or a visit.' },
            { title: 'Plan together', text: 'Explain what happens in the first meeting.' },
            { title: 'Get results', text: 'Describe what the client has at the end.' },
          ],
        },
      },
      {
        type: 'Faq',
        props: {
          anchor: 'faq',
          title: 'Common questions',
          items: [
            { question: 'Who is this for?', answer: 'Describe your ideal client in a sentence or two.' },
            { question: 'How much does it cost?', answer: 'Give a price, a range or how you quote. Clear answers build trust.' },
            { question: 'How do I get started?', answer: 'Point to the button at the bottom of the page.' },
          ],
        },
      },
      { type: 'Cta', props: { anchor: 'contact', headline: 'Ready to talk?', text: 'Add one line on what happens when someone gets in touch.', buttonLabel: 'Book a call', buttonHref: 'mailto:hello@example.com' } },
      { type: 'Footer', props: { brand: 'Your business', note: 'Add your address, phone or a short line about the business.', links: [{ label: 'Services', href: '#services' }, { label: 'Contact', href: '#contact' }], smallprint: '© 2026 Your business' } },
    ],
  },

  blank: {
    label: 'Blank',
    blurb: 'An empty page. Add sections from the Blocks list.',
    root: { theme: 'dark', accent: 'cyan', font: 'grotesk', description: '' },
    content: () => [],
  },
};

export const TEMPLATE_LIST = Object.entries(TEMPLATES).map(([key, t]) => ({ key, label: t.label, blurb: t.blurb }));

export function makeData(kind, { title, slug }) {
  const t = TEMPLATES[kind] || TEMPLATES.blank;
  const counts = {};
  const content = t.content().map((block) => {
    counts[block.type] = (counts[block.type] || 0) + 1;
    return { type: block.type, props: { id: block.type + '-' + counts[block.type], ...block.props } };
  });
  return {
    root: { props: { ...ROOT_DEFAULTS, ...t.root, title: title || ROOT_DEFAULTS.title, slug: slug || ROOT_DEFAULTS.slug } },
    content,
    zones: {},
  };
}
