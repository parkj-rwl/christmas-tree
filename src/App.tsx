import { useEffect, useEffectEvent, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { GROW_END, LIMIT, LOOP, SAMPLE, createScene, splitText, type Scene, type Tree } from "./tree/scene.ts";
import { CODE_ROWS, editorState, makeCode, tokenize } from "./tree/code.ts";
import { linkFor, normalizeMessage, readLinkedTree } from "./tree/link.ts";
import { recordGif } from "./tree/gif.ts";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const compactView = matchMedia("(max-width: 799px)");
const SAMPLE_TREE: Tree = { message: SAMPLE };

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const terminalRef = useRef<HTMLElement>(null);
  const codeRef = useRef<HTMLPreElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);
  const shareLinkRef = useRef<HTMLInputElement>(null);
  const elapsed = useRef(0);
  const composing = useRef(false);
  // Bumped whenever the shown tree changes; a running GIF export stops when it sees a new value.
  const generation = useRef(0);
  const previewPlayback = useRef<{ elapsed: number; paused: boolean } | null>(null);

  const [giftTree, setGiftTree] = useState(() => readLinkedTree(location.href));
  const [createdTree, setCreatedTree] = useState<Tree | null>(null);
  const [paused, setPaused] = useState(reducedMotion.matches);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [feedback, setFeedback] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [exporting, setExporting] = useState(false);
  const [status, setStatus] = useState("MESSAGE");

  const giftView = giftTree !== null;
  const tree = giftTree ?? createdTree ?? SAMPLE_TREE;
  const timeline = useMemo(() => makeCode(tree.message), [tree.message]);
  const [editor, setEditor] = useState(() => editorState(timeline, 0, paused));

  useEffect(() => {
    sceneRef.current ??= createScene(canvasRef.current!);
    sceneRef.current.setTree(tree);
  }, [tree]);

  useEffect(() => {
    const scene = sceneRef.current!;
    let frame = 0;
    let last: number | null = null;
    const draw = () => {
      const mix = scene.render(elapsed.current);
      if (giftView) return;
      const next = editorState(timeline, elapsed.current, paused);
      setEditor(prev => prev.index === next.index && prev.typed === next.typed && prev.cursor === next.cursor ? prev : next);
      setStatus(paused ? "PAUSED" : mix === 0 ? "MESSAGE" : mix === 1 ? "RENDER OK" : elapsed.current < GROW_END ? "GROWING" : "LOOPING");
      progressRef.current!.style.transform = "scaleX(" + (elapsed.current / LOOP).toFixed(4) + ")";
    };
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      if (compactView.matches && last !== null && now - last < 31) return; // ~30fps on phones
      if (last !== null) elapsed.current = (elapsed.current + Math.min(100, now - last)) % LOOP;
      last = now;
      draw();
    };
    const resize = () => {
      scene.resize();
      draw();
    };
    draw();
    if (!paused && !exporting) frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
    };
  }, [tree, timeline, paused, exporting, giftView]);

  const lastFirst = useRef(editor.first);
  useEffect(() => {
    if (editor.first > lastFirst.current && !paused && !reducedMotion.matches) {
      codeRef.current?.animate(
        [{ transform: "translateY(.65em)" }, { transform: "translateY(0)" }],
        { duration: 120, easing: "ease-out" }
      );
    }
    lastFirst.current = editor.first;
  }, [editor.first, paused]);

  useLayoutEffect(() => {
    document.body.dataset.view = giftView ? "gift" : "builder";
  }, [giftView]);

  useEffect(() => {
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) setPaused(true);
    };
    reducedMotion.addEventListener("change", onChange);
    return () => reducedMotion.removeEventListener("change", onChange);
  }, []);

  useEffect(() => () => {
    if (gifUrl) URL.revokeObjectURL(gifUrl);
  }, [gifUrl]);

  const onHashChange = useEffectEvent(() => openView(readLinkedTree(location.href)));
  useEffect(() => {
    const listener = () => onHashChange();
    window.addEventListener("hashchange", listener);
    return () => window.removeEventListener("hashchange", listener);
  }, []);

  function resetShareFeedback() {
    setFeedback("");
    setShareLink("");
  }

  function updateCount() {
    const field = fieldRef.current!;
    const pieces = splitText(field.value);
    if (!composing.current && pieces.length > LIMIT) {
      const position = field.selectionStart;
      const clipped = pieces.slice(0, LIMIT).join("");
      field.value = clipped;
      if (position !== null) field.setSelectionRange(Math.min(position, clipped.length), Math.min(position, clipped.length));
    }
    setCount(Math.min(pieces.length, LIMIT));
    setError("");
  }

  // Switches between the builder and the gift (receiver) view. Coming back from a link resets the builder;
  // coming back from "받는 화면 미리 보기" restores where playback was.
  function openView(received: Tree | null) {
    const returningHome = giftView && !received;
    const previous = returningHome ? previewPlayback.current : null;
    flushSync(() => {
      if (returningHome) {
        previewPlayback.current = null;
        if (!previous) {
          setCreatedTree(null);
          setGifUrl("");
          fieldRef.current!.value = "";
          updateCount();
          setAnnouncement("");
        }
      }
      generation.current += 1;
      elapsed.current = previous?.elapsed ?? 0;
      setGiftTree(received);
      setPaused(previous?.paused ?? reducedMotion.matches);
      resetShareFeedback();
    });
    if (returningHome) {
      window.scrollTo(0, 0);
      titleRef.current!.focus({ preventScroll: true });
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (composing.current) return;
    const value = normalizeMessage(fieldRef.current!.value);
    if (!value) {
      setError("트리로 만들 문구를 입력해 주세요.");
      fieldRef.current!.focus();
      return;
    }
    const nextPaused = reducedMotion.matches;
    generation.current += 1;
    elapsed.current = 0;
    setPaused(nextPaused);
    setCreatedTree({ message: value, seed: Math.floor(Math.random() * 0x100000000) });
    setGifUrl("");
    resetShareFeedback();
    setAnnouncement("‘" + value + "’ 트리를 만들었어요." + (nextPaused ? " 재생 버튼을 눌러 움직임을 볼 수 있어요." : ""));
    const terminal = terminalRef.current!;
    const bounds = terminal.getBoundingClientRect();
    if (compactView.matches) fieldRef.current!.blur();
    if (bounds.top > innerHeight * .53 && bounds.bottom > innerHeight) {
      terminal.scrollIntoView({ block: compactView.matches ? "start" : "nearest", behavior: "auto" });
    }
  }

  async function copyLink() {
    if (!createdTree) return;
    const url = linkFor(createdTree, location.href);
    try {
      await navigator.clipboard.writeText(url);
      setShareLink("");
      setFeedback("트리 링크를 복사했어요.");
    } catch {
      flushSync(() => setShareLink(url));
      shareLinkRef.current!.focus();
      shareLinkRef.current!.select();
      setFeedback("선택된 링크를 복사해 주세요.");
    }
  }

  function previewGift() {
    if (!createdTree) return;
    previewPlayback.current = { elapsed: elapsed.current, paused };
    openView(createdTree);
  }

  function makeOwn() {
    openView(null);
    const home = new URL(location.href);
    home.hash = "";
    history.replaceState(history.state, "", home.href);
  }

  async function exportGif() {
    if (!createdTree || exporting) return;
    const run = generation.current;
    setExporting(true);
    resetShareFeedback();
    try {
      const blob = await recordGif(
        sceneRef.current!,
        timeline,
        percent => setFeedback("GIF 만드는 중 " + percent + "%"),
        () => generation.current !== run
      );
      if (!blob) return;
      setGifUrl(URL.createObjectURL(blob));
      setFeedback("GIF를 다운로드해서 친구에게 보낼 수 있어요.");
    } catch {
      setFeedback("GIF를 만들지 못했어요. 다시 눌러 주세요.");
    } finally {
      setExporting(false);
    }
  }

  const playLabel = paused ? "애니메이션 재생" : "애니메이션 일시정지";
  const canvasLabel = tree.message + " 문구가 크리스마스 트리로 바뀌는 모습";

  return (
    <div className="shell">
      <header className="brand">
        <span className="brand-mark" aria-hidden="true" />
        <span>ASCII CHRISTMAS</span>
      </header>
      <main>
        <section className="intro" aria-labelledby="title">
          <h1 id="title" ref={titleRef} tabIndex={-1}>나만의 <span>크리스마스 트리 만들기</span></h1>
          <p className="description">문구를 입력하면 글자들이 모여 크리스마스 트리가 돼요.</p>
          <form className="entry" noValidate onSubmit={submit}>
            <label htmlFor="message">트리로 만들 문구</label>
            <div className="entry-row">
              <input
                id="message"
                ref={fieldRef}
                type="text"
                placeholder="이곳에 문구를 입력하세요"
                autoComplete="off"
                aria-describedby="input-hint count error"
                aria-invalid={error ? true : undefined}
                onInput={updateCount}
                onCompositionStart={() => { composing.current = true; }}
                onCompositionEnd={() => { composing.current = false; updateCount(); }}
              />
              <button className="submit" type="submit">트리 만들기</button>
            </div>
            <div className="entry-meta">
              <span id="error" className="error" role="status">{error}</span>
              <output id="count" className="count" htmlFor="message">{count + " / " + LIMIT}</output>
            </div>
            <span id="input-hint" className="sr-only">문구를 최대 {LIMIT}자까지 입력할 수 있어요.</span>
            <div className="share-actions">
              <button className="share-button" type="button" disabled={!createdTree} onClick={copyLink}>트리 링크 복사</button>
              {createdTree && (
                <>
                  <button className="share-button" type="button" onClick={previewGift}>받는 화면 미리 보기</button>
                  <button className="share-button" type="button" disabled={exporting} onClick={exportGif}>
                    {exporting ? "GIF 만드는 중…" : "GIF 만들기"}
                  </button>
                  {gifUrl && <a className="share-button" href={gifUrl} download="christmas-tree.gif">GIF 다운로드</a>}
                </>
              )}
              <p className="share-feedback" role="status">{feedback}</p>
              {shareLink && (
                <input ref={shareLinkRef} className="share-link" type="text" aria-label="트리 공유 링크" readOnly value={shareLink} />
              )}
            </div>
          </form>
        </section>

        <section
          ref={terminalRef}
          className="terminal"
          aria-label={giftView ? "선물로 받은 크리스마스 트리" : "문구가 크리스마스 트리로 바뀌는 미리보기"}
        >
          <div className="terminal-bar">
            <div className="window-markers" aria-hidden="true"><span /><span /><span /></div>
            <span>christmas_tree.py</span>
            <button
              className="play"
              type="button"
              aria-pressed={paused}
              aria-label={playLabel}
              title={playLabel}
              onClick={() => setPaused(value => !value)}
            >
              <span className="play-icon" aria-hidden="true" />
            </button>
          </div>
          <div className="stage">
            <canvas ref={canvasRef} role="img" aria-label={canvasLabel}>{canvasLabel}</canvas>
            <div className="stage-meta" aria-hidden="true">
              <span>OUTPUT</span>
              <span className="state" data-grown={status === "RENDER OK"}>{status}</span>
            </div>
          </div>
          <div className="timeline" aria-hidden="true"><span ref={progressRef} /></div>
          <div className="editor">
            <pre ref={codeRef} aria-label="트리 변환을 보여주는 파이썬 코드"><code>
              {Array.from({ length: CODE_ROWS }, (_, offset) => {
                const lineIndex = editor.first + offset;
                const active = lineIndex === editor.index;
                const line = timeline[lineIndex];
                const length = active ? editor.typed : lineIndex < editor.index ? line.letters.length : 0;
                return (
                  <span key={offset} className="code-row" data-active={active}>
                    <span className="line-number" aria-hidden="true">{lineIndex <= editor.index ? lineIndex + 1 : ""}</span>
                    <span className="line-content" data-cursor={active && editor.cursor}>
                      {tokenize(line, length).map((token, index) =>
                        token.kind ? <span key={index} className={token.kind}>{token.text}</span> : token.text
                      )}
                    </span>
                  </span>
                );
              })}
            </code></pre>
          </div>
        </section>
        {giftView && <button className="submit gift-action" type="button" onClick={makeOwn}>나도 만들기</button>}
        <div className="sr-only" role="status">{announcement}</div>
      </main>
    </div>
  );
}
