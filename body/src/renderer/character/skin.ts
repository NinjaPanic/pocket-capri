import skinData from '../../../assets/skin/skin.json';
import { drawFace, type FaceConfig } from './face';
import { Mat } from './geometry';
import type { Params } from './params';
import { ARM_L_REST, FOOT_REST, poseFromParams } from './rig';

/**
 * Son corps souple : ses pièces découpées à la main (assets/rig-parts/manuel, via tools/build_skin.py) deviennent des
 * maillages qui se déforment sur la carte graphique (WebGL2). Près d'une articulation, chaque sommet suit un peu les
 * deux os : coudes et genoux se plient en douceur, sans angle sec ni trou. Dessiné dans un canevas à part, puis posé
 * sur son canevas habituel (les effets, glitchs et téléportations marchent pareil).
 */
interface BoneData { name: string; parent: string | null; pivot: [number, number]; end: [number, number] }
interface PartData { file: string; bone: string; z: number; box: [number, number, number, number]; verts: [number, number][]; tris: number[]; weights: [number, number][][] }
interface SkinData { size: [number, number]; feet: number; face: { x: number; y: number; dist: number; angle: number }; bones: BoneData[]; parts: PartData[] }

export const SKIN = skinData as unknown as SkinData;
export type Pose = Record<string, number>; // os → degrés

const MAX_BONES = 16;

const VS = `#version 300 es
in vec2 aPos; in vec2 aUV; in vec3 aIdx; in vec3 aW;
uniform mat3 uB[${MAX_BONES}];
uniform mat3 uM; // dessin → pixels du canevas
uniform vec2 uSize;
out vec2 vUV;
void main() {
  vec3 p = vec3(aPos, 1.0);
  vec2 q = aW.x * (uB[int(aIdx.x)] * p).xy + aW.y * (uB[int(aIdx.y)] * p).xy + aW.z * (uB[int(aIdx.z)] * p).xy;
  vec2 d = (uM * vec3(q, 1.0)).xy;
  gl_Position = vec4(d.x / uSize.x * 2.0 - 1.0, 1.0 - d.y / uSize.y * 2.0, 0.0, 1.0);
  vUV = aUV;
}`;
const FS = `#version 300 es
precision mediump float;
in vec2 vUV; uniform sampler2D uTex; out vec4 o;
void main() { o = texture(uTex, vUV); }`;

interface GPUPart { vao: WebGLVertexArrayObject; count: number; tex: WebGLTexture | null; data: PartData }

export class SkinBody {
  readonly canvas = document.createElement('canvas');
  private gl: WebGL2RenderingContext | null = null;
  private prog: WebGLProgram | null = null;
  private parts: GPUPart[] = [];
  private loc: Record<string, WebGLUniformLocation | null> = {};
  readonly boneIndex = new Map(SKIN.bones.map((b, i) => [b.name, i]));
  ready = false;
  /** Matrices monde de chaque os (dessin → dessin posé), calculées au dernier dessin. */
  world: Mat[] = SKIN.bones.map(() => new Mat());

