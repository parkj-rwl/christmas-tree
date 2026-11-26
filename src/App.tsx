import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { LIMIT, LOOP, SAMPLE, createScene, splitText, type Scene, type Tree } from "./tree/scene.ts";
import { linkFor, normalizeMessage, readLinkedTree } from "./tree/link.ts";
import { recordGif } from "./tree/gif.ts";

const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const compactView = matchMedia("(max-width: 799px)");
const SAMPLE_TREE: Tree = { message: SAMPLE };

// String lights across the top: a wire that sags SAGS times, with bulbs hanging from it.
const SAGS = 6;
const BULBS = 24;
const wireY = (t: number) => 6 + 14 * Math.sin(Math.PI * ((t * SAGS) % 1));
const wirePath = Array.from({ length: SAGS * 16 + 1 }, (_, index) => {
  const t = index / (SAGS * 16);
  return (index ? "L" : "M") + (t * 1000).toFixed(1) + " " + wireY(t).toFixed(1);
}).join(" ");

function StringLights() {
  return (
    <div className="string-lights" aria-hidden="true">
      <svg viewBox="0 0 1000 44" preserveAspectRatio="none"><path d={wirePath} /></svg>
      {Array.from({ length: BULBS }, (_, index) => {
        const t = (index + .5) / BULBS;
        const style = { left: t * 100 + "%", top: wireY(t) + 2 + "px", "--i": index } as CSSProperties;
        return <span key={index} className="bulb" style={style} />;
      })}
    </div>
  );
}

function SantaHat() {
  return (
    <svg className="santa-hat" viewBox="0 0 72 58" aria-hidden="true">
      <path d="M12 46 C 13 27 22 10 38 8 C 51 7 61 15 65 28 C 66 33 66 38 63 42 C 59 34 53 28 46 29 C 49 35 51 41 52 46 Z" fill="#f23a4d" />
      <path d="M46 29 C 53 28 59 34 63 42 C 58 38 53 35 48 36 Z" fill="#a8172a" />
      <path d="M22 44 C 22 30 28 17 38 12 C 31 20 28 32 29 44 Z" fill="#ff6b78" />
      <circle cx="63" cy="44" r="7.5" fill="#fff" />
      <rect x="5" y="41" width="54" height="15" rx="7.5" fill="#fff" />
      <rect x="5" y="50" width="54" height="6" rx="3" fill="#e4e8ea" />
    </svg>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<Scene>(null);
  const fieldRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const shareLinkRef = useRef<HTMLInputElement>(null);
  const elapsed = useRef(0);
  const lit = useRef(0);
  const composing = useRef(false);
  // Bumped whenever the shown tree changes; a running GIF export stops when it sees a new value.
  const generation = useRef(0);
  const previewPlayback = useRef<{ elapsed: number; paused: boolean } | null>(null);

  const [giftTree, setGiftTree] = useState(() => readLinkedTree(location.href));
  const [createdTree, setCreatedTree] = useState<Tree | null>(null);
  const [paused, setPaused] = useState(reducedMotion.matches);
  const [lightsOn, setLightsOn] = useState(false);
  const [count, setCount] = useState(0);
  const [error, setError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [feedback, setFeedback] = useState("");
  const [shareLink, setShareLink] = useState("");
  const [gifUrl, setGifUrl] = useState("");
  const [exporting, setExporting] = useState(false);

  const giftView = giftTree !== null;
  const tree = giftTree ?? createdTree ?? SAMPLE_TREE;

  useEffect(() => {
    sceneRef.current ??= createScene(canvasRef.current!);
    sceneRef.current.setTree(tree);
  }, [tree]);

  useEffect(() => {
    const scene = sceneRef.current!;
    const target = lightsOn ? 1 : 0;
    if (paused || exporting) lit.current = target;
    let frame = 0;
    let last: number | null = null;
    const draw = () => {
      lit.current += (target - lit.current) * .12; // lights fade in/out over ~0.4s
      scene.render(elapsed.current, lit.current);
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
  }, [tree, paused, exporting, lightsOn]);

  useLayoutEffect(() => {
    document.body.dataset.view = giftView ? "gift" : "builder";
    document.body.dataset.lights = lightsOn ? "on" : "off";
  }, [giftView, lightsOn]);

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
  // coming back from "받는 화면 미리 보기" restores where playback was. A received tree starts with the lights off
  // so the receiver gets to switch them on.
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
      if (received) setLightsOn(false);
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
    if (compactView.matches) fieldRef.current!.blur();
    const bounds = stageRef.current!.getBoundingClientRect();
    if (bounds.top < 0 || bounds.bottom > innerHeight) stageRef.current!.scrollIntoView({ block: "nearest" });
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
        lightsOn,
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
    <>
      <StringLights />
      <div className="shell">
        <header className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span>ASCII CHRISTMAS</span>
        </header>
        <main>
          <section className="intro" aria-labelledby="title">
            <h1 id="title" ref={titleRef} tabIndex={-1}>나만의 <span>크리스마스 트리</span> 만들기</h1>
            <p className="description">문구를 입력하면 글자들이 모여 크리스마스 트리가 돼요.</p>
          </section>
          {giftView && <p className="caption">“{tree.message}”</p>}

          <section
            ref={stageRef}
            className="stage"
            aria-label={giftView ? "선물로 받은 크리스마스 트리" : "문구가 크리스마스 트리로 바뀌는 미리보기"}
          >
            <canvas ref={canvasRef} role="img" aria-label={canvasLabel}>{canvasLabel}</canvas>
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
          </section>

          <button className="lights-toggle" type="button" role="switch" aria-checked={lightsOn} onClick={() => setLightsOn(on => !on)}>
            <SantaHat />
            <span>크리스마스 조명 {lightsOn ? "끄기" : "켜기"}</span>
            <span className="switch" aria-hidden="true" />
          </button>

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
          {giftView && <button className="gift-action" type="button" onClick={makeOwn}>나도 만들기</button>}
          <div className="sr-only" role="status">{announcement}</div>
        </main>
      </div>
    </>
  );
}
