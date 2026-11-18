/**
 * 大肥鱼 in DSH — third conversation view.
 *
 * This is a single-file client bundle (no build step): the browser module
 * loader materializes the factory, the factory registers one Conversation
 * View definition and one `conversation.view` slot entry, and the view renders
 * the generated counter scene with the character, tabletop status sign,
 * latest reply, and attachments.
 *
 * State truth: the character and sign are driven only by the session's real
 * client state (`useSession`, `useSessionStatus`, and the Chat target snapshot
 * through the standard `useChat` hook). Nothing here invents a status.
 */
window.__ModuleLoader__.load({
  id: 'dsh-dafeiyu-counter',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    let createPortal = null;
    try {
      const ReactDOM = require('react-dom');
      if (ReactDOM && typeof ReactDOM.createPortal === 'function') createPortal = ReactDOM.createPortal;
    } catch {
      createPortal = null;
    }
    const PKG = 'dsh-dafeiyu-counter';
    const NS = 'dafeiyuCounter';
    const TARGET = 'dafeiyu-counter';
    const IMAGE_LIMIT = 4;
    const FILE_LIMIT = 4;

    // ---------------------------------------------------------------- assets
    function assetUrl(path) {
      const reference = 'plugins/' + PKG + '/assets/' + path;
      try {
        return typeof require.asset === 'function' ? require.asset(reference) : reference;
      } catch {
        return reference;
      }
    }
    const CHAR_ASSET_VERSION = '20261319';
    const stateAsset = (name) => assetUrl('char/states_v3/state_' + name + '.webp') + '?v=' + CHAR_ASSET_VERSION;
    const CHAR_STATES = {
      idle: stateAsset('idle'),
      thinking: stateAsset('thinking'),
      tool: stateAsset('tool'),
      approval: stateAsset('approval'),
      error: stateAsset('error'),
    };
    const CHAR_REACTIONS = {
      laugh: stateAsset('laugh'),
      sweat: stateAsset('sweat'),
      sad: stateAsset('sad'),
      surprised: stateAsset('surprised'),
    };
    const CHAR_CLAP_DONE = stateAsset('clap_done');
    /** Horizontal band the character may occupy: idle wandering and drop points. */
    const CHAR_WALK_MIN = 42;
    const CHAR_WALK_MAX = 58;
    const WALL_STYLES = {
      light: assetUrl('wall_light.webp'),
      dark: assetUrl('wall_dark.webp'),
    };
    const SIGN_STYLES = {
      light: assetUrl('sign_light.webp'),
      dark: assetUrl('sign_dark.webp'),
    };
    const TABLE_STYLES = {
      light: assetUrl('table_light.webp'),
      dark: assetUrl('table_dark.webp'),
    };
    const PERSONAL_STYLES = {
      light: [
        { key: 'light_mug', url: assetUrl('props/light_0_mug.webp'), height: 30, angle: 0 },
        { key: 'light_books', url: assetUrl('props/light_1_books.webp'), height: 26, angle: 0 },
        { key: 'light_whale', url: assetUrl('props/light_2_whale.webp'), height: 32, angle: 0 },
        { key: 'light_plant', url: assetUrl('props/light_3_plant.webp'), height: 38, angle: 0 },
        { key: 'light_notebook', url: assetUrl('props/light_4_notebook.webp'), height: 28, angle: -6 },
        { key: 'light_pen', url: assetUrl('props/light_5_pen.webp'), height: 32, angle: 90, seat: 14 },
      ],
      dark: [
        { key: 'dark_mug', url: assetUrl('props/dark_0_mug.webp'), height: 30, angle: 0 },
        { key: 'dark_books', url: assetUrl('props/dark_1_books.webp'), height: 26, angle: 0 },
        { key: 'dark_whale', url: assetUrl('props/dark_2_whale.webp'), height: 34, angle: 0 },
        { key: 'dark_plant', url: assetUrl('props/dark_3_plant.webp'), height: 38, angle: 0 },
        { key: 'dark_tablet', url: assetUrl('props/dark_4_tablet.webp'), height: 30, angle: -4 },
      ],
    };

    function buildPersonalLayout(style) {
      const pool = (PERSONAL_STYLES[style] || PERSONAL_STYLES.light).slice();
      const count = Math.min(pool.length, 2 + Math.floor(Math.random() * 3));
      const items = [];
      for (let index = 0; index < count; index += 1) {
        const pick = Math.floor(Math.random() * pool.length);
        items.push(pool.splice(pick, 1)[0]);
      }
      const slots = [37, 48, 59, 70, 81]
        .sort(() => Math.random() - 0.5)
        .slice(0, count)
        .sort((a, b) => a - b);
      return slots.map((left, index) => ({
        ...items[index],
        left,
        z: 3 + index,
      }));
    }

    // ------------------------------------------------------------- pure utils
    const IS_WINDOWS_ABS = /^[A-Za-z]:[/\\]/;
    const IMAGE_EXT = /\.(?:png|jpe?g|gif|webp|bmp|ico|svg)$/i;
    const LINK_RE = /(!?)\[([^\]]*)\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
    const SCHEME_RE = /^[A-Za-z][A-Za-z0-9+.-]*:/;

    function isAbsolutePath(path) {
      return typeof path === 'string'
        && (path.startsWith('/') || path.startsWith('\\\\') || IS_WINDOWS_ABS.test(path));
    }

    function resolveWorkspacePath(cwd, path) {
      if (typeof path !== 'string' || path === '') return '';
      if (isAbsolutePath(path)) return path;
      if (typeof cwd !== 'string' || cwd === '') return path;
      const windows = IS_WINDOWS_ABS.test(cwd) || cwd.startsWith('\\\\');
      const separator = windows && cwd.includes('\\') ? '\\' : '/';
      const base = cwd.replace(/[/\\]+$/, '');
      const relative = path.replace(/^(?:\.?[/\\])+/, '');
      return base + separator + relative;
    }

    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%3A/gi, ':');
    }
    function encodePath(path) {
      return path.split('/').map(encodeSegment).join('/');
    }
    function sessionFileAddress(sessionId, path) {
      const normalized = path.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
      return 'dsh-resource://file/session/' + encodeSegment(sessionId) + '/' + encodePath(normalized);
    }
    /**
     * Same contract as DSH's browser-safe `fileAddressFor`: a relative path or
     * an absolute path inside the workspace becomes a Session-scoped address;
     * an absolute path outside it keeps its absolute spelling.
     */
    function fileAddressFor(sessionId, cwd, path) {
      const normalized = String(path).replace(/\\/g, '/');
      if (!isAbsolutePath(normalized)) return sessionFileAddress(sessionId, normalized);
      const root = typeof cwd === 'string' && cwd !== ''
        ? cwd.replace(/\\/g, '/').replace(/\/+$/, '')
        : '';
      if (root !== '' && normalized === root) return sessionFileAddress(sessionId, '');
      if (root !== '' && normalized.startsWith(root + '/')) return sessionFileAddress(sessionId, normalized.slice(root.length + 1));
      return sessionFileAddress(sessionId, normalized);
    }

    function basename(path) {
      const trimmed = String(path || '').replace(/[/\\]+$/, '');
      const cut = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
      return cut >= 0 ? trimmed.slice(cut + 1) : trimmed;
    }

    function isImagePath(path) {
      return IMAGE_EXT.test(String(path || '').split('#')[0].split('?')[0]);
    }

    function splitLine(destination) {
      const match = /#L(\d+)(?:-L(\d+))?$/.exec(destination);
      if (match === null) return { path: destination, line: undefined };
      return {
        path: destination.slice(0, match.index),
        line: Number(match[1]),
      };
    }

    function decodeDestination(raw) {
      let value = String(raw || '').trim();
      if (value.startsWith('<') && value.endsWith('>')) value = value.slice(1, -1);
      try {
        value = decodeURIComponent(value);
      } catch {
        // Keep the authored spelling when a percent escape is malformed.
      }
      return value;
    }

    /** Parse Markdown image/file links from assistant text blocks. */
    function parseMarkdownItems(blocks) {
      const images = [];
      const files = [];
      const seen = new Set();
      const push = (item) => {
        const key = 'p:' + item.path;
        if (seen.has(key)) return;
        seen.add(key);
        if (item.kind === 'image') images.push(item);
        else files.push(item);
      };
      for (const block of blocks || []) {
        if (block === null || typeof block !== 'object' || block.kind !== 'text' || typeof block.text !== 'string') continue;
        LINK_RE.lastIndex = 0;
        let match;
        while ((match = LINK_RE.exec(block.text)) !== null) {
          const bang = match[1] === '!';
          const label = match[2] || '';
          const rawDestination = decodeDestination(match[3]);
          const windowsDrive = /^[A-Za-z]:[\\/]/.test(rawDestination);
          if (rawDestination === '' || rawDestination.startsWith('#') || (!windowsDrive && SCHEME_RE.test(rawDestination))) continue;
          const split = splitLine(rawDestination);
          const path = split.path;
          if (path === '') continue;
          const image = bang || isImagePath(path);
          push({
            kind: image ? 'image' : 'file',
            source: 'path',
            path,
            line: split.line,
            label: label || basename(path),
          });
        }
      }
      return { images, files };
    }

    /** One inline markdown image token as a local path item, or null for remote/other destinations. */
    function parseMarkdownImage(url, label) {
      const raw = decodeDestination(url);
      if (raw === '' || raw.startsWith('#')) return null;
      const windowsDrive = /^[A-Za-z]:[\\/]/.test(raw);
      if (!windowsDrive && SCHEME_RE.test(raw)) return null;
      const split = splitLine(raw);
      if (split.path === '') return null;
      return {
        kind: 'image',
        source: 'path',
        path: split.path,
        line: split.line,
        label: label || basename(split.path),
      };
    }

    function textOf(blocks) {
      return (blocks || [])
        .filter(block => block !== null && typeof block === 'object' && block.kind === 'text' && typeof block.text === 'string')
        .map(block => block.text)
        .join('\n')
        .trim();
    }

    const INLINE_MD = /(<https?:\/\/[^>\s]+>|https?:\/\/[^\s<>"'`)\]\u3000-\u303f\uff00-\uffef\u4e00-\u9fff\u3400-\u4dbf]+|!?\[[^\]]*\]\([^)]*\)|\*\*[^*]+?\*\*|__[^_]+?__|`[^`]+?`|~~[^~]+?~~|\*[^*]+?\*|_[^_]+?_)/g;

    function inlineMarkdown(text, keyBase, imageCtx) {
      const nodes = [];
      let last = 0;
      let index = 0;
      let match;
      INLINE_MD.lastIndex = 0;
      while ((match = INLINE_MD.exec(text)) !== null) {
        if (match.index > last) nodes.push(text.slice(last, match.index));
        const token = match[0];
        const key = keyBase + ':i' + index++;
        if (token.startsWith('<') && /^<https?:\/\//.test(token)) {
          const url = token.slice(1, -1);
          nodes.push(h('a', { key, href: url, target: '_blank', rel: 'noreferrer noopener' }, url));
        } else if (/^https?:\/\//.test(token)) {
          const url = token.replace(/[.,;:!?]+$/, '');
          nodes.push(h('a', { key, href: url, target: '_blank', rel: 'noreferrer noopener' }, url));
          if (url.length < token.length) nodes.push(token.slice(url.length));
        } else if (token.startsWith('**') || token.startsWith('__')) nodes.push(h('strong', { key }, token.slice(2, -2)));
        else if (token.startsWith('`')) nodes.push(h('code', { key }, token.slice(1, -1)));
        else if (token.startsWith('~~')) nodes.push(h('del', { key }, token.slice(2, -2)));
        else if (token.startsWith('*') || token.startsWith('_')) nodes.push(h('em', { key }, token.slice(1, -1)));
        else {
          const image = token.startsWith('!');
          const close = token.indexOf('](');
          const label = token.slice(image ? 2 : 1, close);
          const url = token.slice(close + 2, -1);
          if (image) {
            const item = imageCtx === undefined || typeof imageCtx.parse !== 'function' ? null : imageCtx.parse(url, label);
            const resolved = item === null || typeof imageCtx.resolve !== 'function' ? undefined : imageCtx.resolve(item);
            if (item !== null && typeof resolved === 'string' && resolved !== '') {
              nodes.push(h('img', {
                key,
                className: 'dfc-md-image',
                src: resolved,
                alt: label,
                loading: 'lazy',
                onClick: () => imageCtx.open(item),
              }));
            } else {
              nodes.push(h('span', { key, className: 'dfc-md-image dfc-md-image--chip', title: url }, label || '图片'));
            }
          }
          else if (/^(https?:|mailto:)/i.test(url)) nodes.push(h('a', { key, href: url, target: '_blank', rel: 'noreferrer' }, label));
          else nodes.push(label);
        }
        last = match.index + token.length;
      }
      if (last < text.length) nodes.push(text.slice(last));
      return nodes;
    }

    /** Copy plain text through the clipboard API; resolves false when unavailable. */
    function copyPlainText(text) {
      try {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
        if (clipboard !== undefined && clipboard !== null && typeof clipboard.writeText === 'function') {
          return Promise.resolve(clipboard.writeText(text)).then(() => true, () => false);
        }
      } catch (error) { /* treated as unavailable */ }
      return Promise.resolve(false);
    }

    /** A fenced code block with copy and wrap controls. */
    function CodeBlock({ code, lang, t }) {
      const [copied, setCopied] = React.useState(false);
      const [wrap, setWrap] = React.useState(false);
      return h('div', { className: 'dfc-code', 'data-wrap': wrap ? 'true' : 'false' },
        h('div', { className: 'dfc-code__bar' },
          h('span', { className: 'dfc-code__lang' }, lang === '' ? t('code.plain') : lang),
          h('button', {
            type: 'button',
            className: 'dfc-code__btn',
            'aria-pressed': wrap ? 'true' : 'false',
            title: t(wrap ? 'code.unwrap' : 'code.wrap'),
            onClick: () => setWrap(value => !value),
          }, t(wrap ? 'code.unwrap' : 'code.wrap')),
          h('button', {
            type: 'button',
            className: 'dfc-code__btn',
            title: t('code.copy'),
            onClick: () => {
              Promise.resolve(copyPlainText(code)).then((ok) => {
                if (ok !== true) return;
                setCopied(true);
                setTimeout(() => setCopied(false), 1200);
              });
            },
          }, copied ? t('code.copied') : t('code.copy'))),
        h('pre', null, h('code', { className: lang === '' ? undefined : 'language-' + lang }, code)));
    }

    function renderMarkdown(text, keyBase, imageCtx, t) {
      const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
      const blocks = [];
      let index = 0;
      let seq = 0;
      const nextKey = () => keyBase + ':b' + seq++;
      const blank = line => line.trim() === '';
      const splitRow = line => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(cell => cell.trim());
      const tableSep = line => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
      while (index < lines.length) {
        const line = lines[index];
        if (blank(line)) { index += 1; continue; }
        const fence = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
        if (fence !== null) {
          const marker = fence[1];
          const closer = new RegExp('^\\s*' + (marker.charAt(0) === '`' ? '`' : '~') + '{' + marker.length + ',}\\s*$');
          const lang = fence[2].trim().split(/\s+/)[0] || '';
          const code = [];
          index += 1;
          while (index < lines.length && closer.test(lines[index]) === false) code.push(lines[index++]);
          if (index < lines.length) index += 1;
          blocks.push(h(CodeBlock, { key: nextKey(), code: code.join('\n'), lang, t }));
          continue;
        }
        if (line.includes('|') && index + 1 < lines.length && tableSep(lines[index + 1])) {
          const header = splitRow(line);
          index += 2;
          const rows = [];
          while (index < lines.length && lines[index].includes('|') && !blank(lines[index])) rows.push(splitRow(lines[index++]));
          blocks.push(h('table', { key: nextKey() },
            h('thead', {}, h('tr', {}, ...header.map((cell, c) => h('th', { key: 'h' + c }, ...inlineMarkdown(cell, keyBase + ':th' + c, imageCtx))))),
            h('tbody', {}, ...rows.map((row, r) => h('tr', { key: 'r' + r }, ...row.map((cell, c) => h('td', { key: 'c' + c }, ...inlineMarkdown(cell, keyBase + ':td' + r + '-' + c, imageCtx))))))));
          continue;
        }
        const heading = /^(#{1,6})\s+(.*)$/.exec(line);
        if (heading !== null) {
          const level = heading[1].length;
          blocks.push(h('h' + level, { key: nextKey() }, ...inlineMarkdown(heading[2], keyBase + ':h', imageCtx)));
          index += 1;
          continue;
        }
        if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
          blocks.push(h('hr', { key: nextKey() }));
          index += 1;
          continue;
        }
        if (/^\s*[-*+]\s+/.test(line)) {
          const items = [];
          while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*[-*+]\s+/, ''));
          blocks.push(h('ul', { key: nextKey() }, ...items.map((item, i) => h('li', { key: 'li' + i }, ...inlineMarkdown(item, keyBase + ':li', imageCtx)))));
          continue;
        }
        if (/^\s*\d+[.)]\s+/.test(line)) {
          const items = [];
          while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) items.push(lines[index++].replace(/^\s*\d+[.)]\s+/, ''));
          blocks.push(h('ol', { key: nextKey() }, ...items.map((item, i) => h('li', { key: 'li' + i }, ...inlineMarkdown(item, keyBase + ':li', imageCtx)))));
          continue;
        }
        if (/^>\s?/.test(line)) {
          const quote = [];
          while (index < lines.length && /^>\s?/.test(lines[index])) quote.push(lines[index++].replace(/^>\s?/, ''));
          blocks.push(h('blockquote', { key: nextKey() }, ...renderMarkdown(quote.join('\n'), keyBase + ':q', imageCtx, t)));
          continue;
        }
        const paragraph = [];
        while (index < lines.length && !blank(lines[index])
          && !/^\s*(`{3,}|~{3,})/.test(lines[index])
          && !/^(#{1,6})\s+/.test(lines[index])
          && !/^\s*[-*+]\s+/.test(lines[index])
          && !/^\s*\d+[.)]\s+/.test(lines[index])
          && !/^>\s?/.test(lines[index])
          && !(lines[index].includes('|') && index + 1 < lines.length && tableSep(lines[index + 1]))) {
          paragraph.push(lines[index++]);
        }
        blocks.push(h('p', { key: nextKey() }, ...inlineMarkdown(paragraph.join('\n'), keyBase + ':p', imageCtx)));
      }
      return blocks;
    }

    function turnOf(chat) {
      const order = chat?.timeline?.turnOrder;
      if (!Array.isArray(order) || order.length === 0) return undefined;
      return chat.timeline.turns?.get(order[order.length - 1]);
    }

    function turnInfo(chat) {
      const turn = turnOf(chat);
      return {
        turn,
        status: turn?.status,
        endKind: turn?.end?.data?.reason?.kind,
      };
    }

    function runningToolNames(chat) {
      const names = [];
      for (const call of chat?.legacy?.runningCalls || []) {
        if (call?.phase !== 'start' || typeof call.name !== 'string' || call.name === '') continue;
        if (!names.includes(call.name)) names.push(call.name);
      }
      return names;
    }

    function collectPresented(turn, blocks, files, seen) {
      const add = (path, label) => {
        if (typeof path !== 'string' || path === '') return;
        const key = 'p:' + path.replace(/\\/g, '/');
        if (seen.has(key)) return;
        seen.add(key);
        files.push({ kind: 'file', source: 'path', path, label: label || basename(path) });
      };
      let presented;
      try {
        presented = turn?.data?.get?.('deliverables')?.presented;
      } catch {
        presented = undefined;
      }
      for (const item of presented || []) add(item?.path, item?.description);
      for (const block of blocks || []) {
        if (block?.kind !== 'tool-call' || block.name !== 'present' || typeof block.argsRaw !== 'string') continue;
        try {
          const args = JSON.parse(block.argsRaw);
          for (const item of args?.files || []) add(item?.path, item?.description);
        } catch {
          // A malformed present call contributes no paths.
        }
      }
    }

    function fromBlocks(blocks, status, turn) {
      const parsed = parseMarkdownItems(blocks);
      const seen = new Set(parsed.images.filter(item => item.source === 'path').map(item => 'p:' + item.path));
      const files = [];
      const fileSeen = new Set();
      for (const file of parsed.files) {
        const key = 'p:' + file.path;
        if (fileSeen.has(key)) continue;
        fileSeen.add(key);
        files.push(file);
      }
      const images = parsed.images.slice();
      for (const block of blocks || []) {
        if (block?.kind !== 'image' || block.attachment === undefined) continue;
        const key = 'a:' + String(block.attachment.attachmentId);
        if (seen.has(key)) continue;
        seen.add(key);
        images.push({
          kind: 'image',
          source: 'attachment',
          attachment: block.attachment,
          label: block.attachment.name || '图片',
        });
      }
      collectPresented(turn, blocks, files, fileSeen);
      return {
        turn: turn?.turn ?? turn?.end?.data?.turn,
        status,
        text: textOf(blocks),
        images,
        files,
      };
    }

    /** Latest assistant reply only: turn-tail closing, streaming partial, or last assistant node. */
    function latestReply(chat) {
      if (chat === undefined || chat === null) return null;
      const turn = turnOf(chat);
      let closing;
      try {
        closing = turn?.data?.get?.('turn-tail')?.closing;
      } catch {
        closing = undefined;
      }
      if (closing && Array.isArray(closing.blocks)) return fromBlocks(closing.blocks, 'settled', turn);
      const partial = chat.legacy?.partial;
      if (partial && Array.isArray(partial.blocks)) return fromBlocks(partial.blocks, 'streaming', turn);
      const order = chat.order;
      if (Array.isArray(order)) {
        for (let index = order.length - 1; index >= 0; index -= 1) {
          const node = chat.nodes?.get?.(order[index]);
          if (node?.kind !== 'assistant-step' || node.visibility === 'hidden') continue;
          if (Array.isArray(node.data?.blocks)) {
            return fromBlocks(node.data.blocks, node.data.status === 'running' ? 'streaming' : 'settled', turn);
          }
        }
      }
      return null;
    }

    /**
     * Every Chat node, in render order. `nodes` is a store with `values()`;
     * fall back to the ordered key list when a build exposes only `get`.
     */
    function allChatNodes(chat) {
      const nodes = chat?.nodes;
      if (nodes === undefined || nodes === null) return [];
      if (typeof nodes.values === 'function') {
        try {
          return Array.from(nodes.values()).filter(node => node !== null && node !== undefined);
        } catch {
          // Fall through to the ordered key walk.
        }
      }
      const order = chat?.order;
      if (!Array.isArray(order)) return [];
      const list = [];
      for (const key of order) {
        const node = nodes.get?.(key);
        if (node !== null && node !== undefined) list.push(node);
      }
      return list;
    }

    /** Compare two TurnLocations by identity, falling back to their turn numbers. */
    function sameTurn(a, b) {
      if (a === b) return true;
      const left = typeof a === 'number' ? a : a?.turn;
      const right = typeof b === 'number' ? b : b?.turn;
      return left !== undefined && right !== undefined && left === right;
    }

    /** Parsed JSON object arguments of a running or settled Tool root, else null. */
    function toolArgsOf(root) {
      const raw = root?.call?.argsRaw ?? root?.argsRaw;
      if (typeof raw !== 'string' || raw === '') return null;
      try {
        const value = JSON.parse(raw);
        return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
      } catch {
        return null;
      }
    }

    /** Last path segment of a workspace or absolute path. */
    function baseNameOf(value) {
      if (typeof value !== 'string' || value === '') return '';
      return basename(value.replace(/\\/g, '/'));
    }

    /** Host name of an http(s) URL, or the raw text when unparsable. */
    function hostOf(url) {
      if (typeof url !== 'string' || url === '') return '';
      try {
        return new URL(url).hostname;
      } catch {
        return url;
      }
    }

    /**
     * Display projection of one tool call: badge kind, one-line text, and the
     * faithful web-search sources when the result carries the structured meta.
     */
    function summarizeTool(name, args, root) {
      const settled = root !== null && root !== undefined && root.kind === 'tool-result';
      const meta = settled && root.meta !== null && typeof root.meta === 'object' ? root.meta : undefined;
      switch (name) {
        case 'web_search': {
          const queries = Array.isArray(args?.queries)
            ? args.queries.filter(query => typeof query === 'string' && query.trim() !== '')
            : [];
          const sources = Array.isArray(meta?.sources)
            ? meta.sources
              .filter(source => source !== null && typeof source === 'object' && typeof source.url === 'string')
              .map(source => ({
                title: typeof source.title === 'string' && source.title !== '' ? source.title : hostOf(source.url),
                url: source.url,
                host: hostOf(source.url),
              }))
            : [];
          const text = queries.length === 0
            ? ''
            : '“' + queries[0] + '”' + (queries.length > 1 ? ' +' + String(queries.length - 1) : '');
          return { kind: 'search', text, sources };
        }
        case 'fetch':
        case 'web_fetch': {
          const url = typeof args?.url === 'string' ? args.url : '';
          const host = hostOf(url);
          return { kind: 'fetch', text: host, url, sources: [] };
        }
        case 'read':
        case 'read_image': {
          const path = typeof args?.file_path === 'string'
            ? args.file_path
            : typeof args?.path === 'string' ? args.path : '';
          return { kind: 'read', text: baseNameOf(path), path, sources: [] };
        }
        case 'write':
        case 'edit':
        case 'str_replace_editor': {
          const path = typeof args?.file_path === 'string'
            ? args.file_path
            : typeof args?.path === 'string' ? args.path : '';
          return { kind: 'write', text: baseNameOf(path), path, sources: [] };
        }
        case 'bash':
        case 'pwsh':
        case 'terminal': {
          const command = typeof args?.command === 'string' ? args.command.replace(/\s+/g, ' ').trim() : '';
          return { kind: 'command', text: command.length > 48 ? command.slice(0, 47) + '…' : command, sources: [] };
        }
        case 'todo': {
          const todos = Array.isArray(args?.todos) ? args.todos : [];
          return { kind: 'todo', text: todos.length === 0 ? '' : String(todos.length), sources: [] };
        }
        case 'present': {
          const files = Array.isArray(args?.files) ? args.files : [];
          const first = files.length > 0
            && files[0] !== null && typeof files[0] === 'object' && typeof files[0].path === 'string'
            ? files[0].path
            : '';
          return { kind: 'present', text: files.length === 0 ? '' : String(files.length), path: first, sources: [] };
        }
        case 'agent':
        case 'subagent':
        case 'task': {
          const label = typeof args?.description === 'string'
            ? args.description
            : typeof args?.prompt === 'string' ? args.prompt : '';
          return { kind: 'agent', text: label.length > 40 ? label.slice(0, 39) + '…' : label, sources: [] };
        }
        default:
          return { kind: 'tool', text: name, sources: [] };
      }
    }

    /**
     * Tool calls of the latest loaded turn, in Chat order. Unsettled roots are
     * running; settled roots carry the web-search meta that feeds the sources.
     */
    function collectToolActivity(chat) {
      const latest = turnOf(chat);
      const entries = [];
      const seen = new Set();
      for (const node of allChatNodes(chat)) {
        if (node?.kind !== 'tool-call') continue;
        const root = node.data?.root;
        if (root === null || root === undefined) continue;
        if (latest !== undefined && node.location?.turn !== undefined && !sameTurn(node.location.turn, latest)) continue;
        const callId = typeof root.callId === 'string' ? root.callId : '';
        if (callId !== '') {
          if (seen.has(callId)) continue;
          seen.add(callId);
        }
        const settled = root.kind === 'tool-result';
        const name = typeof root.name === 'string' && root.name !== ''
          ? root.name
          : typeof root.call?.name === 'string' ? root.call.name : '';
        const summary = summarizeTool(name, toolArgsOf(root), root);
        entries.push({
          callId: callId !== '' ? callId : name + ':' + String(entries.length),
          name,
          kind: summary.kind,
          text: summary.text,
          path: typeof summary.path === 'string' ? summary.path : '',
          url: typeof summary.url === 'string' ? summary.url : '',
          sources: summary.sources,
          status: settled ? (root.isError === true ? 'error' : 'done') : 'running',
        });
      }
      return entries;
    }

    /** Formatted token count for the turn footer ("812", "12.3k"). */
    function formatTokenCount(count) {
      if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) return '';
      if (count >= 1000000) return (count / 1000000).toFixed(1) + 'M';
      if (count >= 1000) return (count / 1000).toFixed(1) + 'k';
      return String(Math.round(count));
    }

    /** Exact per-turn token total from the turn-tail data reader, when present. */
    function turnTokenCount(turn) {
      try {
        const tail = turn?.data?.get?.('turn-tail');
        const total = tail?.tokenUsage?.totalTokens;
        return typeof total === 'number' ? total : undefined;
      } catch {
        return undefined;
      }
    }

    /** Attachment tab kind and the address it claims. */
    const ATTACHMENT_KIND = 'dafeiyu-attachment';
    const ATTACHMENT_TAB_ID = 'dafeiyu-counter-attachment';

    /** `dsh-resource://dafeiyu-attachment/session/<sid>/<attachmentId>?name=…&bytes=…` */
    function attachmentAddress(sessionId, attachment, name) {
      const id = encodeURIComponent(String(attachment?.attachmentId ?? ''));
      const bytes = typeof attachment?.bytes === 'number' ? String(attachment.bytes) : '0';
      const label = encodeURIComponent(String(name ?? attachment?.name ?? 'file'));
      return 'dsh-resource://' + ATTACHMENT_KIND + '/session/' + encodeURIComponent(sessionId) + '/' + id
        + '?name=' + label + '&bytes=' + bytes;
    }

    /** Parsed attachment address, or undefined when the address is not ours. */
    function parseAttachmentAddress(address) {
      if (typeof address !== 'string' || address === '') return undefined;
      try {
        const url = new URL(address);
        if (url.protocol !== 'dsh-resource:' || url.hostname !== ATTACHMENT_KIND) return undefined;
        const parts = url.pathname.split('/').filter(part => part !== '');
        if (parts.length < 3 || parts[0] !== 'session') return undefined;
        return {
          sessionId: decodeURIComponent(parts[1]),
          attachmentId: decodeURIComponent(parts[2]),
          name: url.searchParams.get('name') || 'file',
          bytes: Number(url.searchParams.get('bytes') || '0'),
        };
      } catch {
        return undefined;
      }
    }

    /** Read one parsed attachment reference through the session binding. */
    function readAttachmentFor(ctx, parsed) {
      let session;
      try {
        session = ctx.sessions?.binding?.(parsed.sessionId)?.session;
      } catch {
        session = undefined;
      }
      if (session === undefined || session === null || typeof session.readAttachment !== 'function') {
        return Promise.reject(new Error('attachment read is unavailable'));
      }
      const ref = {
        attachmentId: parsed.attachmentId,
        name: parsed.name,
        bytes: Number.isFinite(parsed.bytes) ? parsed.bytes : 0,
      };
      return Promise.resolve(session.readAttachment(ref));
    }

    /**
     * User and settled assistant text in render order. Reasoning/tool blocks are
     * omitted; the output page is a readable transcript, not a trajectory.
     */
    function conversationItems(chat) {
      const order = chat?.order;
      if (!Array.isArray(order)) return [];
      const items = [];
      for (const key of order) {
        const node = chat.nodes?.get?.(key);
        if (node === null || node === undefined || node.visibility === 'hidden') continue;
        if (node.kind === 'user' || node.kind === 'steering') {
          const content = Array.isArray(node.data?.content) ? node.data.content : [];
          const texts = [];
          const images = [];
          const files = [];
          for (const part of content) {
            if (part === null || typeof part !== 'object') continue;
            if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
            else if (part.type === 'image' && part.attachment !== undefined) {
              images.push({
                kind: 'image',
                source: 'attachment',
                attachment: part.attachment,
                label: part.attachment.name || '图片',
                key: 'a:' + String(part.attachment.attachmentId),
              });
            } else if (part.type === 'file' && part.attachment !== undefined) {
              files.push({
                kind: 'file',
                attachment: part.attachment,
                label: part.attachment.name || '文件',
              });
            }
          }
          const text = texts.join('').trim();
          if (text !== '' || images.length > 0 || files.length > 0) {
            items.push({
              key, kind: 'user', text, images, files, time: node.data?.time,
            });
          }
          continue;
        }
        if (node.kind !== 'assistant-step') continue;
        const blocks = Array.isArray(node.data?.blocks) ? node.data.blocks : [];
        const text = textOf(blocks);
        if (text === '') continue;
        const images = parseMarkdownItems(blocks).images.slice();
        for (const block of blocks) {
          if (block === null || typeof block !== 'object' || block.kind !== 'image' || block.attachment === undefined) continue;
          const imageKey = 'a:' + String(block.attachment.attachmentId);
          if (images.some(entry => entry.key === imageKey)) continue;
          images.push({
            kind: 'image',
            source: 'attachment',
            attachment: block.attachment,
            label: block.attachment.name || '图片',
            key: imageKey,
          });
        }
        const turn = node.location?.kind === 'turn' || node.location?.kind === 'step'
          ? node.location.turn
          : undefined;
        items.push({
          key,
          kind: 'assistant',
          text,
          images,
          time: node.data?.time,
          messageId: node.data?.finalNode?.messageId,
          turnSeq: turn?.end?.seq,
          turn: turn?.turn,
          step: node.data?.step,
          streaming: node.data?.status === 'running',
        });
      }
      return items;
    }

    /**
     * The current assistant step's reasoning, but only while that step has no
     * visible text yet. Once text starts the thinking phase is over and the
     * bubble/chain disappear.
     */
    function reasoningFromBlocks(blocks) {
      if (!Array.isArray(blocks)) return '';
      return blocks
        .filter(block => block !== null && typeof block === 'object'
          && (block.kind === 'reasoning' || block.type === 'reasoning')
          && typeof block.text === 'string')
        .map(block => block.text.trim())
        .filter(part => part !== '')
        .join('\n\n');
    }

    function latestReasoning(chat) {
      const partial = chat?.legacy?.partial;
      if (partial !== null && partial !== undefined && Array.isArray(partial.blocks)) {
        const partialThought = reasoningFromBlocks(partial.blocks);
        if (partialThought !== '') return partialThought;
      }
      const order = chat?.order;
      if (!Array.isArray(order)) return '';
      for (let index = order.length - 1; index >= 0; index -= 1) {
        const key = order[index];
        const node = chat.nodes?.get?.(key) ?? chat.nodes?.[key];
        if (node === null || node === undefined || node.visibility === 'hidden') continue;
        if (node.kind !== 'assistant-step') continue;
        return reasoningFromBlocks(node.data?.blocks);
      }
      return '';
    }

    function hasAnswerText(chat) {
      const partial = chat?.legacy?.partial;
      if (partial === null || partial === undefined || !Array.isArray(partial.blocks)) return false;
      return partial.blocks.some(block => block !== null && typeof block === 'object'
        && (block.kind === 'text' || block.type === 'text')
        && typeof block.text === 'string' && block.text.trim() !== '');
    }

    function useThinkingClap(active, blocked) {
      const [clapping, setClapping] = React.useState(false);
      const previous = React.useRef(false);
      const blockedRef = React.useRef(blocked);
      blockedRef.current = blocked;
      React.useEffect(() => {
        let timer = 0;
        if (previous.current && !active) {
          if (!blockedRef.current) {
            setClapping(true);
            timer = window.setTimeout(() => setClapping(false), 2000);
          } else {
            setClapping(false);
          }
        } else if (active) {
          setClapping(false);
        }
        previous.current = active;
        return () => {
          if (timer !== 0) window.clearTimeout(timer);
        };
      }, [active]);
      return clapping;
    }

    /**
     * Lightweight reaction classifier over the live reasoning text. It is a
     * keyword heuristic, not a sentiment model: it only decides which short
     * character reaction to play while thinking.
     */
    function classifyThought(text) {
      const value = String(text || '').toLowerCase();
      if (value.trim() === '') return '';
      if (/(合规|底线|安全|政策|敏感|违规|不允许|不适合|拒绝提供|拒绝回答|拒绝输出|无法提供|不能提供|不能回答|抱歉|对不起|不好意思|refus|cannot provide|can't provide|not allowed|policy|compliance|unsafe|harmful|sensitive|blocked|boundary|restricted)/i.test(value)) {
        return 'sweat';
      }
      if (/(糟糕|不好|出错|错误|失败|坏了|天哪|意外|哎呀|oops|whoops|error|failed|bug|surprised|scared|afraid|fear|吃惊|害怕|吓)/i.test(value)) {
        return 'surprised';
      }
      if (/(哈哈|笑死|好笑|有趣|幽默|搞笑|捧腹|大笑|lol|haha|funny|hilarious|amusing)/i.test(value)) {
        return 'laugh';
      }
      if (/(悲伤|遗憾|可惜|惋惜|难过|同情|可怜|痛心|唉|sad|regret|pity|sympathy|sorrow|unfortunately)/i.test(value)) {
        return 'sad';
      }
      return '';
    }

    function useThoughtReaction(thought, active) {
      const [reaction, setReaction] = React.useState('');
      const last = React.useRef('');
      const timer = React.useRef(0);
      React.useEffect(() => {
        if (!active || thought === '') {
          setReaction('');
          last.current = '';
          if (timer.current !== 0) {
            window.clearTimeout(timer.current);
            timer.current = 0;
          }
          return;
        }
        const category = classifyThought(thought);
        if (category === '' || category === last.current) return;
        last.current = category;
        setReaction(category);
        if (timer.current !== 0) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => {
          timer.current = 0;
          setReaction('');
        }, 2500);
      }, [thought, active]);
      React.useEffect(() => () => {
        if (timer.current !== 0) window.clearTimeout(timer.current);
      }, []);
      return reaction;
    }

    /**
     * Pure state mapping. Priority: approval > terminal error > running tool >
     * thinking/settling > fallback agent error > idle.
     */
    function deriveState(input) {
      const pending = input.pending;
      if (pending !== undefined && pending !== null) {
        return { state: 'approval', waitingKind: pending.kind, toolName: pending.toolName };
      }
      if (input.openState === 'error') return { state: 'error', cause: 'stream' };
      if (!input.running && (input.latestEnd === 'error' || input.latestEnd === 'interrupted')) {
        return { state: 'error', cause: input.latestEnd };
      }
      if (input.running) {
        if (input.toolRunning) return { state: 'tool' };
        return { state: 'thinking', streaming: Boolean(input.streaming) };
      }
      if (input.latestStatus === 'open') return { state: 'thinking', settling: true };
      if (input.lastAgentError && (input.latestEnd === undefined || input.latestEnd === null)) {
        return { state: 'error', cause: 'agent' };
      }
      return { state: 'idle' };
    }

    function tr(t, key, values) {
      let text = t(key);
      if (values) {
        for (const [name, value] of Object.entries(values)) {
          text = text.replace(new RegExp('\\{' + name + '\\}', 'g'), String(value));
        }
      }
      return text;
    }

    function stateLabels(state, tools, t) {
      switch (state.state) {
        case 'approval':
          if (state.waitingKind === 'question') {
            return { label: t('state.question'), detail: t('state.question.detail') };
          }
          if (state.waitingKind === 'plan-review') {
            return { label: t('state.planReview'), detail: t('state.planReview.detail') };
          }
          return {
            label: t('state.approval'),
            detail: state.toolName
              ? tr(t, 'state.approval.detail', { name: state.toolName })
              : t('state.approval.generic'),
          };
        case 'tool':
          return {
            label: t('state.tool'),
            detail: tools.length === 1
              ? tr(t, 'state.tool.one', { name: tools[0] })
              : tr(t, 'state.tool.many', { count: tools.length }),
          };
        case 'thinking':
          return {
            label: t('state.thinking'),
            detail: state.settling
              ? t('state.thinking.settling')
              : state.streaming
                ? t('state.thinking.streaming')
                : t('state.thinking.detail'),
          };
        case 'error':
          return {
            label: t('state.error'),
            detail: state.cause === 'interrupted'
              ? t('state.error.interrupted')
              : state.cause === 'stream'
                ? t('state.error.stream')
                : state.cause === 'agent'
                  ? t('state.error.agent')
                  : t('state.error.turn'),
          };
        default:
          return { label: t('state.idle'), detail: t('state.idle.detail') };
      }
    }

    /** Plain-text preview for the desk paper: drop fence lines so markers never show. */
    function plainPreview(text) {
      return String(text || '')
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .filter(line => !/^\s*(`{3,}|~{3,})/.test(line))
        .join('\n')
        .trim();
    }

    function paperPlaceholder(state, tools, t) {
      if (state.state === 'tool') {
        if (tools.length === 1) return tr(t, 'paper.working', { name: tools[0] });
        if (tools.length > 1) return tr(t, 'paper.workingMany', { count: tools.length });
        return t('paper.thinking');
      }
      if (state.state === 'thinking') {
        return state.settling ? t('paper.settling') : t('paper.thinking');
      }
      if (state.state === 'approval') return t('paper.waiting');
      if (state.state === 'error') return t('paper.error');
      return t('paper.empty');
    }

    // --------------------------------------------------------------- locales
    const ZH = {
      'view.label': '大肥鱼 in DSH',
      'state.idle': '待命',
      'state.idle.detail': '等你开口',
      'state.thinking': '思考中',
      'state.thinking.detail': '正在想怎么回答',
      'state.thinking.streaming': '正在写回复…',
      'state.thinking.settling': '收尾中…',
      'state.tool': '干活',
      'state.tool.one': '正在用 {name}',
      'state.tool.many': '正在用 {count} 个工具',
      'state.approval': '等你批准',
      'state.approval.detail': '{name} 需要你点头',
      'state.approval.generic': '需要你点头才能继续',
      'state.question': '等你回答',
      'state.question.detail': '需要你回答一个问题',
      'state.planReview': '等你确认',
      'state.planReview.detail': '需要你确认计划',
      'state.error': '出错',
      'state.error.turn': '上次执行失败',
      'state.error.interrupted': '上次执行中断',
      'state.error.stream': '连接出错，先看看对话',
      'state.error.agent': '上次运行出错',
      'paper.title': '对话记录',
      'paper.empty': '柜台已就位，等你开口。',
      'paper.attachmentsOnly': '已交付 {count} 个附件，见柜台。',
      'paper.hint': '完整排版回「对话」',
      'message.copy': '复制',
      'message.copied': '已复制',
      'message.like': '赞',
      'message.likeActive': '已赞',
      'message.dislike': '踩',
      'message.dislikeActive': '已踩',
      'message.branch': '分支',
      'paper.thinking': '正在想怎么回答…',
      'paper.settling': '收尾中…',
      'paper.waiting': '在等你处理…',
      'paper.working': '正在用 {name} 干活…',
      'paper.workingMany': '正在用 {count} 个工具干活…',
      'paper.error': '上次没完成，先看看对话。',
      'attachments.more': '另有 {count} 个 · 回「对话」查看全部',
      'image.aria': '查看图片 {name}',
      'image.placeholder': '图片',
      'file.aria': '在右侧栏打开 {name}',
      'open.error': '打不开：{message}',
      'open.noSidebar': '右侧栏暂不可用',
      'open.empty': '没有可打开的路径',
      'open.imageMissing': '图片还没有加载出来，稍后再试',
      'sign.footer': '大肥鱼 in DSH',
      'character.hop': '和大肥鱼打个招呼',
      'thought.title': '思考中',
      'motion.on': '动效开',
      'motion.off': '动效关',
      'motion.enable': '开启动效',
      'motion.disable': '关闭动效',
      'lightbox.close': '关闭',
      'theme.dark': '切换深色',
      'theme.light': '切换浅色',
      'compact.more': '更多附件回「对话」看',
      'work.title': '工作台 · 进行中',
      'work.titleOpen': '工作台 · 本回合',
      'work.expand': '点击展开 ▸',
      'work.collapse': '点击收起 ▾',
      'work.compact': '工作台',
      'work.sourceCount': '{count} 条来源',
      'work.badge.search': '检索',
      'work.badge.fetch': '网页',
      'work.badge.read': '读',
      'work.badge.write': '改',
      'work.badge.command': '命令',
      'work.badge.todo': '待办',
      'work.badge.present': '交付',
      'work.badge.agent': '子任务',
      'work.badge.tool': '工具',
      'work.openFile': '在右侧栏打开 {name}',
      'meta.turn': '本回合',
      'meta.tools': '{count} 次工具',
      'meta.sources': '{count} 条来源',
      'meta.tokens': '{value} tokens',
      'file.open': '在右侧栏打开 {name}',
      'attach.title': '{name}',
      'attach.loading': '正在读取附件…',
      'attach.invalid': '附件地址无效，请从消息里重新打开。',
      'attach.failed': '附件读取失败：{message}',
      'attach.download': '下载',
      'attach.binary': '无法预览（{type}），可以下载查看。',
      'attach.truncated': '附件较大，仅显示前 {count} 个字符。',
      'fallback.title': '大肥鱼 in DSH 暂时看不到会话数据',
      'fallback.detail': '点回「对话」继续，或重新打开这个窗口。',
      'code.copy': '复制',
      'code.copied': '已复制',
      'code.wrap': '自动换行',
      'code.unwrap': '取消换行',
      'code.plain': '代码',
    };
    const EN = {
      'view.label': '大肥鱼 in DSH',
      'state.idle': 'Idle',
      'state.idle.detail': 'Waiting for you',
      'state.thinking': 'Thinking',
      'state.thinking.detail': 'Working out the answer',
      'state.thinking.streaming': 'Writing the reply…',
      'state.thinking.settling': 'Wrapping up…',
      'state.tool': 'Running a tool',
      'state.tool.one': 'Using {name}',
      'state.tool.many': 'Using {count} tools',
      'state.approval': 'Waiting for approval',
      'state.approval.detail': '{name} needs your go-ahead',
      'state.approval.generic': 'Needs your go-ahead to continue',
      'state.question': 'Waiting for your answer',
      'state.question.detail': 'A question is waiting for you',
      'state.planReview': 'Waiting for plan review',
      'state.planReview.detail': 'The plan needs your confirmation',
      'state.error': 'Error',
      'state.error.turn': 'The last turn failed',
      'state.error.interrupted': 'The last turn was interrupted',
      'state.error.stream': 'Connection problem; check the chat',
      'state.error.agent': 'The last run reported an error',
      'paper.title': 'Conversation',
      'paper.empty': 'The counter is ready. Say something.',
      'paper.attachmentsOnly': '{count} attachments delivered; see the counter.',
      'paper.hint': 'Full formatting in Chat',
      'message.copy': 'Copy',
      'message.copied': 'Copied',
      'message.like': 'Like',
      'message.likeActive': 'Liked',
      'message.dislike': 'Dislike',
      'message.dislikeActive': 'Disliked',
      'message.branch': 'Branch',
      'paper.thinking': 'Working out the answer…',
      'paper.settling': 'Wrapping up…',
      'paper.waiting': 'Waiting for you…',
      'paper.working': 'Working with {name}…',
      'paper.workingMany': 'Working with {count} tools…',
      'paper.error': 'The last run did not finish; check the chat.',
      'attachments.more': '{count} more · see Chat for all',
      'image.aria': 'View image {name}',
      'image.placeholder': 'Image',
      'file.aria': 'Open {name} in the right sidebar',
      'open.error': 'Could not open: {message}',
      'open.noSidebar': 'The right sidebar is unavailable',
      'open.empty': 'No path to open',
      'open.imageMissing': 'The image is not ready yet; try again.',
      'sign.footer': '大肥鱼 in DSH',
      'character.hop': 'Say hi to 大肥鱼',
      'thought.title': 'Thinking',
      'motion.on': 'Motion on',
      'motion.off': 'Motion off',
      'motion.enable': 'Enable motion',
      'motion.disable': 'Disable motion',
      'lightbox.close': 'Close',
      'theme.dark': 'Switch to dark',
      'theme.light': 'Switch to light',
      'compact.more': 'See Chat for more attachments',
      'work.title': 'Workbench · running',
      'work.titleOpen': 'Workbench · this turn',
      'work.expand': 'Click to expand ▸',
      'work.collapse': 'Click to collapse ▾',
      'work.compact': 'Workbench',
      'work.sourceCount': '{count} sources',
      'work.badge.search': 'Search',
      'work.badge.fetch': 'Page',
      'work.badge.read': 'Read',
      'work.badge.write': 'Edit',
      'work.badge.command': 'Command',
      'work.badge.todo': 'Todo',
      'work.badge.present': 'Present',
      'work.badge.agent': 'Subtask',
      'work.badge.tool': 'Tool',
      'work.openFile': 'Open {name} in the right sidebar',
      'meta.turn': 'This turn',
      'meta.tools': '{count} tools',
      'meta.sources': '{count} sources',
      'meta.tokens': '{value} tokens',
      'file.open': 'Open {name} in the right sidebar',
      'attach.title': '{name}',
      'attach.loading': 'Reading the attachment…',
      'attach.invalid': 'Invalid attachment address; open it from the message again.',
      'attach.failed': 'Could not read the attachment: {message}',
      'attach.download': 'Download',
      'attach.binary': 'No preview for {type}; download to view it.',
      'attach.truncated': 'Large attachment; showing the first {count} characters.',
      'fallback.title': '大肥鱼 in DSH cannot see session data yet',
      'fallback.detail': 'Return to Chat, or reopen this view.',
      'code.copy': 'Copy',
      'code.copied': 'Copied',
      'code.wrap': 'Wrap',
      'code.unwrap': 'No wrap',
      'code.plain': 'Code',
    };

    // -------------------------------------------------------------- selectors
    const selectChat = chat => chat;
    const selectRunning = session => session.running;
    const selectLastAgentError = session => session.lastAgentError;
    const selectOpenState = session => session.openState;

    // ------------------------------------------------------------- components
    const STATES = ['idle', 'thinking', 'tool', 'approval', 'error'];

    function collectPreview(reply) {
      if (reply === null || reply === undefined) {
        return { images: [], files: [], text: '', more: 0 };
      }
      const images = reply.images.slice(0, IMAGE_LIMIT);
      const files = reply.files.slice(0, FILE_LIMIT);
      return {
        images,
        files,
        text: reply.text,
        more: reply.images.length - images.length + (reply.files.length - files.length),
      };
    }

    function resolvePathKey(item) {
      return item.source === 'attachment'
        ? 'a:' + String(item.attachment.attachmentId)
        : 'p:' + String(item.path);
    }

    function useResolvedImages(images, loadImages) {
      const [urls, setUrls] = React.useState({});
      const loadRef = React.useRef(loadImages);
      loadRef.current = loadImages;
      const key = images.map(item => resolvePathKey(item)).join('|');
      React.useEffect(() => {
        let alive = true;
        if (images.length === 0) {
          setUrls({});
          return () => { alive = false; };
        }
        Promise.resolve(loadRef.current(images))
          .then(map => { if (alive) setUrls(map || {}); })
          .catch(() => { if (alive) setUrls({}); });
        return () => { alive = false; };
      }, [key]);
      return urls;
    }

    function useCharacterFrame(state, motionEnabled) {
      const [frame, setFrame] = React.useState(1);
      const first = React.useRef(true);
      React.useEffect(() => {
        if (first.current) {
          first.current = false;
          setFrame(1);
          return undefined;
        }
        if (state === 'error') {
          setFrame(1);
          return undefined;
        }
        if (!motionEnabled || document.hidden) {
          setFrame(1);
          return undefined;
        }
        const sequence = [2, 3, 4, 5, 1];
        let index = 0;
        setFrame(sequence[0]);
        const timer = setInterval(() => {
          index += 1;
          if (index >= sequence.length) {
            clearInterval(timer);
            setFrame(1);
            return;
          }
          setFrame(sequence[index]);
        }, 45);
        return () => clearInterval(timer);
      }, [state, motionEnabled]);
      return frame;
    }

    function useImagePreload() {
      React.useEffect(() => {
        if (typeof Image !== 'function') return undefined;
        const images = [];
        for (const url of [
          ...Object.values(CHAR_STATES),
          ...Object.values(CHAR_REACTIONS),
          CHAR_CLAP_DONE,
        ]) {
          const image = new Image();
          image.src = url;
          images.push(image);
        }
        return () => { images.length = 0; };
      }, []);
    }

    function useLightboxClose(open, close) {
      React.useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => {
          if (event.key === 'Escape') close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, [open, close]);
    }

    const THEME_COOKIE = 'dafeiyu_theme';
    const MOTION_COOKIE = 'dafeiyu_motion';

    /**
     * Preferences live in a cookie because DSH's Web UI changes port across
     * restarts and localStorage is port-scoped; the cookie is host-scoped.
     * localStorage stays as a fallback when cookies are unavailable.
     */
    function readStoredPreference(name) {
      try {
        if (typeof document !== 'undefined' && typeof document.cookie === 'string') {
          const found = document.cookie.split('; ').find(row => row.startsWith(name + '='));
          if (found) return decodeURIComponent(found.slice(name.length + 1));
        }
      } catch {}
      try {
        if (typeof localStorage !== 'undefined') return localStorage.getItem('dafeiyu:' + name) || '';
      } catch {}
      return '';
    }

    function writeStoredPreference(name, value) {
      try {
        if (typeof document !== 'undefined') {
          document.cookie = name + '=' + encodeURIComponent(value)
            + '; path=/; max-age=31536000; SameSite=Lax';
        }
      } catch {}
      try {
        if (typeof localStorage !== 'undefined') localStorage.setItem('dafeiyu:' + name, value);
      } catch {}
    }

    function readThemePreference() {
      return readStoredPreference(THEME_COOKIE) === 'dark' ? 'dark' : 'light';
    }

    function readMotionPreference() {
      const value = readStoredPreference(MOTION_COOKIE);
      return value === 'on' ? true : value === 'off' ? false : null;
    }

    function useReducedMotion() {
      const [reduced, setReduced] = React.useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
      React.useEffect(() => {
        if (typeof matchMedia !== 'function') return undefined;
        const query = matchMedia('(prefers-reduced-motion: reduce)');
        const update = () => setReduced(query.matches);
        update();
        query.addEventListener?.('change', update);
        return () => query.removeEventListener?.('change', update);
      }, []);
      return reduced;
    }

    function useCharacterMotion(state, motionEnabled) {
      const [x, setX] = React.useState(50);
      const [walking, setWalking] = React.useState(false);
      const [facing, setFacing] = React.useState(1);
      const [dragging, setDragging] = React.useState(false);
      const xRef = React.useRef(50);
      const draggingRef = React.useRef(false);
      React.useEffect(() => {
        if (!motionEnabled || state !== 'idle' || draggingRef.current) {
          setWalking(false);
          return undefined;
        }
        let disposed = false;
        let timer = 0;
        const schedule = () => {
          if (disposed) return;
          const target = CHAR_WALK_MIN + Math.random() * (CHAR_WALK_MAX - CHAR_WALK_MIN);
          setFacing(target < xRef.current ? 1 : -1);
          xRef.current = target;
          setX(target);
          setWalking(true);
          timer = window.setTimeout(() => {
            if (disposed) return;
            setWalking(false);
            timer = window.setTimeout(schedule, 2200 + Math.random() * 3800);
          }, 2200 + Math.random() * 1200);
        };
        timer = window.setTimeout(schedule, 1200 + Math.random() * 2000);
        return () => {
          disposed = true;
          window.clearTimeout(timer);
        };
      }, [state, motionEnabled, dragging]);
      const beginDrag = React.useCallback(() => {
        draggingRef.current = true;
        setDragging(true);
        setWalking(false);
      }, []);
      const dragTo = React.useCallback((percent) => {
        const clamped = Math.max(CHAR_WALK_MIN, Math.min(CHAR_WALK_MAX, percent));
        if (clamped !== xRef.current) setFacing(clamped < xRef.current ? 1 : -1);
        xRef.current = clamped;
        setX(clamped);
      }, []);
      const endDrag = React.useCallback(() => {
        draggingRef.current = false;
        setDragging(false);
      }, []);
      return { x, walking, facing, dragging, beginDrag, dragTo, endDrag };
    }

    function ThoughtBubble({ text, t, characterX }) {
      const body = React.useRef(null);
      React.useEffect(() => {
        const element = body.current;
        if (element) element.scrollTop = element.scrollHeight;
      }, [text]);
      const left = 'clamp(18%, calc(' + characterX + '% + 11%), 72%)';
      return h('div', {
        className: 'dfc-thought',
        style: { left },
        'aria-live': 'polite',
        onClick: (event) => event.stopPropagation(),
      },
      h('div', { className: 'dfc-thought-title' }, t('thought.title')),
      h('div', { className: 'dfc-thought-body', ref: body }, text));
    }

    function CharacterRig({ state, motionEnabled, t, x, walking, facing, pose, reaction, completion, fullArt, dragging, onDragStart, onDragMove, onDragEnd }) {
      const [action, setAction] = React.useState('');
      const timer = React.useRef(0);
      const dragTimer = React.useRef(0);
      const drag = React.useRef({ active: false, suppress: false, startX: 0, startY: 0 });
      const clearDragTimer = () => {
        if (dragTimer.current !== 0) {
          window.clearTimeout(dragTimer.current);
          dragTimer.current = 0;
        }
      };
      React.useEffect(() => () => {
        if (timer.current !== 0) window.clearTimeout(timer.current);
        if (dragTimer.current !== 0) window.clearTimeout(dragTimer.current);
      }, []);
      // Safety net: whatever ends the gesture (pointer released outside, window
      // blur, hidden tab, capture loss, or a stuck drag), the lifted drag axis
      // must always spring back to the normal Y.
      React.useEffect(() => {
        if (!dragging) return undefined;
        const stop = () => { if (typeof onDragEnd === 'function') onDragEnd(); };
        const onVisibility = () => { if (document.visibilityState === 'hidden') stop(); };
        const onMove = (event) => { if (event.buttons === 0) stop(); };
        const watchdog = window.setTimeout(stop, 60000);
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
        window.addEventListener('blur', stop);
        window.addEventListener('pointermove', onMove);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          window.clearTimeout(watchdog);
          window.removeEventListener('pointerup', stop);
          window.removeEventListener('pointercancel', stop);
          window.removeEventListener('blur', stop);
          window.removeEventListener('pointermove', onMove);
          document.removeEventListener('visibilitychange', onVisibility);
        };
      }, [dragging, onDragEnd]);
      const hop = () => {
        if (!motionEnabled) return;
        setAction('hop');
        if (timer.current !== 0) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setAction(''), 700);
      };
      const onPointerDown = (event) => {
        if (event.button !== 0 || drag.current.active) return;
        drag.current.active = false;
        drag.current.suppress = false;
        drag.current.startX = event.clientX;
        drag.current.startY = event.clientY;
        try { event.currentTarget.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
        clearDragTimer();
        dragTimer.current = window.setTimeout(() => {
          dragTimer.current = 0;
          drag.current.active = true;
          drag.current.suppress = true;
          if (typeof onDragStart === 'function') onDragStart();
        }, 320);
      };
      const onPointerMove = (event) => {
        if (dragTimer.current !== 0) {
          if (Math.abs(event.clientX - drag.current.startX) > 8
            || Math.abs(event.clientY - drag.current.startY) > 8) clearDragTimer();
          return;
        }
        if (!drag.current.active || !dragging || typeof onDragMove !== 'function') return;
        const scene = typeof event.currentTarget.closest === 'function'
          ? event.currentTarget.closest('.dfc-scene')
          : null;
        if (scene === null) return;
        const rect = scene.getBoundingClientRect();
        if (rect.width <= 0) return;
        onDragMove(((event.clientX - rect.left) / rect.width) * 100);
      };
      const endDrag = (event) => {
        clearDragTimer();
        drag.current.active = false;
        if (typeof onDragEnd === 'function') onDragEnd();
        try { event.currentTarget.releasePointerCapture(event.pointerId); } catch (error) { /* ignore */ }
      };
      const reactionUrl = dragging ? CHAR_REACTIONS.surprised : (fullArt || '');
      const reactionKey = reaction !== '' ? reaction : completion ? 'clap-done' : '';
      return h('div', {
        className: 'dfc-char-rig',
        'data-state': state,
        'data-pose': pose,
        'data-full': fullArt === '' ? undefined : 'true',
        'data-reaction': reactionKey === '' ? undefined : reactionKey,
        'data-walking': walking ? 'true' : undefined,
        'data-dragging': dragging ? 'true' : undefined,
        'data-action': action === '' ? undefined : action,
        'data-motion': motionEnabled ? 'on' : 'off',
        style: { left: x + '%', '--dfc-facing': facing },
        role: 'button',
        tabIndex: 0,
        'aria-label': t('character.hop'),
        onPointerDown,
        onPointerMove,
        onPointerUp: endDrag,
        onPointerCancel: endDrag,
        onLostPointerCapture: endDrag,
        onClick: () => {
          if (drag.current.suppress) {
            drag.current.suppress = false;
            return;
          }
          hop();
        },
        onKeyDown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            hop();
          }
        },
      }, h('div', { className: 'dfc-char-body' },
        h('div', { className: 'dfc-char-step' },
          h('div', { className: 'dfc-char-state' },
            h('div', { className: 'dfc-char-facing' },
              reactionUrl !== '' ? h('img', {
                key: 'state-art',
                className: 'dfc-char-layer dfc-char-reaction-full',
                src: reactionUrl,
                alt: '',
                draggable: 'false',
              }) : null)))));
    }

    function StatusSign({ label, detail, t, style }) {
      const art = style === 'dark' ? SIGN_STYLES.dark : SIGN_STYLES.light;
      return h('div', { className: 'dfc-sign', role: 'status', 'aria-live': 'polite' },
        h('img', { className: 'dfc-sign-art', src: art, alt: '' }),
        h('div', { className: 'dfc-sign-copy' },
          h('div', { className: 'dfc-sign-title' }, label),
          h('div', { className: 'dfc-sign-detail' }, detail),
          h('div', { className: 'dfc-sign-foot' }, t('sign.footer'))));
    }

    function AttachmentButton({ item, url, failed, t, onOpen, onImageError }) {
      if (item.kind === 'image') {
        return h('button', {
          key: resolvePathKey(item),
          type: 'button',
          className: 'dfc-frame',
          title: item.label,
          'aria-label': tr(t, 'image.aria', { name: item.label }),
          onClick: () => onOpen(item, url),
        }, url && !failed
          ? h('img', { src: url, alt: '', loading: 'lazy', onError: onImageError })
          : h('span', { className: 'dfc-frame-empty', 'aria-hidden': true }, t('image.placeholder')));
      }
      return h('button', {
        key: resolvePathKey(item),
        type: 'button',
        className: 'dfc-file',
        title: item.label,
        'aria-label': tr(t, 'file.aria', { name: item.label }),
        onClick: () => onOpen(item),
      }, h('span', { className: 'dfc-file-name' }, item.label));
    }

    function CompactView({ state, labels, reply, paperText, images, files, more, work, t, urls, onOpen, onOpenFile, openError, imageErrors, onImageError }) {
      return h('div', { className: 'dfc-compact' },
        h('div', { className: 'dfc-compact-head' },
          h('img', {
            className: 'dfc-compact-char',
            src: CHAR_STATES.idle,
            alt: '',
          }),
          h('div', { className: 'dfc-compact-state' },
            h('div', { className: 'dfc-compact-label' }, labels.label),
            h('div', { className: 'dfc-compact-detail' }, labels.detail))),
        work !== null && work !== undefined
          ? h('div', { className: 'dfc-compact-work' },
            h('span', { className: 'dfc-compact-work__dot', 'aria-hidden': true }),
            h('b', null, t('work.compact')),
            h('span', { className: 'dfc-compact-work__text', title: work.text }, work.text))
          : null,
        h('div', { className: 'dfc-compact-paper' },
          h('div', { className: 'dfc-compact-title' }, t('paper.title')),
          h('div', { className: 'dfc-compact-body' }, paperText),
          h('div', { className: 'dfc-compact-hint' }, t('paper.hint'))),
        (images.length > 0 || files.length > 0) && h('div', { className: 'dfc-compact-props' },
          ...images.map((item) => AttachmentButton({
            item,
            url: urls[resolvePathKey(item)],
            failed: Boolean(imageErrors[resolvePathKey(item)]),
            t,
            onOpen,
            onImageError: () => onImageError(item),
          })),
          ...files.map((item) => AttachmentButton({ item, url: undefined, t, onOpen: onOpenFile })),
          more > 0 ? h('span', { className: 'dfc-more' }, tr(t, 'attachments.more', { count: more })) : null),
        openError ? h('div', { className: 'dfc-open-error', role: 'alert' }, openError) : null);
    }

    /** Text preview cap for one attachment tab body. */
    const ATTACH_TEXT_LIMIT = 40000;

    /** Normalize an attachment payload to bytes, or null when unusable. */
    function toBytes(value) {
      if (value === undefined || value === null) return null;
      if (value instanceof Uint8Array) return value;
      if (value instanceof ArrayBuffer) return new Uint8Array(value);
      if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
      if (Array.isArray(value)) {
        try {
          return Uint8Array.from(value);
        } catch {
          return null;
        }
      }
      return null;
    }

    /** UTF-8 text of a file payload; null when it looks binary (NUL in the probe). */
    function decodeBytes(bytes) {
      if (bytes === null) return null;
      if (bytes.length === 0) return '';
      const probe = Math.min(bytes.length, 2048);
      for (let index = 0; index < probe; index += 1) {
        if (bytes[index] === 0) return null;
      }
      try {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
      } catch {
        return null;
      }
    }

    /** Object URL for an attachment payload, or '' when unavailable. */
    function bytesObjectUrl(bytes, mediaType) {
      try {
        if (typeof URL.createObjectURL !== 'function') return '';
        return URL.createObjectURL(new Blob([bytes], { type: mediaType || 'application/octet-stream' }));
      } catch {
        return '';
      }
    }

    /** Save one attachment payload through a temporary anchor. */
    function downloadBytes(bytes, name, mediaType) {
      try {
        const url = bytesObjectUrl(bytes, mediaType);
        if (url === '') return;
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name || 'file';
        anchor.rel = 'noreferrer';
        document.documentElement.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => {
          try {
            URL.revokeObjectURL?.(url);
          } catch {
            // Revocation is best effort.
          }
        }, 2000);
      } catch {
        // Download unavailable; the tab keeps its rendered state.
      }
    }

    /** Inline document glyph for a user file chip. */
    function fileGlyph() {
      return h('svg', {
        viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': true, className: 'dfc-user-file__glyph',
      },
      h('path', { d: 'M3.5 1.5 h6 l3 3 v10 h-9 z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }),
      h('path', { d: 'M9.5 1.5 v3 h3', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.2 }));
    }

    /**
     * The attachment tab body: reads the stored bytes and renders a text or
     * image preview, with download for every payload. Host-inherited colors keep
     * it usable in either sidebar theme.
     */
    function AttachmentTab(props) {
      const { useTabInfo, t, readAttachment } = props;
      const info = typeof useTabInfo === 'function' ? useTabInfo() : undefined;
      const address = info?.tab?.contentId ?? info?.tab?.navigation?.address ?? '';
      const parsed = parseAttachmentAddress(address);
      const [state, setState] = React.useState({ phase: 'loading' });
      const [imageUrl, setImageUrl] = React.useState('');
      React.useEffect(() => {
        setState({ phase: 'loading' });
        setImageUrl('');
        if (parsed === undefined || typeof readAttachment !== 'function') {
          setState({ phase: 'error', message: t('attach.invalid') });
          return undefined;
        }
        let alive = true;
        Promise.resolve(readAttachment(parsed)).then((result) => {
          if (!alive) return;
          if (result === undefined || result === null || result.ok !== true) {
            const message = result?.error?.message || result?.error?.code || 'unknown';
            setState({ phase: 'error', message: tr(t, 'attach.failed', { message: String(message) }) });
            return;
          }
          const bytes = toBytes(result.value?.data);
          if (bytes === null) {
            setState({ phase: 'error', message: t('attach.invalid') });
            return;
          }
          const mediaType = typeof result.value?.attachment?.mediaType === 'string'
            ? result.value.attachment.mediaType
            : '';
          if (mediaType.startsWith('image/')) {
            setState({ phase: 'image', name: parsed.name, mediaType, bytes });
            return;
          }
          const text = decodeBytes(bytes);
          setState(text === null
            ? { phase: 'binary', name: parsed.name, mediaType, bytes }
            : { phase: 'text', name: parsed.name, mediaType, bytes, text });
        }).catch((error) => {
          if (alive) setState({ phase: 'error', message: tr(t, 'attach.failed', { message: String(error?.message || error) }) });
        });
        return () => {
          alive = false;
        };
      }, [address]);
      React.useEffect(() => {
        if (state.phase !== 'image' || state.bytes === null) return undefined;
        const url = bytesObjectUrl(state.bytes, state.mediaType);
        setImageUrl(url);
        return () => {
          if (url !== '') {
            try {
              URL.revokeObjectURL?.(url);
            } catch {
              // Revocation is best effort.
            }
          }
        };
      }, [state]);
      if (state.phase === 'loading') {
        return h('div', { className: 'dfc-att dfc-att--status' }, t('attach.loading'));
      }
      if (state.phase === 'error') {
        return h('div', { className: 'dfc-att dfc-att--status dfc-att--error', role: 'alert' }, state.message);
      }
      const head = h('div', { className: 'dfc-att__head' },
        h('span', { className: 'dfc-att__name', title: state.name }, state.name),
        h('button', {
          type: 'button',
          className: 'dfc-att__action',
          onClick: () => downloadBytes(state.bytes, state.name, state.mediaType),
        }, t('attach.download')));
      if (state.phase === 'image') {
        return h('div', { className: 'dfc-att' },
          head,
          imageUrl === '' ? null : h('img', { className: 'dfc-att__image', src: imageUrl, alt: state.name }));
      }
      if (state.phase === 'text') {
        const truncated = state.text.length > ATTACH_TEXT_LIMIT;
        return h('div', { className: 'dfc-att' },
          head,
          h('pre', { className: 'dfc-att__text' }, truncated ? state.text.slice(0, ATTACH_TEXT_LIMIT) : state.text),
          truncated ? h('div', { className: 'dfc-att__note' }, tr(t, 'attach.truncated', { count: String(ATTACH_TEXT_LIMIT) })) : null);
      }
      return h('div', { className: 'dfc-att' },
        head,
        h('div', { className: 'dfc-att__note' }, tr(t, 'attach.binary', { type: state.mediaType || state.name })));
    }

    /**
     * The work pill: a long status button above the status sign that plays the
     * latest turn's tool activity one line at a time, and expands in place to the
     * same width for the full list. Left placement keeps the thought bubble free.
     */
    function WorkPill({ entries, open, t, onToggle, onOpenPath }) {
      const ordered = Array.isArray(entries) ? entries.slice().reverse() : [];
      const pillRef = React.useRef(null);
      const [panelMax, setPanelMax] = React.useState(0);
      React.useEffect(() => {
        if (!open) {
          setPanelMax(0);
          return undefined;
        }
        const measure = () => {
          const pill = pillRef.current;
          if (pill === null || pill === undefined) return;
          const panel = typeof pill.querySelector === 'function' ? pill.querySelector('.dfc-workpill__panel') : null;
          const scene = typeof pill.closest === 'function' ? pill.closest('.dfc-scene') : null;
          if (panel === null || scene === null) return;
          const sceneRect = scene.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          const available = Math.floor(sceneRect.bottom - panelRect.top - 18);
          if (available > 0) setPanelMax(Math.max(90, available));
        };
        measure();
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('resize', measure);
          return () => window.removeEventListener('resize', measure);
        }
        return undefined;
      }, [open, ordered.length]);
      if (ordered.length === 0) return null;
      const current = ordered[0];
      const running = ordered.some(entry => entry.status === 'running');
      const search = ordered.find(entry => entry.sources.length > 0);
      return h('div', {
        className: 'dfc-workpill',
        'data-open': open ? 'true' : undefined,
        ref: pillRef,
      },
      h('button', {
        type: 'button',
        className: 'dfc-workpill__button',
        'aria-expanded': open,
        title: t(open ? 'work.collapse' : 'work.expand'),
        onClick: onToggle,
      },
      h('span', { className: 'dfc-workpill__dot' + (running ? ' is-running' : '') }),
      h('span', { className: 'dfc-workpill__badge' }, t('work.badge.' + current.kind)),
      h('span', { key: current.callId, className: 'dfc-workpill__text' },
        current.text !== '' ? current.text : t('work.badge.' + current.kind))),
      open ? h('div', {
        className: 'dfc-workpill__panel',
        style: panelMax > 0 ? { maxHeight: String(panelMax) + 'px' } : undefined,
      },
      ...ordered.slice(0, 8).map(entry => h('div', {
        key: entry.callId, className: 'dfc-workpill__row', 'data-status': entry.status,
      },
      h('span', { className: 'dfc-workpill__row-badge' }, t('work.badge.' + entry.kind)),
      entry.url !== ''
        ? h('a', {
          className: 'dfc-workpill__row-link',
          href: entry.url,
          target: '_blank',
          rel: 'noreferrer noopener',
          title: entry.url,
          onClick: event => event.stopPropagation(),
        }, entry.url)
        : entry.path !== ''
          ? h('button', {
            type: 'button',
            className: 'dfc-workpill__row-link',
            title: tr(t, 'work.openFile', { name: entry.text }),
            onClick: (event) => {
              event.stopPropagation();
              if (typeof onOpenPath === 'function') onOpenPath(entry.path);
            },
          }, entry.text !== '' ? entry.text : t('work.badge.' + entry.kind))
          : h('span', { className: 'dfc-workpill__row-text' }, entry.text !== '' ? entry.text : t('work.badge.' + entry.kind)),
      entry.sources.length > 0
        ? h('span', { className: 'dfc-workpill__row-count' }, tr(t, 'work.sourceCount', { count: entry.sources.length }))
        : null)),
      search !== undefined ? h('div', { className: 'dfc-workpill__sources' },
        ...search.sources.slice(0, 3).map(source => h('a', {
          key: source.url,
          className: 'dfc-workpill__source',
          href: source.url,
          target: '_blank',
          rel: 'noreferrer noopener',
        },
        h('b', null, source.title),
        h('i', null, source.host)))) : null) : null);
    }

    function useFixedViewport(ref) {
      const useLayoutEffect = React.useLayoutEffect || React.useEffect;
      useLayoutEffect(() => {
        const node = ref.current;
        if (!node || typeof document === 'undefined') return undefined;
        let container = node.parentElement;
        let scrollable = false;
        while (container && container !== document.body) {
          const overflowY = getComputedStyle(container).overflowY;
          if ((overflowY === 'auto' || overflowY === 'scroll') && container.clientHeight > 0) {
            scrollable = true;
            break;
          }
          container = container.parentElement;
        }
        if (!container || container === document.body) {
          container = node.parentElement;
          scrollable = false;
        }
        if (!container) return undefined;
        let frame = 0;
        const timers = [];
        const observedInputs = new Set();
        let inputObserver = null;
        const apply = () => {
          frame = 0;
          try {
            // Reset scroll before measuring, so a composer pushed below the fold is still found.
            if (container.scrollTop !== 0) container.scrollTop = 0;
            if (typeof window.scrollTo === 'function' && window.scrollY > 0) window.scrollTo(0, 0);
            const rect = node.getBoundingClientRect();
            const inputs = Array.from(document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]'));
            const inputRects = inputs
              .map(input => input.getBoundingClientRect())
              .filter(inputRect => inputRect.width > 0 && inputRect.height > 0 && inputRect.top > rect.top + 1 && inputRect.top < window.innerHeight);
            const composerTop = inputRects.length
              ? Math.max(...inputRects.map(inputRect => inputRect.top))
              : window.innerHeight - 140;
            const available = Math.max(240, Math.min(
              composerTop - rect.top - 14,
              window.innerHeight - rect.top - 14,
            ));
            const base = scrollable ? container.clientHeight : available;
            const height = Math.max(240, Math.min(base, available));
            node.style.height = height + 'px';
            node.style.maxHeight = height + 'px';
            node.style.minHeight = '0px';
            if (container.scrollTop !== 0) container.scrollTop = 0;
            if (typeof window.scrollTo === 'function' && window.scrollY > 0) window.scrollTo(0, 0);
            // A late-arriving composer can move after the first measurement; keep
            // observing it once it exists.
            if (typeof ResizeObserver === 'function') {
              for (const input of inputs) {
                if (observedInputs.has(input)) continue;
                observedInputs.add(input);
                if (inputObserver === null) inputObserver = new ResizeObserver(schedule);
                inputObserver.observe(input);
              }
            }
          } catch { /* ignore layout measurement errors */ }
        };
        const schedule = () => {
          if (frame === 0) frame = requestAnimationFrame(apply);
        };
        apply();
        schedule();
        // The host can finish laying out the composer after the first paint.
        timers.push(setTimeout(schedule, 120), setTimeout(schedule, 500), setTimeout(schedule, 1200));
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
        if (observer) observer.observe(container);
        const nodeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
        if (nodeObserver) nodeObserver.observe(node);
        const visualViewport = window.visualViewport;
        window.addEventListener('resize', schedule);
        window.addEventListener('pageshow', schedule);
        window.addEventListener('focus', schedule);
        document.addEventListener('visibilitychange', schedule);
        if (visualViewport) visualViewport.addEventListener('resize', schedule);
        return () => {
          if (observer) observer.disconnect();
          if (nodeObserver) nodeObserver.disconnect();
          if (inputObserver) inputObserver.disconnect();
          for (const timer of timers) clearTimeout(timer);
          window.removeEventListener('resize', schedule);
          window.removeEventListener('pageshow', schedule);
          window.removeEventListener('focus', schedule);
          document.removeEventListener('visibilitychange', schedule);
          if (visualViewport) visualViewport.removeEventListener('resize', schedule);
          if (frame !== 0) cancelAnimationFrame(frame);
        };
      }, [ref]);
    }

    function CounterViewInner(props) {
      const {
        t, sessionId, useSession, useSessionStatus, useChat, openPath, openAttachment, loadImages, forkAt, rateMessage, openView,
      } = props;
      const chat = useChat(selectChat);
      const running = useSession(selectRunning);
      const lastAgentError = useSession(selectLastAgentError);
      const openState = useSession(selectOpenState);
      const pending = useSessionStatus(React.useCallback(
        map => (map === undefined ? undefined : map.get(sessionId)?.pendingInteraction),
        [sessionId],
      ));
      const reply = latestReply(chat);
      const messages = conversationItems(chat);
      const turn = turnInfo(chat);
      const tools = runningToolNames(chat);
      const preview = collectPreview(reply);
      const activity = collectToolActivity(chat);
      const totalSources = activity.reduce((count, entry) => count + entry.sources.length, 0);
      const tokenCount = formatTokenCount(turnTokenCount(turn.turn));
      const [workOpen, setWorkOpen] = React.useState(false);
      const workSearch = activity.slice().reverse().find(entry => entry.sources.length > 0);
      const workEntry = workSearch !== undefined ? workSearch : activity[activity.length - 1];
      const workSummary = workEntry === undefined
        ? null
        : {
          text: workEntry.sources.length > 0
            ? workEntry.text + ' · ' + tr(t, 'work.sourceCount', { count: workEntry.sources.length })
            : workEntry.text,
        };
      const metaParts = [];
      if (activity.length > 0) metaParts.push(tr(t, 'meta.tools', { count: String(activity.length) }));
      if (totalSources > 0) metaParts.push(tr(t, 'meta.sources', { count: String(totalSources) }));
      if (tokenCount !== '') metaParts.push(tr(t, 'meta.tokens', { value: tokenCount }));
      const userImages = messages
        .filter(item => item.kind === 'user')
        .flatMap(item => item.images || []);
      const transcriptImages = messages
        .filter(item => item.kind === 'assistant')
        .flatMap(item => item.images || []);
      const allImages = [];
      const seenImageKeys = new Set();
      for (const item of preview.images.concat(userImages, transcriptImages)) {
        const key = resolvePathKey(item);
        if (seenImageKeys.has(key)) continue;
        seenImageKeys.add(key);
        allImages.push(item);
      }
      const urls = useResolvedImages(allImages, loadImages);
      const openImagePreview = (item, url) => {
        if (typeof url === 'string' && url !== '') {
          setLightbox({ url, label: item.label });
          return;
        }
        setOpenError(tr(t, 'open.error', { message: t('open.imageMissing') }));
      };
      const mdImageCtx = {
        parse: (url, label) => parseMarkdownImage(url, label),
        resolve: item => urls[resolvePathKey(item)],
        open: item => openImagePreview(item, urls[resolvePathKey(item)]),
      };
      const state = deriveState({
        running,
        pending,
        toolRunning: tools.length > 0,
        latestEnd: turn.endKind,
        latestStatus: turn.status,
        lastAgentError,
        openState,
        streaming: Boolean(chat?.legacy?.partial),
      });
      const labels = stateLabels(state, tools, t);
      const reducedMotion = useReducedMotion();
      const [motionOverride, setMotionOverride] = React.useState(readMotionPreference);
      const motionEnabled = motionOverride === null ? !reducedMotion : motionOverride;
      const character = useCharacterMotion(state.state, motionEnabled);
      const answerStarted = hasAnswerText(chat);
      const thinkingActive = state.state === 'thinking' && !answerStarted;
      const thought = thinkingActive ? latestReasoning(chat) : '';
      const reaction = useThoughtReaction(thought, thinkingActive);
      const visualReaction = state.state === 'tool' || state.state === 'approval' || state.state === 'error'
        ? '' : reaction;
      const clapping = useThinkingClap(
        thinkingActive,
        state.state === 'tool' || state.state === 'approval' || state.state === 'error',
      );
      const pose = state.state === 'tool' ? 'tablet'
        : clapping ? 'clap'
          : thinkingActive ? 'thinking'
            : 'idle';
      const faceState = state.state === 'tool' ? 'tool'
        : state.state === 'approval' ? 'approval'
          : state.state === 'error' ? 'error'
            : clapping ? 'approval'
              : thinkingActive ? 'thinking'
                : 'idle';
      const fullArt = visualReaction !== ''
        ? (CHAR_REACTIONS[visualReaction] || '')
        : clapping ? CHAR_CLAP_DONE
          : (CHAR_STATES[faceState] || '');
      const viewRef = React.useRef(null);
      const [style, setStyle] = React.useState(readThemePreference);
      const [personalLayout, setPersonalLayout] = React.useState(() => buildPersonalLayout(readThemePreference()));
      const [copiedKey, setCopiedKey] = React.useState('');
      const [feedback, setFeedback] = React.useState({});
      const sheetRef = React.useRef(null);
      const [sceneEpoch, setSceneEpoch] = React.useState(0);
      const [lightbox, setLightbox] = React.useState(null);
      const [openError, setOpenError] = React.useState('');
      const [imageErrors, setImageErrors] = React.useState({});
      const lightboxCloseRef = React.useRef(null);
      const lastFocusRef = React.useRef(null);
      useImagePreload();
      useFixedViewport(viewRef);
      useLightboxClose(lightbox !== null, () => setLightbox(null));

      React.useEffect(() => {
        const node = viewRef.current;
        if (!node) return undefined;
        const isVisible = () => {
          if (typeof document === 'undefined' || document.visibilityState === 'hidden') return false;
          const rect = node.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          let current = node;
          while (current && current !== document.documentElement) {
            const computed = getComputedStyle(current);
            if (computed.display === 'none' || computed.visibility === 'hidden') return false;
            current = current.parentElement;
          }
          return true;
        };
        let wasVisible = isVisible();
        const check = () => {
          const nowVisible = isVisible();
          if (nowVisible && !wasVisible) setSceneEpoch(value => value + 1);
          wasVisible = nowVisible;
        };
        const scheduleCheck = () => {
          setTimeout(check, 60);
          setTimeout(check, 240);
        };
        document.addEventListener('pointerdown', scheduleCheck, true);
        document.addEventListener('click', scheduleCheck, true);
        document.addEventListener('keydown', scheduleCheck, true);
        const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(check) : null;
        if (observer) observer.observe(node);
        return () => {
          document.removeEventListener('pointerdown', scheduleCheck, true);
          document.removeEventListener('click', scheduleCheck, true);
          document.removeEventListener('keydown', scheduleCheck, true);
          if (observer) observer.disconnect();
        };
      }, []);

      React.useEffect(() => {
        const bump = () => setSceneEpoch(value => value + 1);
        const onVisibility = () => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') bump();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pageshow', bump);
        window.addEventListener('focus', bump);
        return () => {
          document.removeEventListener('visibilitychange', onVisibility);
          window.removeEventListener('pageshow', bump);
          window.removeEventListener('focus', bump);
        };
      }, []);

      React.useEffect(() => {
        const node = viewRef.current;
        if (!node || typeof IntersectionObserver !== 'function') return undefined;
        let visible = false;
        const observer = new IntersectionObserver((entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting && !visible) {
              visible = true;
              setPersonalLayout(buildPersonalLayout(style));
              setSceneEpoch(value => value + 1);
            } else if (!entry.isIntersecting) {
              visible = false;
            }
          }
        }, { threshold: 0.1 });
        observer.observe(node);
        return () => observer.disconnect();
      }, [style]);

      React.useEffect(() => {
        if (lightbox === null) return undefined;
        lastFocusRef.current = typeof document !== 'undefined' ? document.activeElement : null;
        const timer = setTimeout(() => { lightboxCloseRef.current?.focus?.(); }, 0);
        return () => {
          clearTimeout(timer);
          lastFocusRef.current?.focus?.();
        };
      }, [lightbox]);

      const markImageError = (item) => {
        setImageErrors(previous => ({ ...previous, [resolvePathKey(item)]: true }));
      };

      const openItem = (item, url) => {
        setOpenError('');
        if (item.source === 'attachment') {
          const key = resolvePathKey(item);
          if (!url || imageErrors[key]) {
            Promise.resolve(loadImages([item]))
              .then(map => {
                const fresh = map ? map[key] : undefined;
                if (fresh) setLightbox({ url: fresh, label: item.label });
                else setOpenError(tr(t, 'open.error', { message: t('open.imageMissing') }));
              })
              .catch(() => setOpenError(tr(t, 'open.error', { message: t('open.imageMissing') })));
            return;
          }
          setLightbox({ url, label: item.label });
          return;
        }
        const result = openPath(item.path, item.line);
        if (result && result.ok === false) {
          const message = result.message === 'no-sidebar'
            ? t('open.noSidebar')
            : result.message === 'empty-path'
              ? t('open.empty')
              : result.message;
          setOpenError(tr(t, 'open.error', { message }));
        }
      };

      const attachmentCount = reply?.files.length || 0;
      const emptyText = attachmentCount > 0
        ? tr(t, 'paper.attachmentsOnly', { count: attachmentCount })
        : paperPlaceholder(state, tools, t);
      const paperText = plainPreview(reply?.text) || emptyText;
      const partial = chat?.legacy?.partial;
      if (partial !== null && partial !== undefined && Array.isArray(partial.blocks)) {
        const partialText = textOf(partial.blocks);
        const partialTurn = typeof partial.turn === 'number' ? partial.turn : undefined;
        const partialStep = typeof partial.step === 'number' ? partial.step : undefined;
        // A settled step already owns its text: never replay it from a stale
        // partial. Prefer the step identity; fall back to text only when the
        // host supplied no coordinates.
        const duplicate = partialTurn !== undefined && partialStep !== undefined
          ? messages.some(item => item.kind === 'assistant' && item.turn === partialTurn && item.step === partialStep)
          : messages.some(item => item.kind === 'assistant' && item.text === partialText);
        if (partialText !== '' && !duplicate) {
          messages.push({
            // Per-turn identity: a constant 'partial' key makes React reuse the
            // previous turn's message element (and its image nodes).
            key: `partial:${partialTurn ?? 'x'}:${partialStep ?? 'x'}`,
            kind: 'assistant',
            text: partialText,
            images: parseMarkdownItems(partial.blocks).images,
            turn: partialTurn,
            step: partialStep,
            streaming: true,
          });
        }
      }
      if (messages.length === 0 && reply !== null && reply.text !== '') {
        messages.push({
          key: `latest:${reply.turn ?? 'x'}`,
          kind: 'assistant',
          text: reply.text,
          images: reply.images || [],
          streaming: false,
        });
      }
      const threadSignature = messages.map(item => item.key + ':' + item.text.length).join('|');
      const lastAssistantIndex = messages.reduce((last, item, index) => (item.kind === 'assistant' ? index : last), -1);
      React.useEffect(() => {
        const sheet = sheetRef.current;
        if (sheet !== null) sheet.scrollTop = sheet.scrollHeight;
      }, [threadSignature]);
      const copyMessage = (item) => {
        try {
          if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            navigator.clipboard.writeText(item.text)
              .then(() => setCopiedKey(item.key))
              .catch(() => { /* clipboard denied */ });
          }
        } catch { /* clipboard unavailable */ }
      };
      const chooseRating = (item, rating) => {
        if (item.messageId === undefined || typeof rateMessage !== 'function') return;
        Promise.resolve(rateMessage(item.messageId, rating)).then((ok) => {
          if (ok) setFeedback(previous => ({ ...previous, [item.messageId]: rating }));
        }).catch(() => { /* feedback failure stays silent */ });
      };
      const branchMessage = (item) => {
        if (item.turnSeq === undefined || typeof forkAt !== 'function') return;
        forkAt(item.turnSeq);
      };
      const wallUrl = WALL_STYLES[style] || WALL_STYLES.light;
      const tableUrl = TABLE_STYLES[style] || TABLE_STYLES.light;
      const hasAttachments = preview.files.length > 0;
      const lightboxElement = lightbox === null ? null : h('div', {
        className: 'dfc-lightbox',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': lightbox.label,
        onClick: () => setLightbox(null),
      },
        h('img', {
          className: 'dfc-lightbox-img',
          src: lightbox.url,
          alt: lightbox.label,
          onClick: event => event.stopPropagation(),
        }),
        h('button', {
          ref: lightboxCloseRef,
          type: 'button',
          className: 'dfc-lightbox-close',
          onClick: () => setLightbox(null),
        }, t('lightbox.close')));
      const lightboxNode = lightboxElement !== null && createPortal !== null
        ? createPortal(lightboxElement, document.body)
        : lightboxElement;

      return h('div', { ref: viewRef, className: 'dfc-view', 'data-state': state.state, 'data-style': style },
        h('div', { className: 'dfc-scene', key: sceneEpoch, 'data-dragging': character.dragging ? 'true' : undefined },
          h('img', { className: 'dfc-wall', src: wallUrl, alt: '' }),
          h(CharacterRig, {
            state: faceState, motionEnabled, t, pose, reaction: visualReaction, completion: clapping,
            fullArt,
            x: character.x, walking: character.walking, facing: character.facing,
            dragging: character.dragging,
            onDragStart: character.beginDrag,
            onDragMove: character.dragTo,
            onDragEnd: character.endDrag,
          }),
          thought === '' ? null : h(ThoughtBubble, { text: thought, t, characterX: character.x }),
          h('div', { className: 'dfc-tabletop', 'aria-hidden': true, style: { backgroundImage: 'url("' + tableUrl + '")' } }),
          h(StatusSign, { label: labels.label, detail: labels.detail, t, style }),
          hasAttachments
            ? h('div', { className: 'dfc-props' },
              ...preview.files.map((item) => AttachmentButton({ item, url: undefined, t, onOpen: openItem })),
              preview.more > 0 ? h('span', { className: 'dfc-more' }, tr(t, 'attachments.more', { count: preview.more })) : null)
            : h('div', { className: 'dfc-personal-scatter' },
              ...personalLayout.map((item) => h('img', {
                key: item.key,
                className: 'dfc-personal-item',
                src: item.url,
                alt: '',
                style: {
                  left: item.left + '%',
                  height: item.height + 'px',
                  bottom: 'calc(var(--dfc-table-h) - ' + (item.seat ?? 5) + 'px)',
                  zIndex: item.z,
                  transform: 'translateX(-50%) rotate(' + item.angle + 'deg)',
                },
              }))),
          h('div', { className: 'dfc-scene-controls' },
            h('button', {
              type: 'button',
              className: 'dfc-theme-toggle',
              title: style === 'light' ? t('theme.dark') : t('theme.light'),
              'aria-label': style === 'light' ? t('theme.dark') : t('theme.light'),
              onClick: () => {
                const nextStyle = style === 'light' ? 'dark' : 'light';
                writeStoredPreference(THEME_COOKIE, nextStyle);
                setStyle(nextStyle);
                setPersonalLayout(buildPersonalLayout(nextStyle));
              },
            }, style === 'light' ? t('theme.dark') : t('theme.light')),
            h('button', {
              type: 'button',
              className: 'dfc-motion-toggle',
              title: motionEnabled ? t('motion.disable') : t('motion.enable'),
              'aria-label': motionEnabled ? t('motion.disable') : t('motion.enable'),
              'aria-pressed': motionEnabled,
              onClick: () => {
                const nextMotion = !motionEnabled;
                writeStoredPreference(MOTION_COOKIE, nextMotion ? 'on' : 'off');
                setMotionOverride(nextMotion);
              },
            }, motionEnabled ? t('motion.on') : t('motion.off'))),
          h(WorkPill, {
            entries: activity,
            open: workOpen,
            t,
            onToggle: () => setWorkOpen(value => !value),
            onOpenPath: (path) => {
              const result = openPath(path);
              if (result !== undefined && result.ok === false) {
                const message = result.message === 'no-sidebar'
                  ? t('open.noSidebar')
                  : result.message === 'empty-path'
                    ? t('open.empty')
                    : result.message;
                setOpenError(tr(t, 'open.error', { message }));
              }
            },
          }),
          openError ? h('div', { className: 'dfc-open-error', role: 'alert' }, openError) : null),
        h('div', { className: 'dfc-desk' },
          h('div', { className: 'dfc-sheet', ref: sheetRef },
            h('div', { className: 'dfc-output' },
              h('div', { className: 'dfc-output-title' }, t('paper.title')),
              messages.length === 0
                ? h('div', { className: 'dfc-output-body' }, paperText)
                : h('div', { className: 'dfc-thread' },
                  ...messages.map((item, index) => item.kind === 'user'
                    ? h('div', { key: item.key, className: 'dfc-user-tag' },
                      item.text !== ''
                        ? h('div', { className: 'dfc-user-tag-text dfc-md' }, ...renderMarkdown(item.text, item.key, undefined, t))
                        : null,
                      item.images.length > 0
                        ? h('div', { className: 'dfc-user-attachments' },
                          ...item.images.map((image) => {
                            const imageKey = resolvePathKey(image);
                            const url = urls[imageKey];
                            return h('button', {
                              key: image.key || imageKey,
                              type: 'button',
                              className: 'dfc-user-image',
                              title: image.label,
                              'aria-label': image.label,
                              onClick: () => openItem(image, url),
                            }, url && !imageErrors[imageKey]
                              ? h('img', {
                                src: url,
                                alt: '',
                                loading: 'lazy',
                                onError: () => markImageError(image),
                              })
                              : h('span', { className: 'dfc-user-image-fallback' }, image.label));
                          }))
                        : null,
                      item.files.length > 0
                        ? h('div', { className: 'dfc-user-files' },
                          ...item.files.map((file, index) => h('button', {
                            key: file.attachment.attachmentId || 'file-' + index,
                            type: 'button',
                            className: 'dfc-user-file',
                            title: tr(t, 'file.open', { name: file.label }),
                            'aria-label': tr(t, 'file.open', { name: file.label }),
                            onClick: () => {
                              const result = typeof openAttachment === 'function' ? openAttachment(file) : undefined;
                              if (result !== undefined && result.ok === false) {
                                const message = result.message === 'no-sidebar'
                                  ? t('open.noSidebar')
                                  : result.message === 'empty-path'
                                    ? t('open.empty')
                                    : result.message;
                                setOpenError(tr(t, 'open.error', { message }));
                              }
                            },
                          }, fileGlyph(), h('span', { className: 'dfc-user-file__name' }, file.label))))
                        : null,
                      item.text !== ''
                        ? h('div', { className: 'dfc-message-actions' },
                          h('button', {
                            type: 'button',
                            className: 'dfc-msg-action',
                            onClick: () => copyMessage(item),
                          }, copiedKey === item.key ? t('message.copied') : t('message.copy')))
                        : null)
                    : h('div', { key: item.key, className: 'dfc-assistant-message' },
                      h('div', { className: 'dfc-assistant-text dfc-md' }, ...renderMarkdown(item.text, item.key, mdImageCtx, t)),
                      (item.images || []).some(image => image.source === 'attachment')
                        ? h('div', { className: 'dfc-msg-images' },
                          ...(item.images || []).filter(image => image.source === 'attachment').map((image) => {
                            const imageKey = resolvePathKey(image);
                            const url = urls[imageKey];
                            return h('button', {
                              key: image.key || imageKey,
                              type: 'button',
                              className: 'dfc-msg-image',
                              title: image.label,
                              onClick: () => openImagePreview(image, url),
                            }, url ? h('img', { src: url, alt: '', loading: 'lazy' }) : h('span', { className: 'dfc-user-image-fallback' }, image.label));
                          }))
                        : null,
                      h('div', { className: 'dfc-message-actions' },
                        h('button', {
                          type: 'button',
                          className: 'dfc-msg-action',
                          onClick: () => copyMessage(item),
                        }, copiedKey === item.key ? t('message.copied') : t('message.copy')),
                        item.messageId !== undefined && h('button', {
                          type: 'button',
                          className: 'dfc-msg-action',
                          'data-active': feedback[item.messageId] === 'positive' || undefined,
                          onClick: () => chooseRating(item, 'positive'),
                        }, feedback[item.messageId] === 'positive' ? t('message.likeActive') : t('message.like')),
                        item.messageId !== undefined && h('button', {
                          type: 'button',
                          className: 'dfc-msg-action',
                          'data-active': feedback[item.messageId] === 'negative' || undefined,
                          onClick: () => chooseRating(item, 'negative'),
                        }, feedback[item.messageId] === 'negative' ? t('message.dislikeActive') : t('message.dislike')),
                        item.turnSeq !== undefined && h('button', {
                          type: 'button',
                          className: 'dfc-msg-action',
                          onClick: () => branchMessage(item),
                        }, t('message.branch'))),
                      index === lastAssistantIndex && metaParts.length > 0
                        ? h('div', { className: 'dfc-turn-meta' },
                          h('span', { className: 'dfc-turn-meta__turn' }, t('meta.turn')),
                          ...metaParts.map((part, partIndex) => h('span', { key: 'meta-' + partIndex }, part)))
                        : null))),
              h('div', { className: 'dfc-output-hint' }, t('paper.hint'))))),
        h(CompactView, {
          state: state.state,
          labels,
          reply,
          paperText,
          images: preview.images,
          files: preview.files,
          more: preview.more,
          work: workSummary,
          t,
          urls,
          onOpen: openItem,
          onOpenFile: item => openItem(item, undefined),
          openError,
          imageErrors,
          onImageError: markImageError,
        }),
        lightboxNode);
    }

    function CounterView(props) {
      if (typeof props.useChat !== 'function') {
        return h('div', { className: 'dfc-view dfc-fallback' },
          h('div', { className: 'dfc-fallback-title' }, props.t('fallback.title')),
          h('div', { className: 'dfc-fallback-detail' }, props.t('fallback.detail')));
      }
      return h(CounterViewInner, props);
    }

    // ---------------------------------------------------------------- styles
    const CSS = `
.dfc-view {
  box-sizing: border-box;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  container-type: inline-size;
  color: var(--dfc-sheet-ink);
  font-family: var(--dsw-font-family, "Microsoft YaHei", sans-serif);
}
.dfc-view[data-style="light"] {
  --dfc-table-bg: #e8dcc8;
  --dfc-sheet-bg: #fffdf7;
  --dfc-sheet-ink: #3a3026;
  --dfc-sheet-line: #e8dfcf;
  --dfc-sheet-accent: #2f6bff;
  --dfc-sheet-margin: #e7a6a0;
  --dfc-table-bg: #c9a26b;
  --dfc-table-top: #f1d7ad;
  --dfc-table-bottom: #6b4629;
  --dfc-sign-ink: #4a3524;
  --dfc-sign-detail: #7d6248;
  --dfc-sign-foot: #b29d82;
  --dfc-toggle-bg: rgba(255, 248, 234, 0.94);
  --dfc-toggle-border: #b99365;
  --dfc-toggle-ink: #5a432c;
  --dfc-sheet-shadow: 0 8px 30px rgba(70, 48, 25, 0.18);
  --dfc-tag-bg: #f3ead9;
  --dfc-tag-edge: #d9c9ad;
  background: var(--dfc-table-bg);
}
.dfc-view[data-style="dark"] {
  --dfc-table-bg: #050b10;
  --dfc-sheet-bg: #07151b;
  --dfc-sheet-ink: #cfeee9;
  --dfc-sheet-line: #12343a;
  --dfc-sheet-accent: #35e0d0;
  --dfc-sheet-margin: #ff4fd8;
  --dfc-table-bg: #111c24;
  --dfc-table-top: #2b4a55;
  --dfc-table-bottom: #040a0e;
  --dfc-sign-ink: #a8fff6;
  --dfc-sign-detail: #67b8b8;
  --dfc-sign-foot: #3f7c80;
  --dfc-toggle-bg: rgba(8, 22, 28, 0.92);
  --dfc-toggle-border: #1b7c80;
  --dfc-toggle-ink: #9ff7f0;
  --dfc-sheet-shadow: 0 0 30px rgba(53, 224, 208, 0.16);
  --dfc-tag-bg: #0b2830;
  --dfc-tag-edge: #1b5a60;
  background: var(--dfc-table-bg);
}
.dfc-scene {
  position: relative;
  flex: 0 0 auto;
  width: 100%;
  height: min(24%, calc(100cqw * 334 / 2048));
  min-height: 190px;
  max-height: 320px;
  overflow: hidden;
  container-type: size;
  background: #f6efe4;
  --dfc-table-h: 10px;
}
/* While dragging, let the lifted character paint above the output area: the
   scene stops clipping and stops forming its own stacking context, so the
   rig's z-index competes with the desk instead of being trapped inside. */
.dfc-scene[data-dragging="true"] {
  overflow: visible;
  container-type: normal;
}
.dfc-wall {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  z-index: 0;
  pointer-events: none;
  user-select: none;
}
.dfc-char {
  position: absolute;
  left: 50%;
  bottom: calc(var(--dfc-table-h) - 20px);
  height: clamp(190px, 100%, 380px);
  width: auto;
  transform: translateX(-50%);
  z-index: 1;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}
.dfc-tabletop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: var(--dfc-table-h);
  z-index: 2;
  background-color: var(--dfc-table-bg);
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 100%;
  border: 0;
  box-shadow: none;
}
.dfc-char-rig {
  position: absolute;
  bottom: calc(var(--dfc-table-h) - 80px);
  height: calc(100% + 60px);
  width: auto;
  aspect-ratio: 1065 / 1313;
  z-index: 1;
  transform: translate(-50%, 0);
  transition: left 2.4s ease-in-out, transform 0.18s ease-out;
  cursor: grab;
  touch-action: none;
  user-select: none;
  outline: none;
}
.dfc-char-rig[data-dragging="true"] {
  z-index: 9;
  transform: translate(-50%, -26px);
  transition: transform 0.18s ease-out;
  cursor: grabbing;
}
.dfc-char-rig[data-dragging="true"][data-motion="on"] .dfc-char-state {
  animation: dfc-struggle 0.34s ease-in-out infinite;
  transform-origin: 50% 85%;
}
@keyframes dfc-struggle {
  0%, 100% { transform: translateX(-3px) rotate(-1.4deg); }
  50% { transform: translateX(3px) rotate(1.4deg); }
}
.dfc-char-rig img { -webkit-user-drag: none; }
.dfc-char-rig:focus-visible {
  outline: 2px solid var(--dfc-sheet-accent);
  outline-offset: 3px;
  border-radius: 8px;
}
.dfc-char-rig .dfc-char-body {
  position: relative;
  height: 100%;
  width: 100%;
  transform-origin: 50% 92%;
  animation: dfc-breathe 4.8s ease-in-out infinite;
}
.dfc-char-step,
.dfc-char-state,
.dfc-char-facing {
  position: relative;
  height: 100%;
  width: 100%;
  transform-origin: 50% 88%;
}
.dfc-char-rig[data-walking="true"] .dfc-char-step {
  animation: dfc-walk 0.52s ease-in-out infinite;
}
.dfc-char-state {
  transform: rotate(var(--dfc-lean, 0deg));
  transition: transform 0.42s ease;
}
.dfc-char-facing {
  transform: scaleX(var(--dfc-facing, 1));
  transition: transform 0.28s ease;
}
.dfc-char-layer {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}
.dfc-char-pose-body { z-index: 1; opacity: 0; }
.dfc-char-pose-head { z-index: 2; opacity: 0; }
.dfc-char-rig[data-pose="idle"] .dfc-char-pose-body[data-pose="idle"],
.dfc-char-rig[data-pose="thinking"] .dfc-char-pose-body[data-pose="thinking"],
.dfc-char-rig[data-pose="clap"] .dfc-char-pose-body[data-pose="clap"],
.dfc-char-rig[data-pose="tablet"] .dfc-char-pose-body[data-pose="tablet"],
.dfc-char-rig[data-pose="idle"] .dfc-char-pose-head[data-pose="idle"],
.dfc-char-rig[data-pose="thinking"] .dfc-char-pose-head[data-pose="thinking"],
.dfc-char-rig[data-pose="clap"] .dfc-char-pose-head[data-pose="clap"],
.dfc-char-rig[data-pose="tablet"] .dfc-char-pose-head[data-pose="tablet"] {
  opacity: 1;
}
.dfc-char-head-wrap {
  position: absolute;
  inset: 0;
  z-index: 2;
  transform-origin: 50% 57%;
  transform: rotate(var(--dfc-head-tilt, 0deg));
  transition: transform 0.45s ease;
}
.dfc-char-head-motion {
  position: relative;
  width: 100%;
  height: 100%;
  transform-origin: 50% 57%;
  animation: dfc-head-sway 5.8s ease-in-out infinite;
}
.dfc-char-face-layer {
  z-index: 3;
  opacity: 0;
}
.dfc-char-hand-layer {
  z-index: 4;
  opacity: 0;
}
.dfc-char-reaction-full {
  z-index: 5;
}
.dfc-char-rig[data-reaction] .dfc-char-pose-body,
.dfc-char-rig[data-reaction] .dfc-char-pose-head,
.dfc-char-rig[data-reaction] .dfc-char-face-layer,
.dfc-char-rig[data-reaction] .dfc-char-hand-layer,
.dfc-char-rig[data-full] .dfc-char-pose-body,
.dfc-char-rig[data-full] .dfc-char-pose-head,
.dfc-char-rig[data-full] .dfc-char-face-layer,
.dfc-char-rig[data-full] .dfc-char-hand-layer {
  opacity: 0 !important;
}
.dfc-char-rig[data-pose="thinking"] .dfc-char-hand-layer[data-hand="thinking"],
.dfc-char-rig[data-pose="clap"] .dfc-char-hand-layer[data-hand="clap"],
.dfc-char-rig[data-pose="tablet"] .dfc-char-hand-layer[data-hand="tablet"] {
  opacity: 1;
}
.dfc-char-rig[data-state="thinking"] .dfc-char-face-layer[data-face="thinking"],
.dfc-char-rig[data-state="tool"] .dfc-char-face-layer[data-face="tool"],
.dfc-char-rig[data-state="approval"] .dfc-char-face-layer[data-face="approval"],
.dfc-char-rig[data-state="error"] .dfc-char-face-layer[data-face="error"] {
  opacity: 1;
}
.dfc-char-rig[data-state="thinking"] { --dfc-lean: -1.1deg; --dfc-head-tilt: -1.6deg; }
.dfc-char-rig[data-state="tool"] { --dfc-lean: 0.7deg; --dfc-head-tilt: 0.6deg; }
.dfc-char-rig[data-state="approval"] { --dfc-lean: 1deg; --dfc-head-tilt: 0.8deg; }
.dfc-char-rig[data-state="error"] { --dfc-lean: 0deg; --dfc-head-tilt: -0.7deg; }
.dfc-char-rig[data-action="hop"] .dfc-char-body { animation: dfc-hop 0.68s ease-in-out !important; }
.dfc-char-rig[data-reaction="laugh"] .dfc-char-step { animation: dfc-laugh-bounce 0.52s ease-in-out infinite; }
@keyframes dfc-laugh-bounce {
  0%, 100% { transform: translateY(0) scaleY(1); }
  50% { transform: translateY(-3.2%) scaleY(1.02); }
}
@keyframes dfc-breathe {
  0%, 100% { transform: translateY(0) scaleY(1); }
  50% { transform: translateY(-1.4%) scaleY(1.012); }
}
@keyframes dfc-walk {
  0% { transform: translateY(0) rotate(-1.2deg); }
  25% { transform: translateY(-2.6%) rotate(1.4deg); }
  50% { transform: translateY(0) rotate(1.2deg); }
  75% { transform: translateY(-2.2%) rotate(-1.2deg); }
  100% { transform: translateY(0) rotate(-1.2deg); }
}
@keyframes dfc-head-sway {
  0%, 100% { transform: rotate(-0.6deg) translateY(0); }
  50% { transform: rotate(0.7deg) translateY(-0.35%); }
}
@keyframes dfc-hop {
  0%, 100% { transform: translateY(0) scaleY(1); }
  35% { transform: translateY(-7%) scaleY(1.03); }
  65% { transform: translateY(-2%) scaleY(0.99); }
}
.dfc-thought {
  position: absolute;
  left: 50%;
  top: 7%;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: clamp(180px, 18cqw, 250px);
  max-height: 86px;
  padding: 8px 11px 7px;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 16px 16px 16px 8px;
  background: var(--dfc-sheet-bg);
  color: var(--dfc-sheet-ink);
  box-shadow: 0 8px 24px rgba(30, 24, 16, 0.18), inset 0 1px 0 rgba(255, 255, 255, 0.04);
  cursor: text;
  animation: dfc-thought-in 0.18s ease-out;
}
.dfc-thought::before {
  content: '';
  position: absolute;
  left: 16px;
  bottom: -8px;
  width: 11px;
  height: 11px;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 50%;
  background: var(--dfc-sheet-bg);
}
.dfc-thought::after {
  content: '';
  position: absolute;
  left: 7px;
  bottom: -17px;
  width: 6px;
  height: 6px;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 50%;
  background: var(--dfc-sheet-bg);
}
.dfc-thought-title {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  opacity: 0.62;
}
.dfc-thought-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dfc-sheet-accent);
}
.dfc-thought-body {
  min-height: 0;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  scrollbar-width: thin;
  scrollbar-color: var(--dfc-sheet-line) transparent;
}
.dfc-thought-body::-webkit-scrollbar { width: 4px; }
.dfc-thought-body::-webkit-scrollbar-thumb {
  border-radius: 2px;
  background: var(--dfc-sheet-line);
}
@keyframes dfc-thought-in {
  from { opacity: 0; transform: translateY(4px) scale(0.98); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}
.dfc-sign {
  position: absolute;
  left: 9%;
  bottom: calc(var(--dfc-table-h) - 8px);
  width: clamp(125px, 12.5cqw, 200px);
  aspect-ratio: 1.45;
  z-index: 3;
  pointer-events: none;
}
.dfc-view[data-style="light"] .dfc-sign { aspect-ratio: 1349 / 1006; }
.dfc-view[data-style="dark"] .dfc-sign { aspect-ratio: 1645 / 1358; }
.dfc-sign-art {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  user-select: none;
}
.dfc-sign-copy {
  position: absolute;
  left: 16%;
  right: 16%;
  top: 19%;
  bottom: 18%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: 2px;
  text-align: center;
  overflow: hidden;
}
.dfc-view[data-style="light"] .dfc-sign-copy { left: 10%; right: 10%; top: 10%; bottom: 24%; }
.dfc-view[data-style="dark"] .dfc-sign-copy { left: 17%; right: 17%; top: 12%; bottom: 31%; }
.dfc-sign-title {
  font-size: clamp(11px, 0.95cqw, 15px);
  font-weight: 700;
  line-height: 1.2;
  color: var(--dfc-sign-ink);
  text-align: center;
  max-width: 100%;
}
.dfc-sign-detail {
  font-size: clamp(8px, 0.66cqw, 10px);
  line-height: 1.3;
  color: var(--dfc-sign-detail);
  text-align: center;
  max-width: 100%;
}
.dfc-sign-foot {
  margin-top: 2px;
  font-size: clamp(6px, 0.52cqw, 8px);
  color: var(--dfc-sign-foot);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
  text-align: center;
}
.dfc-personal-scatter {
  position: absolute;
  inset: 0;
  z-index: 3;
  pointer-events: none;
}
.dfc-personal-item {
  position: absolute;
  object-fit: contain;
  pointer-events: none;
  user-select: none;
  filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.2));
}
.dfc-props {
  position: absolute;
  right: 9%;
  bottom: var(--dfc-table-h);
  width: min(40%, 500px);
  z-index: 3;
  display: flex;
  flex-wrap: wrap;
  align-content: flex-end;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 6px;
  overflow: hidden;
  pointer-events: none;
}
.dfc-frame,
.dfc-file {
  pointer-events: auto;
  flex: none;
  box-sizing: border-box;
  padding: 2px;
  border: 2px solid var(--dfc-table-bottom);
  border-radius: 3px;
  background: var(--dfc-sheet-bg);
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.18);
  cursor: pointer;
}
.dfc-frame {
  width: clamp(32px, 3.2cqw, 48px);
  aspect-ratio: 1.25;
  overflow: hidden;
}
.dfc-frame img { display: block; width: 100%; height: 100%; object-fit: cover; }
.dfc-frame-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  color: var(--dfc-sign-foot);
  font-size: 10px;
}
.dfc-file {
  position: relative;
  width: clamp(42px, 4.2cqw, 62px);
  height: clamp(30px, 2.8cqw, 42px);
  overflow: hidden;
  color: var(--dfc-sheet-ink);
  text-align: left;
}
.dfc-file::before {
  content: "";
  position: absolute;
  left: 3px;
  top: -2px;
  width: 42%;
  height: 5px;
  border-radius: 3px 3px 0 0;
  background: var(--dfc-sheet-accent);
}
.dfc-file-name {
  display: block;
  margin-top: 5px;
  padding: 0 2px;
  overflow: hidden;
  font-size: clamp(6px, 0.45cqw, 8px);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dfc-more {
  flex: none;
  max-width: 100%;
  color: var(--dfc-sheet-ink);
  font-size: clamp(8px, 0.62cqw, 10px);
  line-height: 1.3;
}
.dfc-scene-controls {
  position: absolute;
  right: 2%;
  top: 2%;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 6px;
}
.dfc-theme-toggle,
.dfc-motion-toggle {
  padding: 4px 10px;
  border: 1px solid var(--dfc-toggle-border);
  border-radius: 999px;
  background: var(--dfc-toggle-bg);
  color: var(--dfc-toggle-ink);
  font-size: clamp(8px, 0.62cqw, 10px);
  cursor: pointer;
}
.dfc-char-rig[data-motion="off"] .dfc-char-body,
.dfc-char-rig[data-motion="off"] .dfc-char-step,
.dfc-char-rig[data-motion="off"] .dfc-char-head-motion { animation: none !important; }
.dfc-char-rig[data-motion="off"] .dfc-char-state,
.dfc-char-rig[data-motion="off"] .dfc-char-facing,
.dfc-char-rig[data-motion="off"] .dfc-char-head-wrap,
.dfc-char-rig[data-motion="off"] .dfc-char-face-layer { transition: none; }
.dfc-char-rig[data-motion="off"] .dfc-char-state,
.dfc-char-rig[data-motion="off"] .dfc-char-head-wrap { transform: none; }
.dfc-char-rig[data-motion="off"] { transition: none; }
.dfc-open-error {
  position: absolute;
  left: 9%;
  bottom: calc(var(--dfc-table-h) + 4px);
  z-index: 4;
  max-width: 46%;
  padding: 4px 7px;
  border-radius: 4px;
  background: rgba(72, 42, 26, 0.88);
  color: #fff6ea;
  font-size: clamp(8px, 0.72cqw, 10px);
}
.dfc-desk {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background-color: var(--dfc-table-bg);
}
.dfc-view[data-style="light"] .dfc-desk {
  background-image:
    linear-gradient(90deg, rgba(255, 255, 255, 0.16) 0 1px, transparent 1px),
    linear-gradient(0deg, rgba(120, 86, 50, 0.07) 0 1px, transparent 1px);
  background-size: 90px 100%, 100% 34px;
}
.dfc-view[data-style="dark"] .dfc-desk {
  background-image:
    linear-gradient(rgba(53, 224, 208, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(53, 224, 208, 0.055) 1px, transparent 1px);
  background-size: 32px 32px;
}
.dfc-sheet {
  position: relative;
  /* Follow the host conversation width axis: the native width handles publish
     --dsh-chat-content-width on the conversation body, so the desk page tracks
     the same dragged width instead of a fixed percentage. */
  width: min(72%, 900px);
  width: min(var(--dsh-chat-content-width, 900px), calc(100% - 32px));
  height: calc(100% - 10px);
  margin: 8px auto 0;
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  background: var(--dfc-sheet-bg);
  color: var(--dfc-sheet-ink);
  box-shadow: var(--dfc-sheet-shadow);
}
.dfc-view[data-style="light"] .dfc-sheet {
  border: 1px solid #e1d3bb;
  border-left: 24px solid #efe3cf;
  border-radius: 3px 5px 5px 3px;
}
.dfc-view[data-style="light"] .dfc-sheet::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 0;
  bottom: 0;
  width: 8px;
  background: repeating-linear-gradient(180deg, #b99365 0 2px, transparent 2px 26px);
  opacity: 0.55;
  pointer-events: none;
}
.dfc-view[data-style="light"] .dfc-sheet::after {
  content: "";
  position: absolute;
  left: 46px;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--dfc-sheet-margin);
  opacity: 0.55;
  pointer-events: none;
}
.dfc-view[data-style="dark"] .dfc-sheet {
  border: 1px solid var(--dfc-sheet-accent);
  border-radius: 6px;
}
.dfc-view[data-style="dark"] .dfc-sheet::before {
  content: "";
  position: sticky;
  top: 0;
  z-index: 2;
  display: block;
  height: 16px;
  background:
    linear-gradient(90deg, var(--dfc-sheet-accent) 0 8px, transparent 8px 14px),
    linear-gradient(90deg, rgba(53, 224, 208, 0.16) 0 100%);
  border-bottom: 1px solid rgba(53, 224, 208, 0.35);
  pointer-events: none;
}
.dfc-view[data-style="dark"] .dfc-sheet::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: repeating-linear-gradient(0deg, rgba(53, 224, 208, 0.035) 0 1px, transparent 1px 4px);
}
.dfc-output {
  position: relative;
  z-index: 1;
  padding: 24px 42px 42px 64px;
}
.dfc-view[data-style="light"] .dfc-output {
  background-image: repeating-linear-gradient(180deg, transparent 0 calc(24px + var(--dsh-content-font-delta, 0px) - 1px), var(--dfc-sheet-line) calc(24px + var(--dsh-content-font-delta, 0px) - 1px) calc(24px + var(--dsh-content-font-delta, 0px)));
}
.dfc-view[data-style="dark"] .dfc-output {
  padding: 22px 34px 40px 38px;
}
.dfc-output-title {
  color: var(--dfc-sheet-accent);
  font-size: 0.85em;
  font-weight: 700;
  letter-spacing: 0.04em;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--dfc-sheet-line);
}
.dfc-view[data-style="dark"] .dfc-output-title {
  text-shadow: 0 0 10px rgba(53, 224, 208, 0.5);
  border-bottom-color: rgba(53, 224, 208, 0.35);
}
.dfc-output-body {
  margin-top: 14px;
  color: var(--dfc-sheet-ink);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dfc-view[data-style="dark"] .dfc-output-body {
  font-size: clamp(13px, 0.98cqw, 16px);
  line-height: 1.7;
}
.dfc-thread {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.dfc-user-tag {
  position: relative;
  align-self: flex-end;
  max-width: 78%;
  margin: 4px 0 4px auto;
  padding: 9px 14px 8px 20px;
  border: 1px solid var(--dfc-tag-edge);
  border-left: 3px solid var(--dfc-sheet-accent);
  border-radius: 4px 10px 10px 4px;
  background: var(--dfc-tag-bg);
  color: var(--dfc-sheet-ink);
  box-shadow: 0 2px 0 rgba(0, 0, 0, 0.06);
}
.dfc-user-tag::before {
  content: "";
  position: absolute;
  left: 8px;
  top: 12px;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dfc-table-bg);
  border: 1px solid var(--dfc-tag-edge);
}
.dfc-user-tag-text {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.dfc-user-attachments {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 7px;
}
.dfc-user-image {
  width: 64px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 6px;
  background: var(--dfc-sheet-bg);
  cursor: zoom-in;
}
.dfc-user-image img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.dfc-user-image-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 4px;
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
  color: var(--dfc-sign-detail);
}
.dfc-user-files {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 7px;
}
.dfc-user-file {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 3px 8px 3px 5px;
  border: 1px solid var(--dfc-tag-edge);
  border-radius: 6px;
  background: var(--dfc-sheet-bg);
  color: var(--dfc-sheet-ink);
  font-size: 11px;
  line-height: 16px;
  cursor: pointer;
}
.dfc-user-file:hover { border-color: var(--dfc-sheet-accent); }
.dfc-user-file:focus-visible { outline: 2px solid var(--dfc-sheet-accent); outline-offset: 1px; }
.dfc-user-file__glyph { flex: none; color: var(--dfc-sheet-accent); }
.dfc-user-file__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dfc-assistant-message { align-self: stretch; }
.dfc-assistant-text {
  color: var(--dfc-sheet-ink);
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
  overflow-wrap: anywhere;
}
.dfc-view[data-style="dark"] .dfc-assistant-text {
  font-size: var(--dsh-content-font-size, 14px);
  line-height: calc(24px + var(--dsh-content-font-delta, 0px));
}
.dfc-md p { margin: 0 0 0.8em; white-space: pre-wrap; }
.dfc-md p:last-child { margin-bottom: 0; }
.dfc-md li { white-space: pre-wrap; }
.dfc-md h1, .dfc-md h2, .dfc-md h3, .dfc-md h4, .dfc-md h5, .dfc-md h6 {
  margin: 0.7em 0 0.4em;
  font-weight: 700;
  line-height: 1.3;
  color: var(--dfc-sheet-ink);
}
.dfc-md h1 { font-size: var(--dsw-font-markdown-h1-font-size, 1.5em); }
.dfc-md h2 { font-size: var(--dsw-font-markdown-h2-font-size, 1.35em); }
.dfc-md h3 { font-size: var(--dsw-font-markdown-h3-font-size, 1.25em); }
.dfc-md h4, .dfc-md h5, .dfc-md h6 { font-size: var(--dsw-font-markdown-h4-font-size, 1em); }
.dfc-md ul, .dfc-md ol { margin: 0.35em 0 0.8em; padding-left: 1.5em; }
.dfc-md li { margin: 0.2em 0; }
.dfc-md code {
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
  font-size: var(--dsh-code-font-size, 11px);
  padding: 0.1em 0.3em;
  border-radius: 3px;
}
.dfc-view[data-style="light"] .dfc-md code { background: #f2e9d8; }
.dfc-view[data-style="dark"] .dfc-md code { background: #0d2a31; }
.dfc-md pre {
  margin: 0.6em 0;
  padding: 0.7em 0.8em;
  overflow: auto;
  border-radius: 4px;
}
.dfc-view[data-style="light"] .dfc-md pre { background: #f2e9d8; }
.dfc-view[data-style="dark"] .dfc-md pre { background: #0a2027; border: 1px solid #123c42; }
.dfc-md pre code { padding: 0; background: transparent; }
.dfc-md a { color: var(--dfc-sheet-accent); text-decoration: underline; }
.dfc-md blockquote {
  margin: 0.5em 0;
  padding-left: 0.8em;
  border-left: 2px solid var(--dfc-sheet-accent);
  color: var(--dfc-sign-detail);
}
.dfc-code {
  margin: 10px 0;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 8px;
  overflow: hidden;
  background: rgba(0, 0, 0, 0.035);
}
.dfc-view[data-style="dark"] .dfc-code { background: rgba(5, 30, 36, 0.72); }
.dfc-code__bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-bottom: 1px solid var(--dfc-sheet-line);
  font-size: 10px;
  line-height: 18px;
}
.dfc-code__lang {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.62;
  font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
}
.dfc-code__btn {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 4px;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 10px;
  line-height: 16px;
  cursor: pointer;
  opacity: 0.72;
}
.dfc-code__btn:hover { opacity: 1; border-color: var(--dfc-sheet-accent); color: var(--dfc-sheet-accent); }
.dfc-code__btn[aria-pressed="true"] { color: var(--dfc-sheet-accent); border-color: var(--dfc-sheet-accent); opacity: 1; }
.dfc-code pre {
  margin: 0;
  padding: 9px 12px;
  max-height: 320px;
  overflow: auto;
  border: 0;
  border-radius: 0;
  background: transparent;
  white-space: pre;
}
.dfc-view[data-style="light"] .dfc-code pre,
.dfc-view[data-style="dark"] .dfc-code pre { background: transparent; border: 0; }
.dfc-code[data-wrap="true"] pre { white-space: pre-wrap; overflow-wrap: anywhere; }
.dfc-code pre code { padding: 0; background: transparent; white-space: inherit; }
.dfc-md hr { border: 0; border-top: 1px solid var(--dfc-sheet-line); margin: 0.8em 0; }
.dfc-md table { width: 100%; border-collapse: collapse; margin: 0.5em 0; font-size: var(--dsh-content-font-size-secondary, 13px); }
.dfc-md th, .dfc-md td {
  border: 1px solid var(--dfc-sheet-line);
  padding: 0.25em 0.45em;
  text-align: left;
  vertical-align: top;
}
.dfc-md th { font-weight: 700; }
.dfc-md .dfc-md-image {
  display: inline-block;
  padding: 0.05em 0.4em;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 3px;
  color: var(--dfc-sign-detail);
  font-size: 0.9em;
}
.dfc-message-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 6px;
}
.dfc-msg-action {
  padding: 2px 8px;
  border: 1px solid var(--dfc-tag-edge);
  border-radius: 4px;
  background: transparent;
  color: var(--dfc-sign-detail);
  font-size: 0.72em;
  line-height: 1.5;
  cursor: pointer;
}
.dfc-msg-action[data-active] {
  color: var(--dfc-sheet-accent);
  border-color: var(--dfc-sheet-accent);
}
.dfc-msg-action:hover {
  border-color: var(--dfc-sheet-accent);
  color: var(--dfc-sheet-accent);
}
.dfc-output-hint {
  margin-top: 18px;
  color: var(--dfc-sign-foot);
  font-size: 0.72em;
  text-align: right;
}
.dfc-compact { display: none; }
.dfc-lightbox {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 24px;
  background: rgba(15, 23, 42, 0.82);
}
.dfc-lightbox-img {
  max-width: min(90vw, 980px);
  max-height: 76vh;
  border-radius: 6px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
}
.dfc-lightbox-close {
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.45);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
}
.dfc-fallback { display: flex; flex-direction: column; gap: 8px; justify-content: center; align-items: center; }
.dfc-fallback-title { font-size: 16px; font-weight: 600; }
.dfc-fallback-detail { font-size: 13px; color: #8a6f55; }
/* ------------------------------------------------------------ work tag */
.dfc-worktag {
  position: absolute;
  top: 0;
  right: 16%;
  z-index: 6;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  width: clamp(182px, 16.5cqw, 220px);
  transform-origin: 50% 0;
  filter: drop-shadow(0 12px 20px rgba(60, 40, 20, 0.18));
  animation: dfc-tag-drop 0.28s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  transition: transform 0.2s ease, opacity 0.2s ease;
  cursor: pointer;
}
@keyframes dfc-tag-drop {
  from { opacity: 0; transform: translateY(-12px) rotate(-1.4deg); }
  to { opacity: 1; transform: translateY(0) rotate(0); }
}
.dfc-worktag[data-yield="true"] {
  animation: none;
  transform: translateY(-108%);
  opacity: 0;
  pointer-events: none;
}
.dfc-worktag:focus-visible { outline: 2px solid var(--dfc-sheet-accent); outline-offset: 3px; border-radius: 6px; }
.dfc-worktag__nail {
  position: absolute;
  top: 1px;
  left: 50%;
  width: 7px;
  height: 7px;
  margin-left: -3.5px;
  border-radius: 50%;
  background: linear-gradient(#f2e3c9, #b99365);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.7);
  z-index: 2;
}
.dfc-worktag__cord {
  position: absolute;
  top: 6px;
  left: 50%;
  width: 1.5px;
  height: 25px;
  background: var(--dfc-tag-edge);
  transform-origin: 50% 0;
  z-index: 1;
}
.dfc-worktag__cord.l { transform: rotate(13deg); }
.dfc-worktag__cord.r { transform: rotate(-13deg); }
.dfc-worktag__body {
  position: relative;
  flex: 0 1 auto;
  min-height: 0;
  overflow: auto;
  margin-top: 28px;
  padding: 9px 11px 8px;
  border: 1px solid var(--dfc-tag-edge);
  border-radius: 5px 5px 10px 10px;
  background: var(--dfc-sheet-bg);
  color: var(--dfc-sheet-ink);
  font-size: 11px;
  line-height: 1.45;
  box-shadow: 0 8px 24px rgba(30, 24, 16, 0.18);
  scrollbar-width: thin;
}
.dfc-worktag__body::before {
  content: "";
  position: absolute;
  top: 5px;
  left: 50%;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transform: translateX(-50%);
  background: var(--dfc-table-bg);
  box-shadow: inset 0 0 0 1px var(--dfc-tag-edge);
}
.dfc-worktag__title {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 1px 0 5px;
  border-bottom: 1px dashed var(--dfc-sheet-line);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  opacity: 0.62;
}
.dfc-worktag__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dfc-sheet-accent);
}
.dfc-worktag__dot.is-running { animation: dfc-work-pulse 1.4s ease-in-out infinite; }
@keyframes dfc-work-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
.dfc-worktag__row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
  min-width: 0;
}
.dfc-worktag__badge {
  flex: 0 0 auto;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 9.5px;
  line-height: 16px;
  letter-spacing: 0.02em;
  color: var(--dfc-sheet-accent);
  background: rgba(47, 107, 255, 0.09);
}
.dfc-view[data-style="dark"] .dfc-worktag__badge { background: rgba(53, 224, 208, 0.14); }
.dfc-worktag__row[data-status="error"] .dfc-worktag__badge { color: #d05a4a; background: rgba(208, 90, 74, 0.12); }
.dfc-worktag__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.86;
}
.dfc-worktag__count { flex: 0 0 auto; font-size: 9px; opacity: 0.55; }
.dfc-worktag__sources {
  margin-top: 6px;
  padding-top: 5px;
  border-top: 1px dashed var(--dfc-sheet-line);
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 9.5px;
}
.dfc-worktag__source {
  display: flex;
  gap: 5px;
  align-items: baseline;
  color: inherit;
  text-decoration: none;
  opacity: 0.8;
}
.dfc-worktag__source:hover { opacity: 1; color: var(--dfc-sheet-accent); }
.dfc-worktag__source b {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dfc-worktag__source i { flex: 0 0 auto; font-style: normal; opacity: 0.55; }
.dfc-worktag__more { margin-top: 6px; font-size: 9.5px; opacity: 0.5; letter-spacing: 0.04em; }
.dfc-worktag[data-open="true"] { width: clamp(250px, 22cqw, 302px); }
.dfc-worktag[data-open="true"] .dfc-worktag__row { margin-top: 5px; }

/* --------------------------------------------------------- work pill */
.dfc-workpill {
  position: absolute;
  top: 6px;
  left: 9%;
  z-index: 4;
  width: clamp(190px, 19cqw, 260px);
  box-sizing: border-box;
}
.dfc-workpill *,
.dfc-workpill *::before,
.dfc-workpill *::after { box-sizing: border-box; }
.dfc-workpill__button {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 22px;
  padding: 0 10px;
  overflow: hidden;
  border: 1px solid var(--dfc-toggle-border);
  border-radius: 999px;
  background: var(--dfc-toggle-bg);
  color: var(--dfc-toggle-ink);
  font-size: clamp(8px, 0.62cqw, 10px);
  cursor: pointer;
}
.dfc-workpill__button:hover { border-color: var(--dfc-sheet-accent); }
.dfc-workpill__button:focus-visible { outline: 2px solid var(--dfc-sheet-accent); outline-offset: 2px; }
.dfc-workpill__dot {
  flex: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dfc-sheet-accent);
}
.dfc-workpill__dot.is-running { animation: dfc-work-pulse 1.4s ease-in-out infinite; }
.dfc-workpill__badge {
  flex: none;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 9px;
  line-height: 14px;
  color: var(--dfc-sheet-accent);
  background: rgba(47, 107, 255, 0.1);
}
.dfc-view[data-style="dark"] .dfc-workpill__badge { background: rgba(53, 224, 208, 0.14); }
.dfc-workpill__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  animation: dfc-workpill-in 0.22s ease-out;
}
@keyframes dfc-workpill-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.dfc-workpill__panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  width: 100%;
  max-height: 140px;
  overflow: auto;
  padding: 8px 10px;
  border: 1px solid var(--dfc-tag-edge);
  border-radius: 8px;
  background: var(--dfc-sheet-bg);
  color: var(--dfc-sheet-ink);
  box-shadow: 0 14px 30px rgba(30, 24, 16, 0.24);
  font-size: 10.5px;
  line-height: 1.45;
  scrollbar-width: thin;
}
.dfc-workpill__row {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 3px 0;
  border-bottom: 1px dashed var(--dfc-sheet-line);
}
.dfc-workpill__row:last-of-type { border-bottom: 0; }
.dfc-workpill__row-badge {
  flex: none;
  padding: 0 4px;
  border-radius: 3px;
  font-size: 9px;
  line-height: 14px;
  color: var(--dfc-sheet-accent);
  background: rgba(47, 107, 255, 0.09);
}
.dfc-workpill__row[data-status="error"] .dfc-workpill__row-badge { color: #d05a4a; background: rgba(208, 90, 74, 0.12); }
.dfc-workpill__row-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.86;
}
.dfc-workpill__row-link {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  text-decoration: underline dotted;
  text-underline-offset: 2px;
  cursor: pointer;
  opacity: 0.86;
}
.dfc-workpill__row-link:hover { color: var(--dfc-sheet-accent); opacity: 1; }
.dfc-workpill__row-link:focus-visible { outline: 2px solid var(--dfc-sheet-accent); outline-offset: 1px; }
@supports (container-type: size) {
  .dfc-workpill__panel { max-height: calc(100cqh - 52px); }
}
.dfc-workpill__row-count { flex: none; font-size: 9px; opacity: 0.55; }
.dfc-workpill__sources {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px dashed var(--dfc-sheet-line);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.dfc-workpill__source {
  display: flex;
  gap: 5px;
  align-items: baseline;
  color: inherit;
  text-decoration: none;
  opacity: 0.8;
}
.dfc-workpill__source:hover { opacity: 1; color: var(--dfc-sheet-accent); }
.dfc-workpill__source b {
  font-weight: 600;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dfc-workpill__source i { flex: none; font-style: normal; opacity: 0.55; font-size: 9px; }
@media (max-width: 1199px) {
  .dfc-workpill { width: clamp(160px, 17cqw, 220px); }
}
@media (max-width: 760px) {
  .dfc-workpill { display: none; }
}

/* --------------------------------------- inline images in the transcript */
.dfc-md-image {
  display: block;
  max-width: 100%;
  max-height: min(46vh, 360px);
  margin: 8px 0;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.04);
  object-fit: contain;
  cursor: zoom-in;
}
.dfc-md-image--chip {
  display: inline;
  padding: 0 4px;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 4px;
  font-size: 0.9em;
  color: var(--dfc-sign-detail);
}
.dfc-msg-images { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
.dfc-msg-image {
  width: 64px;
  height: 64px;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--dfc-sheet-line);
  border-radius: 6px;
  background: var(--dfc-sheet-bg);
  cursor: zoom-in;
}
.dfc-msg-image img { display: block; width: 100%; height: 100%; object-fit: cover; }

/* ------------------------------------------------------- turn meta line */
.dfc-turn-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 7px;
  font-size: 10px;
  letter-spacing: 0.03em;
  opacity: 0.5;
}
.dfc-turn-meta__turn { font-weight: 600; opacity: 0.9; }

