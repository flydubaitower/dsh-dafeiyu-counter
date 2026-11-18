import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(import.meta.dirname, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');
let registration;
const sandbox = {
  window: {
    __ModuleLoader__: {
      load(value) { registration = value; },
    },
  },
  console,
};
vm.runInNewContext(source, sandbox, { filename: 'client.js' });
assert.ok(registration, 'client bundle must register a module');
assert.equal(registration.id, 'dsh-dafeiyu-counter');

const ReactMock = {
  createElement: () => null,
  useState: () => [0, () => {}],
  useRef: value => ({ current: value }),
  useEffect: () => {},
  useCallback: fn => fn,
};
function mockRequire(specifier) {
  if (specifier === 'react') return ReactMock;
  throw new Error('unexpected require: ' + specifier);
}
mockRequire.asset = reference => reference;
const exports = registration.factory(mockRequire);
const test = exports.__test;
assert.ok(test, 'bundle must expose its pure functions for tests');
assert.ok(exports.inject.includes('slots'));
assert.equal(typeof exports.apply, 'function');

// ------------------------------------------------------------------ state
const base = {
  running: false,
  pending: undefined,
  toolRunning: false,
  latestEnd: 'completed',
  latestStatus: 'closed',
  lastAgentError: null,
  openState: 'open',
  streaming: false,
};
assert.equal(test.deriveState(base).state, 'idle');
assert.equal(test.deriveState({ ...base, running: true }).state, 'thinking');
assert.equal(test.deriveState({ ...base, running: true, toolRunning: true }).state, 'tool');
assert.equal(test.deriveState({ ...base, pending: { kind: 'approval', toolName: 'bash' } }).state, 'approval');
assert.equal(test.deriveState({ ...base, latestEnd: 'error' }).state, 'error');
assert.equal(test.deriveState({ ...base, latestEnd: 'interrupted' }).state, 'error');
assert.equal(test.deriveState(base).state, 'idle', 'aborted/completed must not become an error');
assert.equal(test.deriveState({ ...base, latestStatus: 'open' }).state, 'thinking');
assert.equal(test.deriveState({ ...base, latestEnd: undefined, lastAgentError: 'boom' }).state, 'error');
assert.equal(
  test.deriveState({ ...base, latestEnd: 'completed', lastAgentError: 'stale' }).state,
  'idle',
  'a stale agent error must not outlive a completed turn',
);
assert.equal(
  test.deriveState({ ...base, running: true, lastAgentError: 'live' }).state,
  'thinking',
  'an agent error must not preempt the running state',
);
assert.equal(test.deriveState({ ...base, openState: 'error' }).state, 'error');

// ------------------------------------------------------------- markdown
const parsed = test.parseMarkdownItems([{
  kind: 'text',
  text: [
    'see ![shot](images/a%20b.png)',
    'and [report](docs/report.md#L12-L20)',
    'and [win](C:\\tmp\\note.txt)',
    'and [remote](https://example.com/x.png)',
  ].join('\n'),
}]);
assert.equal(parsed.images.length, 1);
assert.equal(parsed.images[0].path, 'images/a b.png');
assert.equal(parsed.files.length, 2);
assert.equal(parsed.files[0].line, 12);
assert.equal(parsed.files[1].path, 'C:\\tmp\\note.txt');
assert.ok(parsed.files.every(item => !item.path.startsWith('https:')));

// ---------------------------------------------------------- latest reply
const closing = {
  turn: 7,
  blocks: [{
    kind: 'text',
    text: 'hello ![shot](images/a.png)\n[report](docs/report.md#L12)',
  }, {
    kind: 'image',
    attachment: { attachmentId: 'att-1', name: 'screen' },
  }],
};
const turn = {
  turn: 7,
  status: 'closed',
  end: { data: { reason: { kind: 'completed' } } },
  data: { get: key => (key === 'turn-tail' ? { closing } : undefined) },
};
const chat = {
  timeline: { turnOrder: [7], turns: new Map([[7, turn]]) },
  legacy: { partial: null, runningCalls: [] },
  order: [],
  nodes: { get: () => undefined },
};
const reply = test.latestReply(chat);
assert.ok(reply);
assert.equal(reply.status, 'settled');
assert.ok(reply.text.includes('hello'));
assert.equal(reply.images.length, 2);
assert.equal(reply.images[1].source, 'attachment');
assert.equal(reply.files.length, 1);
assert.equal(reply.files[0].line, 12);

const streamingTurn = {
  turn: 8,
  status: 'open',
  data: { get: () => undefined },
};
const streaming = {
  timeline: { turnOrder: [8], turns: new Map([[8, streamingTurn]]) },
  legacy: { partial: { turn: 8, blocks: [{ kind: 'text', text: 'thinking out loud' }] }, runningCalls: [] },
  order: [],
  nodes: { get: () => undefined },
};
assert.equal(test.latestReply(streaming).status, 'streaming');
assert.ok(test.latestReply(streaming).text.includes('thinking'));

const fallbackChat = {
  timeline: { turnOrder: [], turns: new Map() },
  legacy: { partial: null, runningCalls: [] },
  order: ['n1'],
  nodes: { get: key => (key === 'n1' ? {
    kind: 'assistant-step',
    visibility: 'visible',
    data: { status: 'settled', blocks: [{ kind: 'text', text: 'fallback' }] },
  } : undefined) },
};
assert.equal(test.latestReply(fallbackChat).text, 'fallback');

// ------------------------------------------------------------- reasoning
const reasoningChat = {
  order: ['r1'],
  nodes: new Map([['r1', {
    kind: 'assistant-step',
    visibility: 'visible',
    data: { blocks: [{ type: 'reasoning', text: '先看状态' }] },
  }]]),
};
assert.equal(test.latestReasoning(reasoningChat), '先看状态');

const reasoningThenText = {
  order: ['r2'],
  nodes: new Map([['r2', {
    kind: 'assistant-step',
    visibility: 'visible',
    data: { blocks: [
      { kind: 'reasoning', text: '想完了' },
      { kind: 'text', text: '答案' },
    ] },
  }]]),
};
assert.equal(test.latestReasoning(reasoningThenText), '想完了');

const streamingReasoning = {
  legacy: { partial: { blocks: [{ kind: 'reasoning', text: '实时思考' }] } },
};
assert.equal(test.latestReasoning(streamingReasoning), '实时思考');

const streamingReasoningWithText = {
  legacy: { partial: { blocks: [
    { kind: 'reasoning', text: '实时思考' },
    { kind: 'text', text: '开始回答' },
  ] } },
};
assert.equal(test.latestReasoning(streamingReasoningWithText), '实时思考');

// ---------------------------------------------------- thought reactions
assert.equal(test.classifyThought('哈哈，这个真有趣'), 'laugh');
assert.equal(test.classifyThought('抱歉，这涉及安全底线，不能提供'), 'sweat');
assert.equal(test.classifyThought('真遗憾，替她难过'), 'sad');
assert.equal(test.classifyThought('糟糕，oops，出错了'), 'surprised');
assert.equal(test.classifyThought('先看文件结构，再读实现'), '');

// ---------------------------------------------------- user content parts
const userContentChat = {
  order: ['u1'],
  nodes: new Map([['u1', {
    kind: 'user',
    visibility: 'visible',
    data: { content: [
      { type: 'text', text: '第一行\n第二行' },
      { type: 'image', attachment: { attachmentId: 'img-1', name: 'shot.png' } },
      { type: 'file', attachment: { attachmentId: 'file-1', name: 'doc.pdf' } },
    ] },
  }]]),
};
const userContentItems = test.conversationItems(userContentChat);
assert.equal(userContentItems.length, 1);
assert.equal(userContentItems[0].text, '第一行\n第二行');
assert.equal(userContentItems[0].images.length, 1);
assert.equal(userContentItems[0].images[0].source, 'attachment');
assert.equal(userContentItems[0].images[0].label, 'shot.png');
assert.equal(userContentItems[0].files[0].label, 'doc.pdf');

const hiddenReasoning = {
  order: ['r3'],
  nodes: new Map([['r3', {
    kind: 'assistant-step',
    visibility: 'hidden',
    data: { blocks: [{ type: 'reasoning', text: '不该出现' }] },
  }]]),
};
assert.equal(test.latestReasoning(hiddenReasoning), '');

// ------------------------------------------------------------- addresses
assert.equal(
  test.fileAddressFor('s1', 'D:\\work\\proj', 'src/a b.txt'),
  'dsh-resource://file/session/s1/src/a%20b.txt',
);
assert.equal(
  test.fileAddressFor('s1', 'D:\\work\\proj', 'D:\\work\\proj\\src\\a.txt'),
  'dsh-resource://file/session/s1/src/a.txt',
);
assert.equal(
  test.fileAddressFor('s1', 'D:\\work\\proj', 'D:\\other\\x.txt'),
  'dsh-resource://file/session/s1/D:/other/x.txt',
);
assert.equal(
  test.resolveWorkspacePath('D:\\work\\proj', 'src\\a.txt'),
  'D:\\work\\proj\\src\\a.txt',
);
assert.equal(test.isImagePath('a/b/c.WEBP'), true);
assert.equal(test.isImagePath('a/b/c.md'), false);