  async load(base = 'skin/') {
    const gl = this.canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true });
    if (!gl) return;
    this.gl = gl;
    const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.warn('skin shader', gl.getProgramInfoLog(prog)); return; }
    this.prog = prog;
    for (const u of ['uB', 'uM', 'uSize', 'uTex']) this.loc[u] = gl.getUniformLocation(prog, u);
    const images = await Promise.all(SKIN.parts.map((p) => new Promise<HTMLImageElement | null>((res) => {
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = `${base}${p.file}.png`;
    })));
    for (const [i, p] of [...SKIN.parts.entries()].sort((a, b) => a[1].z - b[1].z)) {
      const [x0, y0, x1, y1] = p.box;
      const n = p.verts.length, pos = new Float32Array(n * 2), uv = new Float32Array(n * 2), idx = new Float32Array(n * 3), w = new Float32Array(n * 3);
      p.verts.forEach(([x, y], k) => {
        pos[k * 2] = x; pos[k * 2 + 1] = y; uv[k * 2] = (x - x0) / (x1 - x0); uv[k * 2 + 1] = (y - y0) / (y1 - y0);
        p.weights[k].forEach(([b, ww], j) => { idx[k * 3 + j] = b; w[k * 3 + j] = ww; });
      });
      const vao = gl.createVertexArray()!;
      gl.bindVertexArray(vao);
      const attr = (name: string, data: Float32Array, size: number) => {
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const l = gl.getAttribLocation(prog, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0);
      };
      attr('aPos', pos, 2); attr('aUV', uv, 2); attr('aIdx', idx, 3); attr('aW', w, 3);
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(p.tris), gl.STATIC_DRAW);
      gl.bindVertexArray(null);
      let tex: WebGLTexture | null = null;
      if (images[i]) {
        tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[i]!);
        gl.generateMipmap(gl.TEXTURE_2D); // le dessin est bien plus grand qu'à l'écran : réduit proprement
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      this.parts.push({ vao, count: p.tris.length, tex, data: p });
    }
    this.ready = true;
  }

  /** Matrices monde des os pour cette pose (degrés, rotation autour de leur articulation, parents d'abord).
   *  `stretch` : un os raccourci le long de lui-même (une cuisse qui avance vers nous paraît plus courte). */
  solve(pose: Pose, stretch: Pose = {}) {
    const done = new Map<string, Mat>();
    for (const b of SKIN.bones) {
      const parent = b.parent ? done.get(b.parent)! : new Mat();
      const [px, py] = b.pivot;
      let local = new Mat().translate(px, py).rotate(((pose[b.name] ?? 0) * Math.PI) / 180);
      const k = stretch[b.name];
      if (k !== undefined && k !== 1) {
        const dx = b.end[0] - px, dy = b.end[1] - py, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
        local = local.mul(new Mat(1 + (k - 1) * ux * ux, (k - 1) * ux * uy, (k - 1) * ux * uy, 1 + (k - 1) * uy * uy, 0, 0));
      }
      const m = parent.mul(local.translate(-px, -py));
      done.set(b.name, m);
      this.world[this.boneIndex.get(b.name)!] = m;
    }
  }

  /** Où un point du dessin se retrouve, posé par son os. */
  place(bone: string, x: number, y: number) {
    const m = this.world[this.boneIndex.get(bone)!];
    const [X, Y] = m.apply([x, y]);
    return { x: X, y: Y, angle: Math.atan2(m.b, m.a) };
  }

  /** Dessine son corps posé ; `toDevice` envoie les px du dessin vers les px réels de `ctx.canvas`. */
  draw(ctx: CanvasRenderingContext2D, toDevice: Mat) {
    const gl = this.gl;
    if (!gl || !this.prog) return;
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (this.canvas.width !== cw || this.canvas.height !== ch) { this.canvas.width = cw; this.canvas.height = ch; }
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(this.prog);
    const bones = new Float32Array(MAX_BONES * 9);
    this.world.forEach((m, i) => bones.set([m.a, m.b, 0, m.c, m.d, 0, m.e, m.f, 1], i * 9));
    gl.uniformMatrix3fv(this.loc.uB, false, bones);
    const M = toDevice;
    gl.uniformMatrix3fv(this.loc.uM, false, [M.a, M.b, 0, M.c, M.d, 0, M.e, M.f, 1]);
    gl.uniform2f(this.loc.uSize, cw, ch);
    gl.uniform1i(this.loc.uTex, 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const p of this.parts) {
      if (!p.tex) continue;
      gl.bindTexture(gl.TEXTURE_2D, p.tex);
      gl.bindVertexArray(p.vao);
      gl.drawElements(gl.TRIANGLES, p.count, gl.UNSIGNED_INT, 0);
    }
    gl.bindVertexArray(null);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(this.canvas, 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------- son corps posé, son visage dessus

/** Le dessin (1111 × 2000) ramené à l'échelle de l'ancien corps (cadre 240 × 384, pieds à y 349) : même taille à
 *  l'écran, mêmes réglages de position et de visage. */
const FRAME_W = 240, FEET_Y = 349, TOP_Y = 20;
const S = (FEET_Y - TOP_Y) / (SKIN.feet - 53);
const CENTER_X = 575;
export const FROM_DRAWING = new Mat().translate(FRAME_W / 2, FEET_Y).scale(S).translate(-CENTER_X, -SKIN.feet);

/** Les points qui peuvent toucher le sol (pieds, genoux, hanches, mains) : le plus bas se pose sur son appui. */
const GROUND = SKIN.bones.filter((b) => /foot|shin|thigh|hand/.test(b.name));

export function drawSkinned(ctx: CanvasRenderingContext2D, skin: SkinBody, base0: Mat, flip: number, p: Params, t: number, F: FaceConfig,
  walking: number) {
  // en marchant, la « glissade » de l'ancien corps (jambes repliées qui traînent) laisse la place à la vraie marche
  if (walking) p = { ...p, thighL: 0, kneeL: 0, thighR: 0, kneeR: 0, armSpread: 0, hipDrop: 0 };
  // les mêmes poses que son corps d'avant (poseFromParams), sans les corrections propres à l'ancien dessin
  const { pose } = poseFromParams(p, t, {});
  pose.upperArmL = (pose.upperArmL ?? 0) - ARM_L_REST;
  pose.footL = (pose.footL ?? 0) - FOOT_REST.L;
  pose.footR = (pose.footR ?? 0) - FOOT_REST.R;
  const stretch: Pose = {};
  if (walking) {
    // la marche, vue de face : la jambe qui avance vers nous paraît plus courte (cuisse et mollet raccourcis), le
    // genou s'écarte à peine, les bras se balancent à l'opposé, le buste ondule et rebondit un peu
    const ph = t * Math.PI * 2 * 1.6, s = Math.sin(ph), up = (v: number) => Math.max(0, v);
    stretch.thighL = 1 - up(s) * 0.16; stretch.shinL = 1 - up(s) * 0.1;
    stretch.thighR = 1 - up(-s) * 0.16; stretch.shinR = 1 - up(-s) * 0.1;
    pose.thighL = (pose.thighL ?? 0) - up(s) * 4; pose.shinL = (pose.shinL ?? 0) + up(s) * 6;
    pose.thighR = (pose.thighR ?? 0) + up(-s) * 4; pose.shinR = (pose.shinR ?? 0) - up(-s) * 6;
    pose.upperArmL = (pose.upperArmL ?? 0) - s * 7; pose.upperArmR = (pose.upperArmR ?? 0) - s * 7;
    pose.forearmL = (pose.forearmL ?? 0) - s * 4; pose.forearmR = (pose.forearmR ?? 0) - s * 4;
    pose.torso = (pose.torso ?? 0) + s * 1.5; pose.head = (pose.head ?? 0) - s * 1;
  }
  skin.solve(pose, stretch);
  // son point le plus bas reste posé là où ses pieds se posaient (assise, à genoux, penchée…)
  let low = -Infinity;
  for (const b of GROUND) low = Math.max(low, skin.place(b.name, b.end[0], b.end[1]).y, skin.place(b.name, b.pivot[0], b.pivot[1]).y);
  const drop = (SKIN.feet - low) * S;
  const base = base0.translate(0, drop);
  const T = ctx.getTransform();
  skin.draw(ctx, new Mat(T.a, T.b, T.c, T.d, T.e, T.f).mul(base).mul(FROM_DRAWING));

  // son visage vivant sur sa tête : droit, de face, et qui suit la tête quand elle bouge
  const f = SKIN.face, at = skin.place('head', f.x, f.y);
  const [ox, oy] = FROM_DRAWING.apply([at.x, at.y]);
  const [hx, hy] = base.apply([ox, oy]);
  const k = Math.hypot(base.a, base.b);
  const s = (f.dist * S * k * F.faceScale) / (2 * F.eyeSpacing);
  const angle = ((F.faceAngle * Math.PI) / 180 + at.angle) * flip;
  const head = new Mat().translate(hx + F.faceX * s * flip, hy + F.faceY * s).rotate(angle).scale(s * flip, s).translate(0, -F.eyeY);
  drawFace(ctx, head, { ...p, headYaw: 0, turn: 0 }, s, undefined, false);
}
