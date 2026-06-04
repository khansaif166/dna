class WorkerDOMMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;

  constructor(init?: number[] | WorkerDOMMatrix) {
    if (Array.isArray(init)) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = [
        init[0] ?? 1,
        init[1] ?? 0,
        init[2] ?? 0,
        init[3] ?? 1,
        init[4] ?? 0,
        init[5] ?? 0,
      ];
      return;
    }

    this.a = init?.a ?? 1;
    this.b = init?.b ?? 0;
    this.c = init?.c ?? 0;
    this.d = init?.d ?? 1;
    this.e = init?.e ?? 0;
    this.f = init?.f ?? 0;
  }

  multiplySelf(other: WorkerDOMMatrix) {
    const next = multiplyMatrices(this, other);
    Object.assign(this, next);
    return this;
  }

  preMultiplySelf(other: WorkerDOMMatrix) {
    const next = multiplyMatrices(other, this);
    Object.assign(this, next);
    return this;
  }

  translate(x = 0, y = 0) {
    return new WorkerDOMMatrix(this).translateSelf(x, y);
  }

  translateSelf(x = 0, y = 0) {
    return this.multiplySelf(new WorkerDOMMatrix([1, 0, 0, 1, x, y]));
  }

  scale(scaleX = 1, scaleY = scaleX) {
    return new WorkerDOMMatrix(this).scaleSelf(scaleX, scaleY);
  }

  scaleSelf(scaleX = 1, scaleY = scaleX) {
    return this.multiplySelf(new WorkerDOMMatrix([scaleX, 0, 0, scaleY, 0, 0]));
  }

  invertSelf() {
    const determinant = this.a * this.d - this.b * this.c;

    if (!determinant) {
      throw new Error('Cannot invert a singular DOMMatrix.');
    }

    const next = new WorkerDOMMatrix([
      this.d / determinant,
      -this.b / determinant,
      -this.c / determinant,
      this.a / determinant,
      (this.c * this.f - this.d * this.e) / determinant,
      (this.b * this.e - this.a * this.f) / determinant,
    ]);
    Object.assign(this, next);
    return this;
  }
}

function multiplyMatrices(left: WorkerDOMMatrix, right: WorkerDOMMatrix) {
  return new WorkerDOMMatrix([
    left.a * right.a + left.c * right.b,
    left.b * right.a + left.d * right.b,
    left.a * right.c + left.c * right.d,
    left.b * right.c + left.d * right.d,
    left.a * right.e + left.c * right.f + left.e,
    left.b * right.e + left.d * right.f + left.f,
  ]);
}

function ensurePdfGlobals() {
  if (!globalThis.DOMMatrix) {
    globalThis.DOMMatrix = WorkerDOMMatrix as unknown as typeof DOMMatrix;
  }
}

export async function loadPdfParse() {
  ensurePdfGlobals();
  return await import('pdf-parse');
}

export async function loadPdfJs() {
  ensurePdfGlobals();
  return await import('pdfjs-dist/legacy/build/pdf.mjs');
}
