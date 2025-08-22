import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * ConfIAbleARTDemo
 * A lightweight, drop‑in React component to explain adversarial examples.
 *
 * Features
 * - Upload an image (or use a sample digit) and visualize a perturbation with an ε slider
 * - "Demo mode" adds small signed noise on the client to illustrate FGSM‑style effect
 * - If you pass an `apiUrl` prop with /predict and /attack endpoints, it will call a real backend
 *
 * Usage
 * <ConfIAbleARTDemo apiUrl={process.env.NEXT_PUBLIC_CONFIABLE_API} />
 */

export default function ConfIAbleARTDemo({ apiUrl }: { apiUrl?: string }) {
  const [epsilon, setEpsilon] = useState(0.03);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [advImageDataUrl, setAdvImageDataUrl] = useState<string | null>(null);
  const [cleanPred, setCleanPred] = useState<string>("—");
  const [advPred, setAdvPred] = useState<string>("—");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>(apiUrl ? "API mode" : "Demo mode (no backend)");

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const advCanvasRef = useRef<HTMLCanvasElement>(null);

  // Load a tiny sample (hand‑drawn 7) if user hasn't uploaded anything
  useEffect(() => {
    if (!imageDataUrl) {
      const sample = createSampleDigit7();
      setImageDataUrl(sample);
    }
  }, [imageDataUrl]);

  // Draw current image to canvas
  useEffect(() => {
    if (!imageDataUrl || !canvasRef.current) return;
    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      canvasRef.current!.width = 28;
      canvasRef.current!.height = 28;
      ctx.drawImage(img, 0, 0, 28, 28);
    };
    img.src = imageDataUrl;
  }, [imageDataUrl]);

  // When epsilon changes in demo mode, synthesize adversarial preview
  useEffect(() => {
    if (!advCanvasRef.current || !canvasRef.current) return;
    if (apiUrl) return; // real adv image comes from backend
    const baseCtx = canvasRef.current.getContext("2d");
    const advCtx = advCanvasRef.current.getContext("2d");
    if (!baseCtx || !advCtx) return;
    const imgData = baseCtx.getImageData(0, 0, 28, 28);
    const adv = new ImageData(28, 28);

    // Simple illustrative perturbation: signed noise scaled by epsilon
    // (Not a true gradient‑based FGSM; purely for visualization.)
    for (let i = 0; i < imgData.data.length; i += 4) {
      const gray = imgData.data[i];
      const noiseSign = (hash(i) % 2 === 0) ? 1 : -1; // deterministic pseudo‑random sign
      const perturbed = clamp(gray + noiseSign * epsilon * 255, 0, 255);
      adv.data[i] = adv.data[i + 1] = adv.data[i + 2] = perturbed;
      adv.data[i + 3] = 255;
    }
    advCtx.putImageData(adv, 0, 0);
    setAdvImageDataUrl(advCanvasRef.current.toDataURL());
  }, [epsilon, apiUrl]);

  const onUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      // Normalize to 28x28 grayscale
      const img = new Image();
      img.onload = () => {
        const tmp = document.createElement("canvas");
        tmp.width = 28; tmp.height = 28;
        const tctx = tmp.getContext("2d")!;
        tctx.drawImage(img, 0, 0, 28, 28);
        const id = tctx.getImageData(0, 0, 28, 28);
        // grayscale
        for (let i = 0; i < id.data.length; i += 4) {
          const r = id.data[i], g = id.data[i + 1], b = id.data[i + 2];
          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          id.data[i] = id.data[i + 1] = id.data[i + 2] = gray;
          id.data[i + 3] = 255;
        }
        tctx.putImageData(id, 0, 0);
        setImageDataUrl(tmp.toDataURL());
        setAdvImageDataUrl(null);
        setCleanPred("—");
        setAdvPred("—");
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const callApi = async (path: string, payload: any) => {
    const res = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  };

  const runPredict = async () => {
    if (!canvasRef.current) return;
    setBusy(true);
    try {
      if (apiUrl) {
        const x = canvasToArray(canvasRef.current);
        const out = await callApi("/predict", { x });
        setCleanPred(formatPred(out));
      } else {
        setCleanPred("Demo: predicted ‘7’ with 96% (illustrative)");
      }
    } catch (e: any) {
      setCleanPred(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  const runAttack = async () => {
    setBusy(true);
    try {
      if (apiUrl) {
        const x = canvasToArray(canvasRef.current!);
        const out = await callApi("/attack", { x, eps: epsilon });
        setAdvPred(formatPred(out));
        if (out.image) setAdvImageDataUrl(out.image);
      } else {
        setAdvPred("Demo: misclassified as ‘1’ with 78% (illustrative)");
      }
    } catch (e: any) {
      setAdvPred(`Error: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      <header className="mb-4">
        <h1 className="text-2xl font-bold">ConfIAble · Adversarial Example Explainer</h1>
        <p className="text-sm text-gray-600">{status}. Move ε to see perturbations. In API mode, the backend computes real adversarial examples with ART.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl shadow bg-white">
          <h2 className="font-semibold mb-2">1) Input</h2>
          <div className="aspect-square border rounded-xl flex items-center justify-center overflow-hidden bg-gray-50">
            <canvas ref={canvasRef} width={28} height={28} style={{ imageRendering: "pixelated", width: 224, height: 224 }} />
          </div>
          <label className="mt-3 inline-block">
            <span className="text-sm">Upload (PNG/JPG)</span>
            <input type="file" accept="image/*" className="block mt-1" onChange={(e) => e.target.files && onUpload(e.target.files[0])} />
          </label>
        </div>

        <div className="p-4 rounded-2xl shadow bg-white">
          <h2 className="font-semibold mb-2">2) ε (epsilon) · perturbation size</h2>
          <input type="range" min={0} max={0.2} step={0.01} value={epsilon} onChange={(e)=>setEpsilon(parseFloat(e.target.value))} className="w-full" />
          <div className="text-sm text-gray-700 mt-1">ε = {epsilon.toFixed(2)}</div>

          <div className="mt-4 flex gap-2">
            <button disabled={busy} onClick={runPredict} className="px-3 py-2 rounded-xl shadow bg-black text-white">Predict (clean)</button>
            <button disabled={busy} onClick={runAttack} className="px-3 py-2 rounded-xl shadow bg-indigo-600 text-white">Attack (FGSM‑style)</button>
          </div>

          <div className="mt-4 text-sm">
            <div><span className="font-semibold">Clean:</span> {cleanPred}</div>
            <div><span className="font-semibold">Adversarial:</span> {advPred}</div>
          </div>
        </div>

        <div className="p-4 rounded-2xl shadow bg-white">
          <h2 className="font-semibold mb-2">3) Adversarial preview</h2>
          <div className="aspect-square border rounded-xl flex items-center justify-center overflow-hidden bg-gray-50">
            <canvas ref={advCanvasRef} width={28} height={28} style={{ imageRendering: "pixelated", width: 224, height: 224 }} />
          </div>
          {advImageDataUrl && (
            <a className="text-xs text-blue-600 underline mt-2 inline-block" href={advImageDataUrl} download>
              Download adversarial image (PNG)
            </a>
          )}
          <p className="text-xs text-gray-500 mt-2">
            In demo mode we add signed noise for intuition. Hook a backend to compute true gradients via ART.
          </p>
        </div>
      </div>

      <section className="mt-6 p-4 rounded-2xl bg-white shadow">
        <h3 className="font-semibold mb-1">What’s happening?</h3>
        <p className="text-sm text-gray-700">
          Adversarial examples add a small perturbation (bounded by ε) that’s often imperceptible but can change a model’s prediction. In real mode, the
          backend uses <code>FastGradientMethod</code> (FGSM) from the Adversarial Robustness Toolbox (ART) to craft such perturbations.
        </p>
      </section>

      <footer className="text-xs text-gray-500 mt-4">
        © {new Date().getFullYear()} Mayan Mind, LLC · ConfIAble
      </footer>
    </div>
  );
}

// ===== Helpers =====
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function hash(i: number) { // tiny deterministic hash
  let x = i ^ 0x9e3779b9; x ^= x << 6; x ^= x >>> 17; x ^= x << 9; return Math.abs(x);
}

function canvasToArray(c: HTMLCanvasElement) {
  const ctx = c.getContext("2d")!; const id = ctx.getImageData(0,0,28,28);
  // Return a flattened grayscale [0,1] array of shape (1,1,28,28)
  const arr:number[] = [];
  for (let i=0;i<id.data.length;i+=4){ arr.push(id.data[i]/255); }
  return { data: arr, shape: [1,1,28,28] };
}

function formatPred(out: any) {
  if (!out) return "—";
  if (typeof out === "string") return out;
  if (out?.top && out?.conf) return `‘${out.top}’ with ${(out.conf*100).toFixed(1)}%`;
  if (out?.probs?.length){
    const idx = out.probs.indexOf(Math.max(...out.probs));
    return `‘${idx}’ with ${(out.probs[idx]*100).toFixed(1)}%`;
  }
  return JSON.stringify(out);
}

function createSampleDigit7(){
  const c = document.createElement("canvas"); c.width = 28; c.height = 28;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "white"; ctx.fillRect(0,0,28,28);
  ctx.fillStyle = "black"; ctx.lineWidth = 2; ctx.beginPath();
  ctx.moveTo(4,6); ctx.lineTo(24,6); ctx.lineTo(10,26); ctx.stroke();
  // blur a bit
  const id = ctx.getImageData(0,0,28,28);
  for (let i=0;i<id.data.length;i+=4){
    const v = id.data[i]; id.data[i]=id.data[i+1]=id.data[i+2]=v; id.data[i+3]=255;
  }
  ctx.putImageData(id,0,0);
  return c.toDataURL();
}
