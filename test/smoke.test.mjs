import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
let registration;

const ReactMock = {
  createElement: (type, props, ...children) => ({
    type,
    props: props || {},
    children,
  }),
  useState: initial => {
    const value = typeof initial === 'function' ? initial() : initial;
    return [value, () => {}];
  },
  useRef: value => ({ current: value }),
  useEffect: () => {},
  useCallback: fn => fn,
};

function mockRequire(specifier) {
  if (specifier === 'react') return ReactMock;
  throw new Error('unexpected require: ' + specifier);
}
mockRequire.asset = reference => reference;

const style = {
  setAttribute() {},
  remove() {},
  textContent: '',
};
globalThis.document = {
  baseURI: 'http://127.0.0.1:52022/',
  createElement: () => style,
  head: { appendChild() {} },
};

const sandbox = {
  window: { __ModuleLoader__: { load(value) { registration = value; } } },
  console,
  document: globalThis.document,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  URL,
};
vm.runInNewContext(source, sandbox, { filename: 'client.js' });
const bundle = registration.factory(mockRequire);
const api = bundle.__test;

let registeredComponent;
let registeredOptions;
let viewDefinition;
const ctx = {
  effect(fn) {
    const disposer = fn();
    return disposer;
  },
  locale: {
    register() {},
    bind() {
      return key => key;
    },
  },
  slots: {
    inject(key, callback) {
      const disposer = callback();
      return disposer;
    },
    register(options, component) {
      registeredComponent = component;
      registeredOptions = options;
      return () => {};
    },
  },
  uiConversation: {
    views: {
      register(definition) {
        viewDefinition = definition;
        return () => {};
      },
    },
  },
  sessions: {
    binding() {
      return {
        session: {
          projections: {
            faceOf() {
              return { getSnapshot: () => undefined };
            },
          },
        },
      };
    },
    list: { getSnapshot: () => ({ byId: {} }) },
  },
  get() {
    return { openResource() {} };
  },
};

bundle.apply(ctx);
assert.equal(registeredOptions.name, 'conversation.view');
assert.equal(registeredOptions.id, 'dafeiyu-counter');
assert.equal(registeredOptions.label(), 'view.label');
assert.ok(viewDefinition);
assert.equal(viewDefinition.target, 'dafeiyu-counter');