/* --------------------------------------------------- compact work line */
.dfc-compact-work {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid var(--dfc-sheet-line);
  background: var(--dfc-sheet-bg);
  color: var(--dfc-sheet-ink);
  font-size: 11px;
  line-height: 1.4;
}
.dfc-compact-work b { font-weight: 600; }
.dfc-compact-work__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--dfc-sheet-accent);
  flex: none;
}
.dfc-compact-work__text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  opacity: 0.75;
}

/* --------------------------------------------- attachment tab (sidebar) */
.dfc-att {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  min-height: 0;
  padding: 12px;
  color: inherit;
  font: inherit;
  overflow: hidden;
}
.dfc-att--status { align-items: center; justify-content: center; font-size: 12px; opacity: 0.7; }
.dfc-att--error { opacity: 1; color: #c0453a; }
.dfc-att__head { display: flex; align-items: center; gap: 8px; }
.dfc-att__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
}
.dfc-att__action {
  flex: none;
  padding: 3px 10px;
  border: 1px solid rgba(127, 127, 127, 0.4);
  border-radius: 6px;
  background: transparent;
  color: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dfc-att__text {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 10px 12px;
  overflow: auto;
  border-radius: 8px;
  background: rgba(127, 127, 127, 0.08);
  font-size: 11px;
  line-height: 1.55;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.dfc-att__image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 6px;
}
.dfc-att__note { font-size: 11px; opacity: 0.6; }

@media (max-width: 760px) {
  .dfc-scene, .dfc-desk { display: none; }
  .dfc-compact {
    display: flex;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    box-sizing: border-box;
    padding: 8px;
    flex-direction: column;
    gap: 10px;
    max-width: 560px;
    margin: 0 auto;
  }
  .dfc-compact-head {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--dfc-sheet-bg);
    border: 1px solid var(--dfc-sheet-line);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18);
  }
  .dfc-compact-char {
    width: 76px;
    height: 76px;
    object-fit: contain;
    flex: none;
  }
  .dfc-compact-label { font-size: 16px; font-weight: 700; color: var(--dfc-sheet-ink); }
  .dfc-compact-detail { margin-top: 2px; font-size: 12px; color: var(--dfc-sign-detail); }
  .dfc-compact-paper {
    padding: 12px 14px;
    border-radius: 10px;
    background: var(--dfc-sheet-bg);
    border: 1px solid var(--dfc-sheet-line);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.16);
  }
  .dfc-compact-title { color: var(--dfc-sheet-accent); font-size: 12px; font-weight: 700; }
  .dfc-compact-body {
    margin-top: 6px;
    max-height: 40vh;
    overflow: auto;
    font-size: var(--dsh-content-font-size, 14px);
    line-height: 1.55;
    color: var(--dfc-sheet-ink);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .dfc-compact-hint { margin-top: 8px; color: var(--dfc-sign-foot); font-size: 10px; text-align: right; }
  .dfc-compact-props { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
  .dfc-frame { width: 54px; }
  .dfc-file { width: 68px; height: 46px; }
  .dfc-file-name { font-size: 8px; }
  .dfc-more { font-size: 10px; max-width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  .dfc-thought { animation: none; }
  .dfc-frame, .dfc-file, .dfc-lightbox-close { transition: none; }
  .dfc-workpill__text { animation: none; }
  .dfc-workpill__dot.is-running { animation: none; }
}
`;

    // -------------------------------------------------------------- plugin app
    function makeInject(ctx, sessionId) {
      const sessions = ctx.sessions;
      const uiConversation = ctx.uiConversation;
      let sidebar;
      try {
        sidebar = ctx.get('sidebarRight') ?? ctx.sidebarRight;
      } catch {
        sidebar = ctx.sidebarRight;
      }
      const currentDirectory = () => {
        try {
          const binding = sessions?.binding?.(sessionId);
          const face = binding?.session?.projections?.faceOf?.('workingDirectory');
          return face?.getSnapshot?.() ?? undefined;
        } catch {
          return undefined;
        }
      };
      const cwdOf = () => {
        try {
          return sessions?.list?.getSnapshot?.()?.byId?.[sessionId]?.cwd;
        } catch {
          return undefined;
        }
      };
      const resolvePath = path => resolveWorkspacePath(currentDirectory() ?? cwdOf(), path);

      const openPath = (path, line) => {
        if (typeof path !== 'string' || path === '') return { ok: false, message: 'empty-path' };
        if (sidebar === undefined || typeof sidebar.openResource !== 'function') {
          return { ok: false, message: 'no-sidebar' };
        }
        try {
          const cwd = cwdOf();
          const absolute = resolveWorkspacePath(currentDirectory() ?? cwd, path);
          const address = fileAddressFor(sessionId, cwd, absolute);
          sidebar.openResource(address, line === undefined ? undefined : { params: { line } });
          return { ok: true };
        } catch (error) {
          return { ok: false, message: String(error?.message || error) };
        }
      };

      const loadImages = (items) => {
        const base = new URL('.', document.baseURI).href;
        const jobs = (items || []).map(async (item) => {
          if (item.source === 'attachment') {
            try {
              const url = await uiConversation.imageUrl(sessionId, item.attachment);
              return [resolvePathKey(item), url];
            } catch {
              return null;
            }
          }
          try {
            const absolute = resolvePath(item.path);
            if (!isAbsolutePath(absolute)) return null;
            return [resolvePathKey(item), new URL('api/file?path=' + encodeURIComponent(absolute), base).href];
          } catch {
            return null;
          }
        });
        return Promise.all(jobs).then(entries => {
          const result = {};
          for (const entry of entries) {
            if (entry !== null) result[entry[0]] = entry[1];
          }
          return result;
        });
      };

      const workspace = (() => {
        try { return ctx.get?.('uiWorkspace') ?? undefined; } catch { return undefined; }
      })();
      const forkAt = (seq) => {
        try {
          Promise.resolve(ctx.sessions.fork({
            sessionId,
            atSeq: seq,
            increaseTitle: true,
          }))
            .then((childId) => {
              try { workspace?.openSession?.(childId); } catch { /* best effort */ }
            })
            .catch(() => { /* fork failure leaves this view unchanged */ });
        } catch { /* fork unavailable */ }
      };
      const rateMessage = (messageId, rating) => {
        try {
          const remote = ctx.remote?.messageFeedback;
          if (remote === undefined || typeof remote.put !== 'function') return Promise.resolve(false);
          return Promise.resolve(remote.put({ sessionId, messageId, rating, ifVersion: null }))
            .then(result => (result === undefined ? true : result.ok !== false))
            .catch(() => false);
        } catch {
          return Promise.resolve(false);
        }
      };
      const openAttachment = (item) => {
        if (item === null || item === undefined) return { ok: false, message: 'empty-path' };
        if (typeof item.path === 'string' && item.path !== '') return openPath(item.path, item.line);
        const attachment = item.attachment;
        if (attachment === undefined || attachment === null || attachment.attachmentId === undefined) {
          return { ok: false, message: 'empty-path' };
        }
        if (sidebar === undefined || typeof sidebar.openResource !== 'function') {
          return { ok: false, message: 'no-sidebar' };
        }
        try {
          sidebar.openResource(attachmentAddress(sessionId, attachment, item.label));
          return { ok: true };
        } catch (error) {
          return { ok: false, message: String(error?.message || error) };
        }
      };

      return { openPath, openAttachment, loadImages, forkAt, rateMessage };
    }

    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dafeiyu-counter: locale');
      const t = ctx.locale.bind(NS);

      ctx.effect(() => {
        const style = document.createElement('style');
        style.setAttribute('data-plugin', PKG);
        style.setAttribute('data-plugin-css', PKG + '/styles');
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => style.remove();
      }, 'dafeiyu-counter: styles');

      ctx.effect(() => ctx.uiConversation.views.register({
        target: TARGET,
        create: () => {
          const empty = Object.freeze({ ready: true });
          return {
            empty,
            replace: () => empty,
            apply: () => empty,
          };
        },
      }), 'dafeiyu-counter: conversation view');

      ctx.slots.inject('conversation.view', () => ctx.slots.register({
        name: 'conversation.view',
        id: TARGET,
        order: 20,
        locale: NS,
        label: () => t('view.label'),
        inject: sessionId => makeInject(ctx, sessionId),
      }, CounterView));

      let attachmentTabs;
      try {
        attachmentTabs = ctx.get?.('sidebarRightTabs') ?? ctx.sidebarRightTabs;
      } catch {
        attachmentTabs = undefined;
      }
      if (attachmentTabs !== undefined && attachmentTabs !== null && typeof attachmentTabs.register === 'function') {
        try {
          ctx.effect(() => attachmentTabs.register({
            id: ATTACHMENT_TAB_ID,
            kind: ATTACHMENT_KIND,
            patterns: ['dsh-resource://' + ATTACHMENT_KIND + '/**'],
            canOpen: address => parseAttachmentAddress(address) !== undefined,
            title: (address) => {
              const parsed = parseAttachmentAddress(address);
              return t('attach.title', { name: parsed === undefined ? 'file' : parsed.name });
            },
          }), 'dafeiyu-counter: attachment tab type');
          ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
            name: 'sidebar.right.pane.tab',
            key: ATTACHMENT_TAB_ID,
            locale: NS,
            inject: () => ({ readAttachment: parsed => readAttachmentFor(ctx, parsed) }),
          }, AttachmentTab));
        } catch {
          // The right sidebar is composed out; attachment clicks fall back to the error line.
        }
      }
    }

    return {
      inject: ['slots', 'locale', 'uiConversation', 'sessions', 'remote'],
      apply,
      __test: {
        deriveState,
        latestReply,
        parseMarkdownItems,
        turnInfo,
        runningToolNames,
        fileAddressFor,
        resolveWorkspacePath,
        isAbsolutePath,
        isImagePath,
        stateLabels,
        conversationItems,
        latestReasoning,
        classifyThought,
        renderMarkdown,
        collectToolActivity,
        summarizeTool,
        formatTokenCount,
        attachmentAddress,
        parseAttachmentAddress,
        parseMarkdownImage,
        inlineMarkdown,
      },
    };
  },
});
