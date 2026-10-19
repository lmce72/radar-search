import type {IndexAdapter, IndexDocument, IndexMetadata, IndexFile, IndexConfig, IndexSearchOptions, IndexSearchResponse, SearchHit} from './types.ts';
/* =============================================================================
 * searchIndexEngine.js — 倒排索引 + BM25 排序引擎 / Inverted index + BM25 engine
 * Version: 1.0
 *
 * 用途 / Purpose:
 *   给 PrimeCore 搜索栏提供「一次建索引、每键只算分」的全文检索，取代原先每次按键
 *   cachedRead 全库正文再逐条 includes 的做法（实测 2757 篇 / 1768ms 每键）。
 *   Gives the PrimeCore search bar an indexed full-text search: build once, then score per
 *   keystroke — replacing "cachedRead the whole vault on every keystroke".
 *
 * 算法来源 / Algorithm source:
 *   Omnisearch v1.31.0（scambier）的字段权重与后处理顺序 + MiniSearch 7.x 的 BM25+ 参数。
 *   Field weights and post-processing order from Omnisearch v1.31.0; BM25+ parameters
 *   (k1=1.2, b=0.7, d=0.5) and field-boost composition follow MiniSearch 7.x.
 *
 * 与 Omnisearch 的差异（有意）/ Deliberate deviations:
 *   1) 中文用 bigram 取代分词器依赖 —— 实测本库 200 篇样本里有 15,766 段纯中文长串，
 *      整段成 token 等于搜不到。CJK bigrams instead of an optional segmenter dependency.
 *   2) 内容侧不做 fuzzy —— bigram 上的编辑距离无意义，成本也不可控。
 *      No fuzzy on content; edit distance over bigrams is meaningless.
 *   3) 不落盘：索引只存内存，每次启动后台分块重建。In-memory only, rebuilt per session.
 *   4) 正文不驻留：文档表不保存 content，摘要由宿主对有展示的少数几篇再读一次。
 *      Full text is not retained; the host re-reads the few files it will display.
 *
 * 数据契约（只依赖注入的 adapter，不碰 Obsidian/DOM）/ Contract:
 *   adapter = {
 *     listFiles(): {path, basename, stat:{mtime}}[]
 *     fileFor(path): {path, basename, stat:{mtime}} | null
 *     readText(path): Promise<string>
 *     getMeta(path): {tags:[{tag}], aliases, headings:[{level,heading}], frontmatter} | null
 *     isExcluded(path): boolean
 *   }
 *   引擎纯计算：零 DOM、零 innerHTML、零 Obsidian import。
 *   Pure computation: no DOM, no innerHTML, no Obsidian imports.
 *
 * 已知限制 / Known limitation:
 *   非 BMP 汉字（U+20000 以上）在 UTF-16 里是两个代理项码元，本引擎一律**跳过**含代理项的
 *   bigram，因此这类生僻字不进索引、也搜不到（换取的是索引里没有「半字」噪声）。
 *   Non-BMP Han characters are two surrogate code units in UTF-16; any bigram involving a
 *   surrogate is skipped outright, so such rare characters are neither indexed nor searchable —
 *   the trade keeps half-character noise out of the index.
 * ========================================================================= */
