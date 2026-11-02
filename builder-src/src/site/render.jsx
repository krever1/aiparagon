// Draws a page from its Puck data the way Puck's own renderer does for these sections (they have no
// nested drop zones, slots or rich text fields, and read only puck.isEditing), without Puck's editor
// code, so the live page's script stays small. The server and the browser both draw with this, so
// the browser takes over the server's HTML as it is.
const PUCK = Object.freeze({ isEditing: false, dragRef: null, metadata: {}, renderDropZone: () => null });

export function PageRender({ config, data }) {
  const root = (data && data.root) || {};
  const rootProps = ('props' in root ? root.props : root) || {};
  const items = ((data && data.content) || []).map((item, i) => {
    const comp = item && config.components[item.type];
    if (!comp) return null;
    const props = item.props || {};
    const Comp = comp.render;
    return <Comp key={props.id || i} {...props} puck={PUCK} />;
  });
  const Root = config.root && config.root.render;
  if (!Root) return <>{items}</>;
  return (
    <Root {...rootProps} puck={PUCK} title={rootProps.title || ''} editMode={false} id="puck-root">
      {items}
    </Root>
  );
}
