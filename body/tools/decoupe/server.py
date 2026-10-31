"""Découpe en cliquant (Segment Anything 2, sur ta carte graphique).

    tools\\decoupe\\.venv\\Scripts\\python tools\\decoupe\\server.py [ton-dessin.png]
    puis http://127.0.0.1:8790

Clic gauche sur une partie : SAM l'entoure. Clic droit : « pas ça ». Le pinceau corrige à la main. Chaque partie
enregistrée devient un PNG à la taille de ton dessin (la partie à sa place, le reste transparent), dans
assets/rig-parts/manuel/ : il n'y a plus qu'à tout importer dans Rive au même endroit.
"""

import base64
import io
import json
import re
import sys
from pathlib import Path

import numpy as np
import torch
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, Response
from PIL import Image, ImageFilter
from pydantic import BaseModel

HERE = Path(__file__).resolve().parent
OUT = HERE.parent.parent / "assets" / "rig-parts" / "manuel"
DEFAULT = HERE.parent.parent / "assets" / "rig-parts" / "source" / "capri-face.webp"
OUT.mkdir(parents=True, exist_ok=True)

app = FastAPI()
state: dict = {"rgba": None, "predictor": None}


def load_predictor():
    from sam2.sam2_image_predictor import SAM2ImagePredictor
    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"Chargement de SAM 2 sur {device}…")
    state["predictor"] = SAM2ImagePredictor.from_pretrained("facebook/sam2.1-hiera-large", device=device)


def set_image(img: Image.Image):
    rgba = img.convert("RGBA")
    state["rgba"] = np.array(rgba)
    # SAM voit l'image sur fond blanc (la transparence le perdrait)
    flat = Image.new("RGB", rgba.size, (255, 255, 255))
    flat.paste(rgba, mask=rgba.split()[3])
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16, enabled=torch.cuda.is_available()):
        state["predictor"].set_image(np.array(flat))
    rgba.save(HERE / "travail.png")
    print(f"Dessin prêt : {rgba.size[0]} × {rgba.size[1]}")


def png_b64(mask: np.ndarray) -> str:
    buf = io.BytesIO()
    Image.fromarray((mask * 255).astype(np.uint8)).save(buf, "PNG")
    return base64.b64encode(buf.getvalue()).decode()


class Prompt(BaseModel):
    points: list[list[float]] = []  # [x, y, 1 = la partie / 0 = pas ça]
    box: list[float] | None = None


class Part(BaseModel):
    name: str
    mask: str  # PNG en base64 (blanc = la partie)
    grow: int = 6  # débordement aux articulations, en px


@app.get("/")
def page():
    return HTMLResponse((HERE / "index.html").read_text(encoding="utf-8"), headers={"Cache-Control": "no-store"})


@app.get("/image")
def image():
    return FileResponse(HERE / "travail.png", headers={"Cache-Control": "no-store"})


@app.post("/upload")
async def upload(file: UploadFile):
    set_image(Image.open(io.BytesIO(await file.read())))
    return {"ok": True}


@app.post("/segment")
def segment(p: Prompt):
    if not p.points and not p.box:
        return {"mask": None}
    pts = np.array([[x, y] for x, y, _ in p.points], dtype=np.float32) if p.points else None
    labels = np.array([int(l) for _, _, l in p.points], dtype=np.int32) if p.points else None
    box = np.array(p.box, dtype=np.float32) if p.box else None
    single = len(p.points) == 1 and box is None
    with torch.inference_mode(), torch.autocast("cuda", dtype=torch.bfloat16, enabled=torch.cuda.is_available()):
        masks, scores, _ = state["predictor"].predict(point_coords=pts, point_labels=labels, box=box,
                                                      multimask_output=single)
    best = masks[int(np.argmax(scores))] > 0.5
    best &= state["rgba"][..., 3] > 20  # jamais hors du dessin
    return {"mask": png_b64(best), "score": float(np.max(scores))}


@app.post("/save")
def save(part: Part):
    name = re.sub(r"[^\w\-]+", "-", part.name.strip().lower()).strip("-")
    if not name:
        raise HTTPException(400, "il faut un nom")
    m = np.array(Image.open(io.BytesIO(base64.b64decode(part.mask))).convert("L")) > 127
    if part.grow > 0:  # un peu de débordement sous les voisines : pas de trou quand ça plie
        m = np.array(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(part.grow * 2 + 1))) > 0
    rgba = state["rgba"]
    m &= rgba[..., 3] > 0
    out = np.zeros_like(rgba)
    out[m] = rgba[m]
    Image.fromarray(out).save(OUT / f"{name}.png")
    return {"ok": True, "name": name, "pixels": int(m.sum())}


@app.get("/parts")
def parts():
    return [p.stem for p in sorted(OUT.glob("*.png"))]


@app.get("/part/{name}")
def part(name: str):
    f = OUT / f"{name}.png"
    if not f.exists():
        raise HTTPException(404)
    return FileResponse(f, headers={"Cache-Control": "no-store"})


@app.delete("/part/{name}")
def delete(name: str):
    (OUT / f"{name}.png").unlink(missing_ok=True)
    return {"ok": True}


if __name__ == "__main__":
    load_predictor()
    set_image(Image.open(sys.argv[1] if len(sys.argv) > 1 else DEFAULT))
    print("Ouvre http://127.0.0.1:8790")
    uvicorn.run(app, host="127.0.0.1", port=8790, log_level="warning")