export function createSearchIndexEngine() {
    "use strict";

    const VERSION = "1.0";

    // ─── BM25+ 参数（与 MiniSearch 默认值一致）/ BM25+ params (MiniSearch defaults) ──
    const K1 = 1.2;
    const B = 0.7;
    const D = 0.5;

    // ─── 字段权重（取自 Omnisearch 默认设置）/ Field boosts (Omnisearch defaults) ────
    const FIELD_WEIGHTS = {
        basename: 10, aliases: 10, directory: 7,
        headings1: 6, headings2: 5, headings3: 4,
        tags: 2, content: 1
    };
    // 元数据字段：用于把命中分成「文件名类」与「内容类」两个分组
    const META_FIELDS = ["basename", "aliases", "directory", "headings1", "headings2", "headings3", "tags"];
    const CONTENT_FIELD = "content";
    const ALL_FIELDS = META_FIELDS.concat([CONTENT_FIELD]);

    // ─── 查询与后处理常量 / Query and post-processing constants ──────────────────
    const MIN_PREFIX_LEN = 2;         // 拉丁前缀展开的最短长度 / shortest Latin prefix expanded
    const MAX_PREFIX_TERMS = 64;      // 单个查询词最多展开的词条数 / max expansions per query term
    const MAX_SCAN_POSTINGS = 200000; // 单词条 posting 扫描预算 / per-term posting scan budget
    const PREFIX_WEIGHT = 0.375;      // MiniSearch 前缀权重系数 / MiniSearch prefix weight
    const TITLE_EXACT_BOOST = 100;    // 标题前缀精确命中倍率 / exact title-prefix multiplier
    const TAG_EXACT_BOOST = 100;      // #标签 精确命中倍率 / exact tag multiplier
    const MAX_TOKEN_CHARS = 64;       // 拉丁词条最长字符数，超长视为噪声 / longest Latin token kept
    const TF_CAP = 255;               // 词频上限（打包进 8 位）/ term frequency cap
    const DOC_ID_SHIFT = 8;           // posting 打包：docId << 8 | tf（docId 上限 2^24）
    const MAX_DOCS_PER_SLICE = 500;   // 单次分片最多处理的文档数（状态边界）
    const SLICE_MS = 6;               // 单次分片同步工作时长上限（ms）
    const BIG_FILE = 32 * 1024;       // 超此长度的正文按块 tokenize / chunk large notes
    const BIG_FILE_CHUNK = 32 * 1024;
    const DELTA_MAX_DOCS = 200;       // delta 分片超过此规模即转整体重建

    // ─── 正则 / Regexes ────────────────────────────────────────────────────────
    // CJK：假名 + 扩展A + 基本汉字 + 兼容汉字 + 谚文
    const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿가-힯]/;
    const TOKEN_SPLIT_RE = /[\s\p{P}\p{S}]+/u;
    // 围栏代码块：整体剔除（代码会显著撑大索引）
    const FENCED_CODE_RE = /(^|\n)[ \t]*(?:```|~~~)[\s\S]*?(?:\n[ \t]*(?:```|~~~)[^\n]*|$)/g;
    const BASE64_RE = /data:[^;)]*;base64,[A-Za-z0-9+/=_-]*/g;
    const HASHTAG_RE = /(^|\s)#([^\s#]+)/g;
    const SUR_LO = 0xD800;
    const SUR_HI = 0xDFFF;
    const COMBINING_RE = /[̀-ͯ᪰-᫿᷀-᷿⃐-⃿︠-︯]/g;

    // ─── 小工具 / Utilities ───────────────────────────────────────────────────
    function isCJKChar(code) {
        return (code >= 0x3040 && code <= 0x30FF) || (code >= 0x3400 && code <= 0x4DBF) ||
               (code >= 0x4E00 && code <= 0x9FFF) || (code >= 0xF900 && code <= 0xFAFF) ||
               (code >= 0xAC00 && code <= 0xD7AF);
    }
    function isSurrogate(code) { return code >= SUR_LO && code <= SUR_HI; }
    function hasCJK(s) {
        for (let i = 0; i < s.length; i++) if (isCJKChar(s.charCodeAt(i))) return true;
        return false;
    }
    // 打包中文 bigram：两个 UTF-16 码元 → 32 位无符号整数
    function packBigram(c1, c2) { return (((c1 << 16) | c2) >>> 0); }
    function normalizeText(text) {
        return String(text).normalize("NFD").replace(COMBINING_RE, "").normalize("NFC").toLowerCase();
    }
    function now() {
        return (typeof performance !== "undefined" && performance.now) ? performance.now() : Date.now();
    }
    // 二分：≥ key 的最小下标 / lower bound
    function lowerBound(arr, key, isNum) {
        let lo = 0, hi = arr.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            const v = arr[mid];
            if (isNum ? v < key : v < key) lo = mid + 1; else hi = mid;
        }
        return lo;
    }

    // 可增长 typed buffer：替代「每词条一个小数组」的对象开销
    // Growable typed buffer — avoids one small Array object per term.
    class Grow {
  declare T;
  declare a;
  declare n;

        constructor(Type, cap) { this.T = Type; this.a = new Type(cap || 1024); this.n = 0; }
        push(v) { if (this.n === this.a.length) { const b = new this.T(this.a.length * 2); b.set(this.a); this.a = b; } this.a[this.n++] = v; }
    }

    /* ─────────────────────────────────────────────────────────────────────────
     * posting 池 / posting pool
     *
     * 「链表式」累积：head[termId] 指向该词条 posting 链头，next[p] 串起同词条其它 posting。
     * 于是构建期不需要每个词条一个数组对象，峰值落在 typed array 而不是几十万个装箱对象上。
     * 同一 (词条, 文档) 的连续追加会就地累加词频 —— 这让「大文件按块喂入」与「同文档多段写入」
     * 都只产生一条 posting，df 才等于真实文档数。
     * A linked-list posting accumulator, so the build peak lives in typed arrays instead of one
     * boxed Array per term. Consecutive appends for the same (term, doc) merge in place, so
     * chunked writes still yield exactly one posting per term per document.
     *
     * 词与 bigram 必须各用一个池：bigram 的 termId 若写成「当时的词表长度 + bigramId」，
     * 词表随后继续增长时就会与词的 termId 撞号，posting 串到别的词条上（实测：中文 bigram
     * 命中数从 20 掉到 2、拉丁词凭空多出无关文档）。
     * Words and bigrams MUST use separate pools: deriving a bigram term id from the current word
     * count collides with word ids as the dictionary keeps growing, which silently attaches
     * postings to the wrong term (measured: CJK hits dropped 20 → 2, Latin terms gained
     * unrelated documents).
     * ───────────────────────────────────────────────────────────────────────── */
    class PostingPool {
  declare _head;
  declare _next;
  declare _pDoc;
  declare _pTf;
  declare _headLen;

        constructor() {
            this._head = new Grow(Int32Array, 4096);
            this._next = new Grow(Int32Array, 4096);
            this._pDoc = new Grow(Uint32Array, 4096);
            this._pTf = new Grow(Uint8Array, 4096);
            this._headLen = 0;
        }
        add(termId, docId, tf) {
            while (this._headLen <= termId) { this._head.push(-1); this._headLen++; }
            const h = this._head.a[termId];
            if (h !== -1 && this._pDoc.a[h] === docId) {
                const merged = this._pTf.a[h] + tf;
                this._pTf.a[h] = merged > TF_CAP ? TF_CAP : merged;
                return;
            }
            const p = this._pDoc.n;
            this._pDoc.push(docId);
            this._pTf.push(tf > TF_CAP ? TF_CAP : tf);
            this._next.push(-1);
            this._next.a[p] = h;
            this._head.a[termId] = p;
        }
        release() { this._head = null; this._next = null; this._pDoc = null; this._pTf = null; }
    }

    class FieldBuilder {
  declare _wordIds;
  declare _wordKeys;
  declare _biIds;
  declare _biKeys;
  declare _wordPool;
  declare _biPool;
  declare docLen;
  declare sumLen;

        constructor(docCount) {
            this._wordIds = new Map();
            this._wordKeys = [];
            this._biIds = new Map();
            this._biKeys = [];
            this._wordPool = new PostingPool();
            this._biPool = new PostingPool();
            this.docLen = new Uint32Array(docCount || 0);
            this.sumLen = 0;
        }

        wordIdOf(key) {
            let id = this._wordIds.get(key);
            if (id === undefined) { id = this._wordKeys.length; this._wordIds.set(key, id); this._wordKeys.push(key); }
            return id;
        }
        bigramIdOf(key) {
            let id = this._biIds.get(key);
            if (id === undefined) { id = this._biKeys.length; this._biIds.set(key, id); this._biKeys.push(key); }
            return id;
        }
        addWord(key, docId, tf) { this._wordPool.add(this.wordIdOf(key), docId, tf); }
        addBigram(key, docId, tf) { this._biPool.add(this.bigramIdOf(key), docId, tf); }
        addLength(docId, len) { this.docLen[docId] += len; this.sumLen += len; }

        /** 冻结：词表排序 + posting 压紧成扁平数组 / sort dictionaries, compact postings */
        freeze() {
            const wordCount = this._wordKeys.length;
            const biCount = this._biKeys.length;
            const termCount = wordCount + biCount;
            const wk = this._wordKeys, bk = this._biKeys;

            // 1) 每个词条的 posting 数：走一遍链，不建中间数组
            //    （旧实现为每个词条建一个数组，本库 40 万词条 → 40 万个小对象，既是长任务也是 GC 压力）
            // Count postings per term by walking the chains — no per-term arrays. The previous
            // version built one Array per term; 400k terms here meant 400k small objects, which
            // was both the 205 ms long task and heavy GC pressure.
            const counts = new Uint32Array(termCount);
            const countPool = (pool, n, offset) => {
                for (let t = 0; t < n; t++) {
                    let c = 0, p = t < pool._headLen ? pool._head.a[t] : -1;
                    while (p !== -1) { c++; p = pool._next.a[p]; }
                    counts[offset + t] = c;
                }
            };
            countPool(this._wordPool, wordCount, 0);
            countPool(this._biPool, biCount, wordCount);
            let total = 0;
            for (let i = 0; i < termCount; i++) total += counts[i];

            // 2) 词表排序：直接用**原生排序**，再用 intern Map 反查原始 id。
            //    旧写法把「下标数组 + JS 比较器」排序 —— 35 万个 bigram 要跑约 600 万次回调，
            //    是构建期最大的单个长任务。原生排序在 C++ 里做，随后 35 万次 Map 查找是纳秒级。
            // Sort natively and map back through the intern Map. Sorting an index array with a JS
            // comparator cost roughly 6M callback invocations for 350k bigrams — the single largest
            // long task in the build. The native sort runs in C++, and the 350k Map lookups that
            // follow are nanosecond-scale.
            const wordKeys = this._wordKeys.slice().sort();          // 默认按 UTF-16 码元序，与二分查找的 `<` 同序
            const bigramKeys = Uint32Array.from(this._biKeys).sort(); // 类型化数组默认按数值升序
            const wordOrder = new Array(wordCount);
            for (let i = 0; i < wordCount; i++) wordOrder[i] = this._wordIds.get(wordKeys[i]);
            const biOrder = new Array(biCount);
            for (let i = 0; i < biCount; i++) biOrder[i] = this._biIds.get(bigramKeys[i]);

            // 3) 按排序后顺序求偏移与 df / offsets + df in sorted order
            const termOffset = new Uint32Array(termCount + 1);
            const df = new Uint32Array(termCount);
            let cursor = 0;
            for (let i = 0; i < wordCount; i++) {
                const o = wordOrder[i];
                df[i] = counts[o]; termOffset[i] = cursor; cursor += counts[o];
            }
            for (let i = 0; i < biCount; i++) {
                const o = biOrder[i];
                df[wordCount + i] = counts[wordCount + o];
                termOffset[wordCount + i] = cursor; cursor += counts[wordCount + o];
            }
            termOffset[termCount] = cursor;
            if (cursor !== total) throw new Error(`posting 计数不一致：${cursor} ≠ ${total}`);

            // 4) 第二遍走链，把 posting 直接写进扁平数组 / second walk writes postings in place
            const postings = new Uint32Array(total);
            const fillPool = (pool, n, offset, order) => {
                for (let i = 0; i < n; i++) {
                    const orig = order[i];
                    let p = orig < pool._headLen ? pool._head.a[orig] : -1;
                    let w = termOffset[offset + i];
                    while (p !== -1) {
                        postings[w++] = (((pool._pDoc.a[p] << DOC_ID_SHIFT) | pool._pTf.a[p]) >>> 0);
                        p = pool._next.a[p];
                    }
                }
            };
            fillPool(this._wordPool, wordCount, 0, wordOrder);
            fillPool(this._biPool, biCount, wordCount, biOrder);

            // 5) 释放构建期结构 / release build-time structures
            this._wordIds = null; this._biIds = null; this._wordKeys = null; this._biKeys = null;
            this._wordPool.release(); this._biPool.release();

            return new FieldIndex({ wordKeys, bigramKeys, termOffset, postings, df, docLen: this.docLen, sumLen: this.sumLen, docCount: this.docLen.length });
        }
    }

    /* ─────────────────────────────────────────────────────────────────────────
     * 单字段倒排表（只读）/ Per-field read-only index
     * 词条 id 排列：0..W-1 词、W..W+B-1 bigram —— 与 termOffset/df/postings 同一坐标系。
     * Term ids run words first, then bigrams, in the same coordinate space as termOffset/df.
     * ───────────────────────────────────────────────────────────────────────── */
    class FieldIndex {
  declare wordKeys;
  declare bigramKeys;
  declare termOffset;
  declare postings;
  declare df;
  declare docLen;
  declare sumLen;
  declare docCount;

        constructor(o) {
            this.wordKeys = o.wordKeys;
            this.bigramKeys = o.bigramKeys;
            this.termOffset = o.termOffset;
            this.postings = o.postings;
            this.df = o.df;
            this.docLen = o.docLen;
            this.sumLen = o.sumLen;
            this.docCount = o.docCount;
        }
        get termCount() { return this.df.length; }
        get wordCount() { return this.wordKeys.length; }
        // 真实平均值，不设下限：`|| 1` 会把「全为 0」的字段谎报成 1，与 MiniSearch 不一致
        // The true average, with no floor: an `|| 1` guard would report a legitimately empty field
        // as 1. Callers guard the divisor themselves.
        get avgLen() { return this.docCount > 0 ? this.sumLen / this.docCount : 0; }
        lookupWord(key) {
            const i = lowerBound(this.wordKeys, key, false);
            return (i < this.wordKeys.length && this.wordKeys[i] === key) ? i : -1;
        }
        lookupBigram(key) {
            const i = lowerBound(this.bigramKeys, key, true);
            return (i < this.bigramKeys.length && this.bigramKeys[i] === key) ? this.wordCount + i : -1;
        }
        /** 拉丁前缀 → 排序词表区间 [from,to) / Latin prefix range */
        prefixRange(prefix) {
            return [lowerBound(this.wordKeys, prefix, false), lowerBound(this.wordKeys, prefix + "￿", false)];
        }
        /** 中文首字 → bigram 区间（即中文的前缀搜索）/ CJK first-code unit range */
        bigramFirstCodeRange(code) {
            const lo = packBigram(code, 0), hi = packBigram(code, 0xFFFF);
            return [lowerBound(this.bigramKeys, lo, true), lowerBound(this.bigramKeys, hi + 1, true)];
        }
        /** 词条 id → 是否属于词表（否则为 bigram）/ whether a term id belongs to the word list */
        isWordTerm(termIndex) { return termIndex < this.wordCount; }
    }

    /* ─────────────────────────────────────────────────────────────────────────
     * 搜索引擎 / Search engine（单例）/ singleton
     * ───────────────────────────────────────────────────────────────────────── */
    class SearchIndexEngine {
  declare VERSION;
  declare _debug;
  declare _app;
  declare _adapter:IndexAdapter;
  declare _cfg:import("../types.ts").IndexSettings;
  declare _state;
  declare _progress;
  declare _fields;
  declare _docs:IndexDocument[];
  declare _pathToId:Map<string,number>;
  declare _removed:Set<number>;
  declare _delta;
  declare _reindexQueue:Set<string>;
  declare _refCount;
  declare _unsubs:(()=>void)[];
  declare _buildToken;
  declare _pauseHook:(()=>boolean)|null;
  declare _progressHandlers;
  declare _stats;

        constructor() {
            this.VERSION = VERSION;

            this._debug = false;
            this._app = null;
            this._adapter = null;
            this._cfg = { enabled: true, content: true, bigrams: true, debug: false };

            this._state = "idle";        // idle | building | ready | degraded
            this._progress = { done: 0, total: 0, ratio: 0, phase: "idle" };

            this._fields = new Map();    // field → FieldIndex
            this._docs = [];             // docId → {path,basename,directory,mtime,tags,aliases,...}（不含正文）
            this._pathToId = new Map();
            this._removed = new Set();   // 被删除 / 被 delta 取代的 docId

            // delta 分片：以 path → 最新文档 的形式保存，查询时与主索引合并
            // Delta shard: latest doc per path, merged into results at query time.
            this._delta = null;          // { fields:Map, docs:Map<path,doc>, order:[] }

            this._reindexQueue = new Set();
            this._refCount = 0;
            this._unsubs = [];
            this._buildToken = 0;
            this._pauseHook = null;
            this._progressHandlers = [];
            this._stats = { buildMs: 0, lastQueryMs: 0, docs: 0, terms: 0, postings: 0 };
        }

        // ── 日志（一律有开关）/ logging, always behind a switch ───────────────
        setDebug(on) { this._debug = !!on; }
        _log(..._args:unknown[]) { if (this._debug) { try { console.log("[SearchIndex]", ...arguments); } catch (e) { /* 日志失败不得影响调用方 */ } } }
        _warn(..._args:unknown[]) { if (!this._debug) return; try { console.warn("[SearchIndex]", ...arguments); } catch (e) { /* ignore */ } }

        get state() { return this._state; }
        get progress() { return Object.assign({}, this._progress); }
        get stats() { return Object.assign({}, this._stats); }
        onProgress(fn) { if (typeof fn === "function") this._progressHandlers.push(fn); }
        offProgress(fn) { const i = this._progressHandlers.indexOf(fn); if (i >= 0) this._progressHandlers.splice(i, 1); }
        _emitProgress() { for (const fn of this._progressHandlers) { try { fn(this.progress); } catch (e) { this._warn("progress 回调抛错:", e); } } }

        /** 配置注入（幂等）；只影响后续构建 / idempotent config injection */
        setConfig(partial:IndexConfig) {
            if (!partial || typeof partial !== "object") return this._cfg;
            Object.assign(this._cfg, partial);
            if (partial.debug !== undefined) this.setDebug(partial.debug);
            return this._cfg;
        }

        /** 宿主注入 app（用于订阅 vault 事件）；引擎其余部分只认 adapter */
        attachApp(app) { this._app = app; this._subscribe(); return this; }

        /** 初始化：注入 adapter、订阅事件、启动后台构建（幂等）/ init (idempotent) */
        async init(adapter:IndexAdapter, cfg:IndexConfig={}) {
            if (cfg) this.setConfig(cfg);
            if (!adapter) throw new Error("init 需要 adapter");
            this._adapter = adapter;
            this._subscribe();
            if (this._state === "idle" && this._cfg.enabled !== false) await this._startBuild();
            return this;
        }

        retain() { this._refCount++; return this._refCount; }
        release() {
            this._refCount = Math.max(0, this._refCount - 1);
            if (this._refCount === 0) this.dispose();
            return this._refCount;
        }
        dispose() {
            this._buildToken++;
            for (const un of this._unsubs) { try { un(); } catch (e) { this._warn("注销监听失败:", e); } }
            this._unsubs = [];
            this._fields = new Map();
            this._docs = [];
            this._pathToId = new Map();
            this._removed = new Set();
            this._delta = null;
            this._reindexQueue.clear();
            this._state = "idle";
            this._progress = { done: 0, total: 0, ratio: 0, phase: "idle" };
        }

        /** 构建期让路钩子：返回 true 表示「现在别干活」/ pause hook */
        setPauseHook(fn) { this._pauseHook = typeof fn === "function" ? fn : null; }
        _shouldPause() { try { return this._pauseHook ? !!this._pauseHook() : false; } catch (e) { this._warn("pause hook 抛错:", e); return false; } }
        /**
         * 让出主线程。**不用 requestIdleCallback**：它带 timeout 时在忙渲染器上会一直等到超时，
         * 每批一次就把构建从 ~3s 拖到 18.6s（实测）。宏任务 setTimeout(0) 已足以让输入与滚动
         * 处理器先跑（浏览器在宏任务之间处理输入），代价是 ~1ms。
         * Yield with a macrotask. requestIdleCallback is deliberately NOT used: with a timeout it
         * waits until that timeout whenever the renderer is busy, which stretched the build from
         * ~3s to 18.6s (measured) at one yield per batch. setTimeout(0) already lets input and
         * scroll handlers run, for about a millisecond.
         */
        async _yield() {
            await new Promise(r => setTimeout(r, 0));
            if (this._shouldPause()) await new Promise(r => setTimeout(r, 0));
        }

        // ── vault 事件订阅 / vault event subscription ────────────────────────
        _subscribe() {
            if (this._unsubs.length || !this._app) return;
            const app = this._app;
            if (!app.vault || typeof app.vault.on !== "function") return;
            const reg = (name, fn) => {
                try { const ref = app.vault.on(name, fn); this._unsubs.push(() => app.vault.offref(ref)); }
                catch (e) { this._warn(`订阅 vault.${name} 失败:`, e); }
            };
            reg("modify", (f) => { if (f && f.path) this.queueReindex([f.path]); });
            reg("create", (f) => { if (f && f.path) this.addPaths([f.path]).catch(e => this._warn("create 增量失败:", e)); });
            reg("delete", (f) => { if (f && f.path) this.removePaths([f.path]); });
            reg("rename", (f, oldPath) => {
                if (oldPath) this.removePaths([oldPath]);
                if (f && f.path) this.addPaths([f.path]).catch(e => this._warn("rename 增量失败:", e));
            });
            this._log("已订阅 vault 事件");
        }

        // ── 分词 / tokenization ──────────────────────────────────────────────
        /**
         * 索引侧分词 → { words: Map<string,tf>, bigrams: Map<number,tf> }
         * 中文连续串只产出 bigram（无单字、无整段）；拉丁词条小写后整词收录。
         * CJK runs emit bigrams only; Latin tokens are lowercased and kept whole.
         */
        _tokenizeForIndex(text, useBigrams) {
            const words = new Map();
            const bigrams = useBigrams ? new Map() : null;
            if (!text) return { words, bigrams };

            let t = String(text);
            if (t.indexOf("data:") !== -1) t = t.replace(BASE64_RE, " ");
            if (t.indexOf("```") !== -1 || t.indexOf("~~~") !== -1) t = t.replace(FENCED_CODE_RE, " ");
            t = normalizeText(t);

            const parts = t.split(TOKEN_SPLIT_RE);
            for (let i = 0; i < parts.length; i++) {
                const tok = parts[i];
                if (!tok) continue;
                if (hasCJK(tok)) {
                    if (!bigrams) continue;
                    for (let k = 0; k + 1 < tok.length; k++) {
                        const c1 = tok.charCodeAt(k), c2 = tok.charCodeAt(k + 1);
                        if (isSurrogate(c1) || isSurrogate(c2)) continue;
                        const key = packBigram(c1, c2);
                        bigrams.set(key, (bigrams.get(key) || 0) + 1);
                    }
                } else if (tok.length <= MAX_TOKEN_CHARS) {
                    words.set(tok, (words.get(tok) || 0) + 1);
                }
            }
            return { words, bigrams };
        }

        /**
         * 查询侧分词 → 组（组内 AND、组间 OR）
         * 组A = 标点/空格切词；组C = 组A 再按连字符切分（两者都保留，与 Omnisearch 一致）。
         * #标签 从原文先行提取（'#' 属标点，切词后会丢失）。
         * loose=true 时改为宽松模式：中文 bigram 各自成组（组间 OR），用于严格模式零命中时的
         * 召回兜底 —— 中文短语要求「逐字相邻」，用户把多个词连写（如「日记系统」）时严格模式
         * 会因「记系」这一不存在的 bigram 而全空。Queries are AND inside a group and OR across
         * groups. In loose mode each CJK bigram becomes its own group, which backs the recall
         * fallback: a CJK phrase demands character adjacency, so a run-on multi-word query
         * ("日记系统") would otherwise return nothing because "记系" never occurs.
         */
        _tokenizeQuery(raw, useBigrams, loose) {
            const rawStr = String(raw == null ? "" : raw);
            const tags = [];
            let m;
            HASHTAG_RE.lastIndex = 0;
            while ((m = HASHTAG_RE.exec(rawStr)) !== null) { if (m[2]) tags.push(m[2].toLowerCase()); }

            const norm = normalizeText(rawStr).trim();
            if (!norm) return { groups: [], tokens: [], tags, raw: norm, loose: !!loose };

            const termFor = (tok) => {
                if (!tok) return null;
                if (hasCJK(tok)) {
                    if (!useBigrams) return null;
                    if (tok.length === 1) return { type: "cjkFirst", key: tok.charCodeAt(0), text: tok };
                    const list = [];
                    for (let k = 0; k + 1 < tok.length; k++) {
                        const c1 = tok.charCodeAt(k), c2 = tok.charCodeAt(k + 1);
                        if (isSurrogate(c1) || isSurrogate(c2)) continue;
                        list.push({ type: "bigram", key: packBigram(c1, c2), text: tok });
                    }
                    return list.length ? { type: "cjkMulti", terms: list, text: tok } : null;
                }
                return tok.length <= MAX_TOKEN_CHARS ? { type: "word", key: tok, text: tok } : null;
            };

            /** 严格：token 集整体一个 AND 组；宽松：拉丁词合成一个 AND 组，中文 bigram 各自成组 */
            const groupsFor = (tokens) => {
                const all = [], latin = [], cjkSingletons = [];
                for (const tok of tokens) {
                    const t = termFor(tok);
                    if (!t) continue;
                    if (t.type === "cjkMulti") {
                        for (const one of t.terms) { all.push(one); cjkSingletons.push([one]); }
                    } else {
                        all.push(t);
                        if (t.type === "word") latin.push(t); else cjkSingletons.push([t]);
                    }
                }
                if (!loose) return all.length ? [all] : [];
                const out = [];
                if (latin.length) out.push(latin);
                for (const g of cjkSingletons) out.push(g);
                return out;
            };

            const splitTokens = norm.split(TOKEN_SPLIT_RE).filter(Boolean);
            const groups = groupsFor(splitTokens);
            // 组C：连字符再切分。必须从「按空白切」的原始词出发 —— 标点切分已经把连字符吃掉，
            // 若从 splitTokens 出发，组C 会与组A 完全同构，等于把每个文档的分数整体翻倍（白做功）。
            // Group C re-splits on hyphens and must start from whitespace-split tokens: the
            // punctuation splitter already removes hyphens, so deriving group C from splitTokens
            // would make it identical to group A and silently double every score.
            const rawTokens = norm.split(/\s+/).filter(Boolean);
            if (rawTokens.some(t => t.indexOf("-") !== -1)) {
                const hy = [];
                for (const t of rawTokens) { if (t.indexOf("-") !== -1) hy.push(...t.split("-").filter(Boolean)); else hy.push(t); }
                const extra = groupsFor(hy);
                const key = (gs) => JSON.stringify(gs.map(g => g.map(t => t.key !== undefined ? t.key : t.terms.map(x => x.key))));
                if (extra.length && key(extra) !== key(groups)) groups.push(...extra);
            }
            return { groups, tokens: splitTokens, tags, raw: norm, loose: !!loose };
        }

        // ── 文档抽取 / document extraction ───────────────────────────────────
        _extractDoc(file:IndexFile, meta:IndexMetadata, text:string):IndexDocument {
            const path = file.path;
            const idx = path.lastIndexOf("/");
            const basename = file.basename || path.slice(idx + 1).replace(/\.[^.]+$/, "");
            const directory = idx > 0 ? path.slice(0, idx) : "";

            // 标签：frontmatter 的 tags/tag + 正文标签（cache.tags 不含 frontmatter，须合并）
            const tags = [];
            if (meta) {
                const fm = meta.frontmatter || {};
                const pushTag = (v) => {
                    if (v === null || v === undefined) return;
                    const arr = Array.isArray(v) ? v : [v];
                    for (const one of arr) { const s = String(one).trim().replace(/^#/, ""); if (s) tags.push(s); }
                };
                pushTag(fm.tags); pushTag(fm.tag);
                if (Array.isArray(meta.tags)) for (const t of meta.tags) { if (t && t.tag) tags.push(String(t.tag).replace(/^#/, "")); }
            }
            const aliases = [];
            if (meta && meta.aliases) { const arr = Array.isArray(meta.aliases) ? meta.aliases : [meta.aliases]; for (const a of arr) if (a) aliases.push(String(a)); }

            const h1 = [], h2 = [], h3 = [];
            if (meta && Array.isArray(meta.headings)) {
                for (const h of meta.headings) {
                    if (!h || !h.heading) continue;
                    if (h.level === 1) h1.push(h.heading);
                    else if (h.level === 2) h2.push(h.heading);
                    else if (h.level === 3) h3.push(h.heading);
                }
            }

            return {
                path, basename, directory,
                mtime: (file.stat && file.stat.mtime) || 0,
                aliases, tags,
                // 索引用的标签文本：数组直接进分词器会变成 "a,b" 这种伪词条
                // Tag text for indexing — passing the raw array would tokenize as "a,b".
                tagsText: tags.join(" "),
                aliasesText: aliases.join(" "),
                headings1: h1.join(" "), headings2: h2.join(" "), headings3: h3.join(" "),
                content: text || ""
            };
        }

        /**
         * 把一个字段的分词结果写进构建器。
         * 字段长度取「去重后的词条数」而非出现次数 —— MiniSearch 的 fieldLength 是
         * `new Set(tokens).size`，BM25 的长度归一化依赖它；用出现次数会让长度偏大、
         * 分数整体漂移（实测 3% 量级）。词频仍按真实出现次数记录。
         * Write one field's tokens into the builders. The field length is the number of UNIQUE
         * terms, not occurrences: MiniSearch's fieldLength is `new Set(tokens).size` and BM25's
         * length normalisation depends on it (using occurrences shifted every score by ~3%).
         * Term frequencies still record true occurrence counts.
         */
        _flushTokens(builders, docId, field, words, bigrams) {
            const b = builders[field];
            if (!b) return;
            const len = words.size + (bigrams ? bigrams.size : 0);
            for (const [key, tf] of words) b.addWord(key, docId, tf);
            if (bigrams) for (const [key, tf] of bigrams) b.addBigram(key, docId, tf);
            if (len) b.addLength(docId, len);
        }

        /** 把一篇文档的某些字段写进构建器 / write selected fields of one doc into builders */
        _indexFields(builders, docId, doc, useBigrams, onlyFields) {
            const fields = onlyFields || Object.keys(builders);
            for (const field of fields) {
                // 数组型字段（tags/aliases）走各自的文本形态 / array-valued fields use their text form
                const text = field === "tags" ? doc.tagsText : (field === "aliases" ? (doc.aliasesText || doc.aliases) : doc[field]);
                if (!text) continue;
                const t = this._tokenizeForIndex(text, useBigrams);
                this._flushTokens(builders, docId, field, t.words, t.bigrams);
            }
        }

        _newBuilders(fieldList, docCount) {
            const b = {};
            for (const f of fieldList) b[f] = new FieldBuilder(docCount);
            return b;
        }
        _enabledFields() {
            const fields = META_FIELDS.slice();
            if (this._cfg.content !== false) fields.push(CONTENT_FIELD);
            return fields;
        }

        // ── 构建 / build ─────────────────────────────────────────────────────
        async _startBuild() {
            const token = ++this._buildToken;
            this._state = "building";
            const t0 = now();
            try {
                const files = (this._adapter.listFiles() || []).filter(f => f && f.path);
                const useBigrams = this._cfg.bigrams !== false;
                const fieldList = this._enabledFields();
                const builders = this._newBuilders(fieldList, files.length);

                // 先占位，保证 docId 与文件下标一致（跳过的文件留空槽）
                this._docs = new Array(files.length);
                this._pathToId = new Map();
                this._removed = new Set();
                this._delta = null;

                this._progress = { done: 0, total: files.length, ratio: 0, phase: "reading" };
                this._emitProgress();

                let sliceStart = now(), inSlice = 0;
                // 批量并发读取：逐个 await cachedRead 会把构建拖成几十秒（实测 4107 篇 24.5s），
                // 每批并发 24 个再串行入库，批间让出主线程，构建降到秒级且仍不阻塞输入。
                // Read in batches: awaiting cachedRead one file at a time stretched the build to
                // 24.5s over 4107 files. 24 concurrent reads per batch, indexed serially, with a
                // yield between batches, brings this to seconds without blocking typing.
                const READ_BATCH = 16;   // 单批同步工作≈8ms（24 时约 13ms，略超长任务阈值）
                for (let base = 0; base < files.length; base += READ_BATCH) {
                    if (token !== this._buildToken) return;
                    const batch = files.slice(base, base + READ_BATCH);
                    const loaded = await Promise.all(batch.map(async (file, k) => {
                        const idx = base + k;
                        let excluded = false;
                        try { excluded = !!(this._adapter.isExcluded && this._adapter.isExcluded(file.path)); }
                        catch (e) { this._warn(`isExcluded 抛错 ${file.path}:`, e); }
                        if (excluded) return { idx, excluded: true };
                        let text = "", meta = null;
                        try { text = await this._adapter.readText(file.path); }
                        catch (e) { this._warn(`读取失败，跳过 ${file.path}:`, e); }
                        try { meta = this._adapter.getMeta ? this._adapter.getMeta(file.path) : null; }
                        catch (e) { this._warn(`元数据读取失败 ${file.path}:`, e); }
                        return { idx, file, text, meta };
                    }));
                    if (token !== this._buildToken) return;

                    for (const item of loaded) {
                        if (item.excluded) { this._removed.add(item.idx); continue; }
                        const i = item.idx, file = item.file, text = item.text;
                        const doc = this._extractDoc(file, item.meta, text);
                        this._docs[i] = doc;
                        this._pathToId.set(doc.path, i);

                        if (text && text.length > BIG_FILE && this._cfg.content !== false) {
                            // 长文：按块分词，块间让出主线程；词频与「去重词条数」在整篇范围内合并，
                            // 否则分块会把同一词条重复计入字段长度。Large notes are tokenized in
                            // slices (yielding between them) but merged per document first, so
                            // neither term frequency nor the unique-term length is counted twice.
                            const accWords = new Map(), accBigrams = useBigrams ? new Map() : null;
                            for (let c = 0; c < text.length; c += BIG_FILE_CHUNK) {
                                const t = this._tokenizeForIndex(text.substr(c, BIG_FILE_CHUNK), useBigrams);
                                for (const [k2, v] of t.words) accWords.set(k2, (accWords.get(k2) || 0) + v);
                                if (accBigrams && t.bigrams) for (const [k2, v] of t.bigrams) accBigrams.set(k2, (accBigrams.get(k2) || 0) + v);
                                if (token !== this._buildToken) return;
                                await this._yield();
                            }
                            this._flushTokens(builders, i, CONTENT_FIELD, accWords, accBigrams);
                            this._indexFields(builders, i, doc, useBigrams, META_FIELDS);
                        } else {
                            this._indexFields(builders, i, doc, useBigrams, null);
                        }
                        // 正文不驻留：摘要是由宿主对有展示的少数几篇再读一次
                        // Full text is not retained — the host re-reads the few files it displays.
                        doc.content = "";
                    }

                    inSlice += batch.length;
                    if (now() - sliceStart > SLICE_MS || inSlice >= MAX_DOCS_PER_SLICE) {
                        this._progress = { done: Math.min(base + READ_BATCH, files.length), total: files.length, ratio: Math.min(1, (base + READ_BATCH) / files.length), phase: "reading" };
                        this._emitProgress();
                        await this._yield();
                        inSlice = 0; sliceStart = now();
                    }
                }

                if (token !== this._buildToken) return;
                this._progress = { done: files.length, total: files.length, ratio: 1, phase: "indexing" };
                this._emitProgress();
                await this._yield();

                const frozen = new Map();
                for (const field of fieldList) {
                    if (token !== this._buildToken) return;
                    frozen.set(field, builders[field].freeze());
                    await this._yield();
                }
                if (token !== this._buildToken) return;

                this._fields = frozen;
                this._state = "ready";
                this._stats.buildMs = Math.round(now() - t0);
                this._stats.docs = this._docs.length;
                let terms = 0, postings = 0;
                for (const f of this._fields.values()) { terms += f.termCount; postings += f.postings.length; }
                this._stats.terms = terms; this._stats.postings = postings;
                this._progress = { done: files.length, total: files.length, ratio: 1, phase: "ready" };
                this._emitProgress();
                this._log(`索引完成：${this._stats.docs} 篇 / ${terms} 词条 / ${postings} postings / ${this._stats.buildMs}ms`);
            } catch (e) {
                this._state = "degraded";
                this._warn("索引构建失败，宿主应回落旧路径:", e);
            }
        }
        async rebuild() { return this._startBuild(); }

        // ── 增量维护 / incremental maintenance ───────────────────────────────
        /** modify → 只入队（打字期间不重建）/ queue only, never rebuild mid-typing */
        queueReindex(paths) { for (const p of paths) if (p) this._reindexQueue.add(p); }
        get pendingReindex() { return this._reindexQueue.size; }

        async flushReindex() {
            if (!this._reindexQueue.size) return;
            const paths = [...this._reindexQueue];
            this._reindexQueue.clear();
            await this._applyDelta(paths);
        }
        async addPaths(paths) { return this._applyDelta(paths); }

        removePaths(paths) {
            for (const p of paths) {
                const id = this._pathToId.get(p);
                if (id !== undefined && this._docs[id]) { this._removed.add(id); this._pathToId.delete(p); }
                if (this._delta && this._delta.docs.has(p)) this._delta.docs.delete(p);
                this._reindexQueue.delete(p);
            }
            if (this._delta) this._rebuildDelta();
        }

        /** 重新读取这些路径并写入 delta 分片 / re-read paths into the delta shard */
        async _applyDelta(paths) {
            if (!this._adapter || this._state === "idle") return;
            const token=this._buildToken;
            if (!this._delta) this._delta = { fields: new Map(), docs: new Map() };
            for (const p of paths) {
                const file = this._adapter.fileFor ? this._adapter.fileFor(p) : null;
                if (!file) { this.removePaths([p]); continue; }
                let text = "", meta = null;
                try { text = await this._adapter.readText(p); } catch (e) { this._warn(`增量读取失败 ${p}:`, e); continue; }
                try { meta = this._adapter.getMeta ? this._adapter.getMeta(p) : null; } catch (e) { this._warn(`增量元数据失败 ${p}:`, e); }
                if(token!==this._buildToken||this._state==='idle')return;
                const doc = this._extractDoc(file, meta, text);
                this._delta.docs.set(p, doc);
                const oldId = this._pathToId.get(p);
                if (oldId !== undefined) this._removed.add(oldId);   // 主索引里的旧版本作废
            }
            this._rebuildDelta();
            const live = this._delta.docs.size;
            if (live > DELTA_MAX_DOCS) {
                this._log(`delta 达 ${live} 篇，转后台完整重建`);
                this._delta = null;
                setTimeout(() => { this.rebuild().catch(e => this._warn("重建失败:", e)); }, 0);
            }
        }

        /** delta 分片整体重建（文档数很小，代价可忽略）/ rebuild the tiny delta shard */
        _rebuildDelta() {
            if (!this._delta) return;
            const docs = [...this._delta.docs.values()];
            if (!docs.length) { this._delta.fields = new Map(); return; }
            const useBigrams = this._cfg.bigrams !== false;
            const fieldList = this._enabledFields();
            const builders = this._newBuilders(fieldList, docs.length);
            for (let i = 0; i < docs.length; i++) {
                // Keep token counts, not full bodies, so later delta rebuilds retain earlier notes.
                const doc=docs[i];
                if(!doc.contentTokens)doc.contentTokens=this._tokenizeForIndex(doc.content,useBigrams);
                this._indexFields(builders,i,doc,useBigrams,fieldList.filter(field=>field!==CONTENT_FIELD));
                if(fieldList.includes(CONTENT_FIELD))this._flushTokens(builders,i,CONTENT_FIELD,doc.contentTokens.words,doc.contentTokens.bigrams);
                docs[i].content = "";   // 正文不驻留 / do not retain full text
            }
            const frozen = new Map();
            for (const f of fieldList) frozen.set(f, builders[f].freeze());
            this._delta.fields = frozen;
        }

        // ── 打分 / scoring ───────────────────────────────────────────────────
        /**
         * 对一组字段索引打分，返回按 docId 的累计分。
         * 组内 AND 用位掩码判定：一个文档必须命中组内**每一个**查询词才算命中该组；
         * 组间 OR 用求和合并（与 MiniSearch 的 combineWith 语义一致）。
         * Score one set of field indexes. AND inside a group is enforced with a per-token bitmask
         * (a doc must match every token of the group); groups combine by summing scores, matching
         * MiniSearch's combineWith semantics.
         * @returns {{name:Float32Array, content:Float32Array, hits:number[]}}
         */
        _scoreFields(fields, docCount, q, removed, idfN, prefixEnabled) {
            const name = new Float32Array(docCount);
            const content = new Float32Array(docCount);
            const groupName = new Float32Array(docCount);
            const groupContent = new Float32Array(docCount);
            const mask = new Uint32Array(docCount);
            const hits = [];
            const seen = new Uint8Array(docCount);
            const N = idfN || (fields.get(CONTENT_FIELD) || fields.get(META_FIELDS[0]) || { docCount }).docCount || 1;

            for (const group of q.groups) {
                if (!group.length || group.length > 31) continue;
                const fullMask = (1 << group.length) - 1;
                const touched = [];

                for (let ti = 0; ti < group.length; ti++) {
                    const isLast = (ti === group.length - 1) && prefixEnabled !== false;
                    const bit = 1 << ti;
                    for (const [field, fi] of fields) {
                        const weight = FIELD_WEIGHTS[field] || 1;
                        const avg = fi.avgLen || 1;   // 空字段不会命中，这里只防除零 / divisor guard
                        const isMeta = META_FIELDS.indexOf(field) !== -1;
                        let budget = MAX_SCAN_POSTINGS;

                        const applyTerm = (termIndex, termWeight) => {
                            if (termIndex < 0) return;
                            const df = fi.df[termIndex];
                            if (!df) return;
                            const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
                            const from = fi.termOffset[termIndex], to = fi.termOffset[termIndex + 1];
                            budget -= (to - from);
                            for (let p = from; p < to; p++) {
                                const packed = fi.postings[p];
                                const docId = packed >>> DOC_ID_SHIFT;
                                if (docId >= docCount || removed.has(docId)) continue;
                                const tf = packed & 0xFF;
                                const len = fi.docLen[docId] || 1;
                                const s = idf * (D + (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (len / avg)))) * weight * termWeight;
                                if (isMeta) groupName[docId] += s; else groupContent[docId] += s;
                                if ((mask[docId] & bit) === 0) {
                                    if (mask[docId] === 0) touched.push(docId);
                                    mask[docId] |= bit;
                                }
                            }
                        };

                        for (const term of this._expandTerm(fi, group[ti], isLast)) {
                            if (budget <= 0) break;
                            applyTerm(term.termIndex, term.weight);
                        }
                    }
                }

                // 组内 AND 判定 → 并入总分 / enforce the AND, then fold into the totals
                for (const docId of touched) {
                    if ((mask[docId] & fullMask) === fullMask) {
                        name[docId] += groupName[docId];
                        content[docId] += groupContent[docId];
                        if (!seen[docId]) { seen[docId] = 1; hits.push(docId); }
                    }
                    mask[docId] = 0; groupName[docId] = 0; groupContent[docId] = 0;   // 复位供下一组复用
                }
            }
            return { name, content, hits };
        }

        /**
         * 单词条展开：精确命中 + （仅组内最后一个词的）前缀/中文首字区间展开
         * Expand one query term: exact, plus prefix (last token of a group only) and the CJK
         * first-code-unit range, which is this engine's equivalent of a CJK prefix search.
         */
        _expandTerm(fi, term, isLast) {
            const out = [];
            if (!term) return out;
            if (term.type === "word") {
                const exact = fi.lookupWord(term.key);
                if (exact >= 0) out.push({ termIndex: exact, weight: 1 });
                if (isLast && term.key.length >= MIN_PREFIX_LEN) {
                    const [from, to] = fi.prefixRange(term.key);
                    const cap = Math.min(to, from + MAX_PREFIX_TERMS);
                    for (let i = from; i < cap; i++) {
                        if (i === exact) continue;
                        const extra = fi.wordKeys[i].length - term.key.length;
                        out.push({ termIndex: i, weight: PREFIX_WEIGHT * term.key.length / (term.key.length + 0.3 * Math.max(0, extra)) });
                    }
                }
            } else if (term.type === "bigram") {
                const idx = fi.lookupBigram(term.key);
                if (idx >= 0) out.push({ termIndex: idx, weight: 1 });
            } else if (term.type === "cjkFirst") {
                const [from, to] = fi.bigramFirstCodeRange(term.key);
                const cap = Math.min(to, from + MAX_PREFIX_TERMS);
                for (let i = from; i < cap; i++) out.push({ termIndex: fi.wordCount + i, weight: 1 });
            }
            return out;
        }

        // ── 查询 / search ───────────────────────────────────────────────────
        /**
         * 打分并汇总成结果行（主索引 + delta 分片）/ score base and delta shards into result rows
         */
        _collect(q, prefixEnabled):SearchHit[] {
            const n = this._docs.length;
            const corpusSize=n+(this._delta?.docs.size||0);
            const base = this._scoreFields(this._fields, n, q, this._removed, corpusSize, prefixEnabled);
            const results = [];
            for (const docId of base.hits) {
                const total = base.name[docId] + base.content[docId];
                if (total <= 0) continue;
                const d = this._docs[docId];
                if (!d) continue;
                results.push({ path: d.path, basename: d.basename, mtime: d.mtime, tags: d.tags, score: total, nameScore: base.name[docId], contentScore: base.content[docId] });
            }
            // Use a shared population at least as large as either shard's document frequency.
            if (this._delta && this._delta.fields.size && this._delta.docs.size) {
                const docs = [...this._delta.docs.values()];
                const dres = this._scoreFields(this._delta.fields, docs.length, q, new Set(), corpusSize, prefixEnabled);
                for (const docId of dres.hits) {
                    const total = dres.name[docId] + dres.content[docId];
                    if (total <= 0) continue;
                    const d = docs[docId];
                    if (!d) continue;
                    results.push({ path: d.path, basename: d.basename, mtime: d.mtime, tags: d.tags, score: total, nameScore: dres.name[docId], contentScore: dres.content[docId], isDelta: true });
                }
            }
            return results;
        }

        /**
         * 同步查询（纯计算、无 I/O）/ synchronous, I/O-free search.
         * 严格模式零命中且查询含中文时，用宽松模式（中文 bigram 各自成组）再试一次作为召回兜底。
         * When the strict pass finds nothing and the query contains CJK, one loose pass runs as a
         * recall fallback (each CJK bigram becomes its own OR group).
         * @returns {{ready:boolean, results:Array, queryMs?:number, fallback?:boolean}}
         */
        search(rawQuery:string, opts:IndexSearchOptions={}):IndexSearchResponse {
            const o = Object.assign({ limit: 60, nameLimit: 30, contentLimit: 60 }, opts || {});
            if (this._state !== "ready") return { ready: false, results: [] };
            if (!rawQuery || !String(rawQuery).trim()) return { ready: true, results: [] };

            const t0 = now();
            const useBigrams = this._cfg.bigrams !== false;
            const prefixEnabled = o.prefix !== false;
            const q = this._tokenizeQuery(rawQuery, useBigrams, false);
            if (!q.groups.length) return { ready: true, results: [] };

            let results = this._collect(q, prefixEnabled);
            let fallback = false;
            if (!results.length && o.looseFallback !== false && q.tokens.some(hasCJK)) {
                const qLoose = this._tokenizeQuery(rawQuery, useBigrams, true);
                if (qLoose.groups.length) {
                    results = this._collect(qLoose, prefixEnabled);
                    fallback = results.length > 0;
                }
            }
            if (!results.length) return { ready: true, results: [], queryMs: Math.round((now() - t0) * 100) / 100, total: 0 };

            // 后处理：标题前缀精确命中 ×100；#标签 精确命中 ×100（与 Omnisearch 一致）
            const titleNeedle = q.tokens.join(" ").trim();
            for (const r of results) {
                if (titleNeedle && r.basename && normalizeText(r.basename).startsWith(titleNeedle)) r.score *= TITLE_EXACT_BOOST;
                if (q.tags.length && r.tags) {
                    for (const t of q.tags) { if (r.tags.indexOf(t) !== -1) { r.score *= TAG_EXACT_BOOST; break; } }
                }
                r.isNameMatch = r.nameScore > 0;
                r.isContentMatch = r.contentScore > 0;
            }
            results.sort((a, b) => b.score - a.score);
            // 分数不在此处取整：取整会把相差不到 0.001 的文档顺序颠倒，也让分数失去可比性
            // Scores are NOT rounded here: rounding reorders documents that differ by <0.001 and
            // makes the values incomparable. Presentation is the host's business.
            const top = results.slice(0, o.limit);
            this._stats.lastQueryMs = Math.round((now() - t0) * 100) / 100;
            this._stats.fallback = fallback;
            return { ready: true, results: top, queryMs: this._stats.lastQueryMs, total: results.length, fallback };
        }
    }

    return new SearchIndexEngine();
}