const fakeSession = { running: false, lastAgentError: null, openState: 'open' };
const fakeChat = {
  timeline: { turnOrder: [], turns: new Map() },
  legacy: { partial: null, runningCalls: [] },
  order: [],
  nodes: { get: () => undefined },
};
const props = {
  t: key => key,
  sessionId: 's1',
  useSession: selector => selector(fakeSession),
  useSessionStatus: selector => selector(new Map()),
  useChat: selector => selector(fakeChat),
  openPath: () => ({ ok: true }),
  loadImages: () => Promise.resolve({}),
  forkAt: () => {},
  rateMessage: () => Promise.resolve(false),
};
function expand(node) {
  if (node === null || node === undefined || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  if (Array.isArray(node.children)) {
    return { ...node, children: node.children.map(expand) };
  }
  return node;
}
let tree = expand(registeredComponent(props));
assert.equal(tree.props.className, 'dfc-view');
assert.equal(tree.props['data-state'], 'idle');
const serialized = JSON.stringify(tree, (key, value) => {
  if (key === 'type' && typeof value === 'function') return '[component]';
  return value;
});
assert.ok(serialized.includes('dfc-scene'));
assert.ok(serialized.includes('dfc-tabletop'));
assert.ok(serialized.includes('dfc-sign'));
assert.ok(serialized.includes('dfc-desk'));
assert.ok(serialized.includes('dfc-output'));
assert.ok(serialized.includes('dfc-compact'));
assert.ok(!serialized.includes('undefined'), 'rendered tree must not contain literal undefined');

// ---- pure helpers ------------------------------------------------------
assert.equal(api.formatTokenCount(0), '');
assert.equal(api.formatTokenCount(8123), '8.1k');
assert.equal(api.formatTokenCount(2400000), '2.4M');

const address = api.attachmentAddress('s1', { attachmentId: 'att-1', bytes: 42 }, 'notes.txt');
assert.ok(address.startsWith('dsh-resource://dafeiyu-attachment/session/'));
const parsedAddress = api.parseAttachmentAddress(address);
assert.equal(parsedAddress.sessionId, 's1');
assert.equal(parsedAddress.attachmentId, 'att-1');
assert.equal(parsedAddress.name, 'notes.txt');
assert.equal(parsedAddress.bytes, 42);
assert.equal(api.parseAttachmentAddress('dsh-resource://file/session/s1/a.txt'), undefined);
assert.equal(api.parseAttachmentAddress('not a url'), undefined);

const turnLocation = { turn: 3 };
const settledTool = {
  kind: 'tool-call',
  location: { kind: 'turn', turn: turnLocation },
  data: {
    root: {
      callId: 'c1', name: 'web_search', kind: 'tool-result', isError: false,
      call: { name: 'web_search', argsRaw: '{"queries":["dsh plugin docs"]}' },
      meta: { sources: [{ url: 'https://example.com/a', title: 'A' }], truncated: false },
      content: [], subCalls: [],
    },
  },
};
const runningTool = {
  kind: 'tool-call',
  location: { kind: 'turn', turn: turnLocation },
  data: { root: { callId: 'c2', name: 'read', phase: 'start', argsRaw: '{"file_path":"D:/x/client.js"}' } },
};
const oldTool = {
  kind: 'tool-call',
  location: { kind: 'turn', turn: { turn: 2 } },
  data: { root: { callId: 'old', name: 'bash', phase: 'start', argsRaw: '{"command":"ls"}' } },
};
const toolChat = {
  timeline: { turnOrder: [3], turns: new Map([[3, turnLocation]]) },
  legacy: { partial: null, runningCalls: [] },
  order: ['t1', 't2', 't3'],
  nodes: { get: key => ({ t1: settledTool, t2: runningTool, t3: oldTool })[key] },
};
const activity = api.collectToolActivity(toolChat);
assert.equal(activity.length, 2, 'older turns are excluded');
assert.equal(activity[0].kind, 'search');
assert.equal(activity[0].status, 'done');
assert.equal(activity[0].sources.length, 1);
assert.equal(activity[0].sources[0].host, 'example.com');
assert.equal(activity[1].kind, 'read');
assert.equal(activity[1].status, 'running');
assert.equal(activity[1].text, 'client.js');

assert.equal(api.summarizeTool('read', { file_path: 'D:/x/client.js' }, { kind: 'tool-result', isError: false, call: { name: 'read', argsRaw: '{"file_path":"D:/x/client.js"}' }, meta: null }).path, 'D:/x/client.js');
assert.equal(api.summarizeTool('web_search', { queries: ['q'] }, { kind: 'tool-result', isError: false, call: { name: 'web_search', argsRaw: '{"queries":["q"]}' }, meta: null }).path, undefined);

// ---- render with a tool turn + a user file attachment ------------------
const userFileNode = {
  kind: 'user',
  data: {
    content: [{ type: 'file', attachment: { attachmentId: 'f1', name: 'notes.txt', bytes: 12 } }],
    time: 0,
  },
};
const answerNode = {
  kind: 'assistant-step',
  visibility: 'visible',
  location: { kind: 'turn', turn: turnLocation },
  data: { blocks: [{ kind: 'text', text: 'done\n\n```js\nconst a = 1;\n```' }], status: 'settled', time: 0 },
};
const richTurn = {
  turn: 3,
  data: { get: key => (key === 'turn-tail' ? { tokenUsage: { totalTokens: 12345 } } : undefined) },
};
const richTool = {
  ...settledTool,
  location: { kind: 'turn', turn: richTurn },
};
const richChat = {
  timeline: { turnOrder: [3], turns: new Map([[3, richTurn]]) },
  legacy: { partial: null, runningCalls: [] },
  order: ['u1', 'a1', 't1'],
  nodes: { get: key => ({ u1: userFileNode, a1: answerNode, t1: richTool })[key] },
};
const richTree = expand(registeredComponent({ ...props, useChat: selector => selector(richChat) }));
const richSerialized = JSON.stringify(richTree, (key, value) => {
  if (key === 'type' && typeof value === 'function') return '[component]';
  return value;
});
assert.ok(richSerialized.includes('dfc-workpill'), 'work pill renders for tool activity');
assert.ok(richSerialized.includes('dfc-user-file'), 'user file attachments render as chips');
assert.ok(richSerialized.includes('dfc-turn-meta'), 'turn meta line renders');
assert.ok(richSerialized.includes('work.sourceCount'), 'source count is projected');
assert.ok(richSerialized.includes('dfc-code'), 'fenced code renders as a code block');
assert.ok(!richSerialized.includes('```'), 'code fence markers do not leak into the transcript');

// ---- inline markdown images -------------------------------------------
assert.equal(api.parseMarkdownImage('https://example.com/a.png', 'a'), null);
const parsedImage = api.parseMarkdownImage('G:/proj/shot.png', 'shot');
assert.equal(parsedImage.kind, 'image');
assert.equal(parsedImage.path, 'G:/proj/shot.png');
const mdNodes = api.inlineMarkdown('看图 ![shot](G:/proj/shot.png)', 'k', {
  parse: (url, label) => api.parseMarkdownImage(url, label),
  resolve: () => 'blob:mock',
  open: () => {},
});
const mdSerialized = JSON.stringify(mdNodes, (key, value) => {
  if (key === 'type' && typeof value === 'function') return '[component]';
  return value;
});
assert.ok(mdSerialized.includes('dfc-md-image'), 'markdown image renders as an image');
assert.ok(mdSerialized.includes('blob:mock'), 'markdown image uses the resolved URL');

// ---- autolinks ----------------------------------------------------------
const autoNodes = api.inlineMarkdown('see <https://example.com/x> and https://example.com/y.', 'al', undefined, key => key);
const autoSerialized = JSON.stringify(autoNodes, (key, value) => {
  if (key === 'type' && typeof value === 'function') return '[component]';
  return value;
});
assert.ok(autoSerialized.includes('"href":"https://example.com/x"'), 'angle autolink becomes an anchor');
assert.ok(autoSerialized.includes('"href":"https://example.com/y"'), 'bare URL becomes an anchor');
const cjkNodes = api.inlineMarkdown('看 https://example.com/z，然后回来。', 'cjk', undefined, key => key);
const cjkSerialized = JSON.stringify(cjkNodes, (key, value) => {
  if (key === 'type' && typeof value === 'function') return '[component]';
  return value;
});
assert.ok(cjkSerialized.includes('"href":"https://example.com/z"'), 'bare URL stops before Chinese punctuation');
assert.ok(!cjkSerialized.includes('href":"https://example.com/z，'), 'Chinese punctuation is not part of the link');
assert.ok(cjkSerialized.includes('然后回来'), 'text after the URL stays plain text');
assert.equal(api.summarizeTool('web_fetch', { url: 'https://example.com/page' }, { kind: 'tool-result', isError: false, call: { name: 'web_fetch', argsRaw: '{"url":"https://example.com/page"}' }, meta: null }).url, 'https://example.com/page');

// ---- fenced code blocks -------------------------------------------------
const codeOnly = api.renderMarkdown('```powershell\nnpm publish\n```', 'cb', undefined, key => key);
assert.equal(codeOnly.length, 1);
assert.equal(codeOnly[0].props.code, 'npm publish');
assert.equal(codeOnly[0].props.lang, 'powershell');
const quotedCode = api.renderMarkdown('> ```js\n> const a = 1;\n> ```', 'qb', undefined, key => key);
assert.equal(quotedCode.length, 1);
assert.equal(quotedCode[0].type, 'blockquote');
const nested = quotedCode[0].children.flat(Infinity).filter(node => node !== null && typeof node === 'object');
assert.ok(nested.some(node => node.props && node.props.code === 'const a = 1;'), 'code inside a blockquote renders as a code block');

// ---- fallback identity: no cross-turn image replay ---------------------
function findByClass(node, className) {
  if (node === null || typeof node !== 'object') return undefined;
  if (node.props && node.props.className === className) return node;
  for (const child of node.children || []) {
    const found = findByClass(child, className);
    if (found !== undefined) return found;
  }
  return undefined;
}
function serializeNode(node) {
  return JSON.stringify(node, (key, value) => (key === 'type' && typeof value === 'function' ? '[component]' : value));
}
const imageTurn = { turn: 7, status: 'closed' };
const imageUser = {
  kind: 'user',
  visibility: 'visible',
  location: { kind: 'turn', turn: imageTurn },
  data: { content: [{ type: 'image', attachment: { attachmentId: 'img-2', name: 'new.png', bytes: 1 } }] },
};
const imageAssistant = {
  kind: 'assistant-step',
  visibility: 'visible',
  location: { kind: 'turn', turn: imageTurn },
  data: { blocks: [{ kind: 'text', text: '旧图 ![old](D:/old.png)' }], status: 'settled', step: 1 },
};
const nextTurn = { turn: 8, status: 'running' };
const nextAssistant = {
  kind: 'assistant-step',
  visibility: 'visible',
  location: { kind: 'turn', turn: nextTurn },
  data: { blocks: [{ kind: 'text', text: '新回合回复' }], status: 'settled', step: 1 },
};
function fallbackChat(partial) {
  return {
    timeline: { turnOrder: [7, 8], turns: new Map([[7, imageTurn], [8, nextTurn]]) },
    legacy: { partial, runningCalls: [] },
    order: ['iu', 'ia', 'ju', 'ja'],
    nodes: { get: key => ({ iu: imageUser, ia: imageAssistant, ju: imageUser, ja: nextAssistant })[key] },
  };
}
const liveChat = fallbackChat({ turn: 9, step: 1, blocks: [{ kind: 'text', text: '流式回复' }] });
const liveTree = expand(registeredComponent({ ...props, useChat: selector => selector(liveChat) }));
const liveSerialized = serializeNode(liveTree);
assert.ok(liveSerialized.includes('"key":"partial:9:1"'), 'partial fallback key carries turn/step');
assert.ok(!liveSerialized.includes('"key":"partial"'), 'constant partial key is gone');
const liveThread = findByClass(liveTree, 'dfc-thread');
assert.ok(liveThread !== undefined, 'thread renders');
const liveThreadSerialized = serializeNode(liveThread);
assert.equal((liveThreadSerialized.match(/old\.png/g) || []).length, 1, 'previous inline image stays in its own turn');
assert.ok(liveThreadSerialized.includes('new.png'), 'the new attachment renders in the user tag');
assert.ok(liveThreadSerialized.includes('流式回复'), 'the running partial still renders');

const staleChat = fallbackChat({ turn: 7, step: 1, blocks: [{ kind: 'text', text: '旧图 ![old](D:/old.png)' }] });
const staleTree = expand(registeredComponent({ ...props, useChat: selector => selector(staleChat) }));
const staleSerialized = serializeNode(staleTree);
assert.ok(!staleSerialized.includes('"key":"partial:7:1"'), 'a partial for a settled step is not replayed');
const staleThread = findByClass(staleTree, 'dfc-thread');
assert.equal((serializeNode(staleThread).match(/old\.png/g) || []).length, 1, 'stale partial does not duplicate the old image');
console.log('render smoke: PASS');
