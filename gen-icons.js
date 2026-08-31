// Regenerate the app icons from the one master image.
//
//   node gen-icons.js
//
// Reads HLC-source.png at the repo root, which is the untouched 2250 square
// original as the template shipped it, and writes every icon under main-site
// from it:
//
//   HLC-main.png            2250, the og:image and the apple-touch-icon
//   HLC-512.png             512, manifest purpose "any"
//   HLC-192.png             192, manifest purpose "any"
//   HLC-180.png             180, the apple-touch-icon
//   HLC-512-maskable.png    512, purpose "maskable", art at 80%
//   HLC-192-maskable.png    192, purpose "maskable", art at 80%
//   favicon.ico             16, 32, and 48, PNG framed in an ICO container
//
// Why this exists rather than the five files being edited by hand: they have to
// agree. The template shipped them already disagreeing — three icons on mint
// green while the manifest splash was Hello yellow — and five hand edited PNGs
// drift the same way again the first time one of them is touched.
//
// **What it changes.** The artwork itself is not redrawn. Only the plate behind
// it, from the template's mint green to GFTV yellow, per gftv-theme.md's rule
// that brand colours are not invented and phase 10's decision to settle the
// icon background question rather than inherit it.
//
// The recolouring is not a plain colour swap, and the difference is the whole
// reason this is a script. The plate carries soft drop shadows under the
// figure, the briefcase, and the bars, and those shadows are dark green: swap
// only the exact mint and they stay behind as green smudges on a yellow plate.
// So every background pixel is matched as *mint at some brightness* and written
// back as *yellow at that same brightness*, which keeps the shadows as shadows.
//
// **The source is separate from the outputs on purpose.** HLC-main.png is one
// of the five things written, so if this read it as well the first run would
// destroy the only copy of the mint original and the plate colour could never
// be changed again. HLC-source.png sits at the repo root rather than under
// main-site/ so that it is version controlled and not deployed.
//
// Requires the playwright already in devDependencies. There is no image library
// in this repo and this is not a reason to add one: a headless Chromium has a
// canvas, and the whole transform is forty lines of it.

import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, 'main-site');
const MASTER = join(HERE, 'HLC-source.png');

// The template's plate, and what replaces it. #fedc00 is the GFTV yellow that
// manifest.json has been using for background_color since phase 1, so this
// makes the icon agree with the splash screen rather than the other way round.
const MINT = [204, 255, 204];
const YELLOW = [254, 220, 0];

// How far a pixel may sit off the mint-at-some-brightness line and still count
// as plate. Generous enough for the shadows and for the resampling noise in a
// 2250 square master, tight enough that the green bar in the chart, which is a
// saturated green rather than a dark mint, is nowhere near it.
const TOLERANCE = 14;

// The darkest a shadow gets before we stop calling it plate. Below this it is
// artwork.
const MIN_BRIGHTNESS = 0.45;

// The maskable safe zone is a circle of 80% of the icon's width. The master
// already carries its own padding, so scaling the whole square to 80% puts the
// artwork comfortably inside it and lets the plate go full bleed, which is what
// a maskable icon is for: the launcher crops it to whatever shape it likes.
const MASKABLE_SCALE = 0.8;

const OUTPUTS = [
  { file: 'HLC-main.png', size: 2250, maskable: false },
  { file: 'HLC-512.png', size: 512, maskable: false },
  { file: 'HLC-192.png', size: 192, maskable: false },
  // iOS ignores the manifest's icons entirely and reads apple-touch-icon, and
  // every page in this site pointed that at the 2250 square master: half a
  // megabyte fetched to draw a home screen icon 180 pixels wide.
  { file: 'HLC-180.png', size: 180, maskable: false },
  { file: 'HLC-512-maskable.png', size: 512, maskable: true },
  { file: 'HLC-192-maskable.png', size: 192, maskable: true },
];

// The favicon is the same artwork and was on the same mint plate, so it is
// generated here too rather than being the one file left disagreeing.
//
// **One 256 entry, deliberately**, and not the conventional 16/32/48 set. Every
// browser this site supports scales a single large PNG down itself and does it
// well, and one entry that is right beats three that have to be kept in step.
// Changed by hand after the first generation; the constant follows that choice
// so the next run does not quietly undo it.
const FAVICON_SIZES = [256];

/**
 * Pack PNGs into an ICO container.
 *
 * An ICO is a six byte header, a sixteen byte directory entry per image, and
 * then the images themselves. Every browser this site supports reads a PNG
 * inside one, so there is no bitmap encoding to do: the entries point at the
 * PNGs the canvas already produced.
 */
function packIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 is an icon, 2 would be a cursor
  header.writeUInt16LE(images.length, 4);

  const directory = Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach((image, index) => {
    const at = index * 16;
    // 256 is written as 0. Nothing here is 256, but the rule is the format's.
    directory.writeUInt8(image.size === 256 ? 0 : image.size, at);
    directory.writeUInt8(image.size === 256 ? 0 : image.size, at + 1);
    directory.writeUInt8(0, at + 2); // palette size, 0 for truecolour
    directory.writeUInt8(0, at + 3); // reserved
    directory.writeUInt16LE(1, at + 4); // colour planes
    directory.writeUInt16LE(32, at + 6); // bits per pixel
    directory.writeUInt32LE(image.png.length, at + 8);
    directory.writeUInt32LE(offset, at + 12);
    offset += image.png.length;
  });

  return Buffer.concat([header, directory, ...images.map((i) => i.png)]);
}

const master = (await readFile(MASTER)).toString('base64');

const browser = await chromium.launch();
const page = await browser.newPage();

const results = await page.evaluate(
  async ({
    master,
    MINT,
    YELLOW,
    TOLERANCE,
    MIN_BRIGHTNESS,
    MASKABLE_SCALE,
    OUTPUTS,
    FAVICON_SIZES,
  }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${master}`;
    await image.decode();

    const width = image.width;
    const height = image.height;

    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const sctx = source.getContext('2d', { willReadFrequently: true });
    sctx.drawImage(image, 0, 0);

    const pixels = sctx.getImageData(0, 0, width, height);
    const data = pixels.data;

    const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const mintLuma = luma(MINT);

    /**
     * Is this pixel the plate, or a shadow cast on the plate?
     *
     * A shadow on a flat colour is that colour multiplied down, so both cases
     * are "mint at brightness k". Solve for k from the luminance, then check
     * the pixel really does sit on that line rather than merely being about as
     * bright as it.
     */
    function plateBrightness(i) {
      if (data[i + 3] !== 255) return null;
      const k = luma([data[i], data[i + 1], data[i + 2]]) / mintLuma;
      if (k < MIN_BRIGHTNESS || k > 1.06) return null;
      for (let c = 0; c < 3; c += 1) {
        if (Math.abs(data[i + c] - k * MINT[c]) > TOLERANCE) return null;
      }
      return k;
    }

    /**
     * Fill inwards from the border rather than replacing every matching pixel
     * anywhere in the image.
     *
     * Connectivity is the safety net. Anything that happens to match the test
     * but is not joined to the edge — a pale highlight inside the artwork, say
     * — is left exactly as it was, so the worst a wrong tolerance can do is
     * leave a fringe rather than punch a hole through the middle of the figure.
     */
    const seen = new Uint8Array(width * height);
    const stack = [];
    for (let x = 0; x < width; x += 1) {
      stack.push(x, x + (height - 1) * width);
    }
    for (let y = 0; y < height; y += 1) {
      stack.push(y * width, width - 1 + y * width);
    }

    let filled = 0;
    while (stack.length) {
      const p = stack.pop();
      if (seen[p]) continue;
      seen[p] = 1;

      const i = p * 4;
      const k = plateBrightness(i);
      if (k === null) continue;

      data[i] = Math.round(YELLOW[0] * k);
      data[i + 1] = Math.round(YELLOW[1] * k);
      data[i + 2] = Math.round(YELLOW[2] * k);
      filled += 1;

      const x = p % width;
      const y = (p - x) / width;
      if (x > 0) stack.push(p - 1);
      if (x < width - 1) stack.push(p + 1);
      if (y > 0) stack.push(p - width);
      if (y < height - 1) stack.push(p + width);
    }

    sctx.putImageData(pixels, 0, 0);

    // Downscale in halving steps. One drawImage from 2250 to 192 samples far
    // too sparsely and comes out crunchy at exactly the size a launcher shows.
    function scaled(size, inset) {
      let current = source;
      let edge = width;
      while (edge / 2 > size) {
        const half = document.createElement('canvas');
        half.width = half.height = Math.round(edge / 2);
        const hctx = half.getContext('2d');
        hctx.imageSmoothingEnabled = true;
        hctx.imageSmoothingQuality = 'high';
        hctx.drawImage(current, 0, 0, half.width, half.height);
        current = half;
        edge = half.width;
      }

      const out = document.createElement('canvas');
      out.width = out.height = size;
      const octx = out.getContext('2d');
      octx.imageSmoothingEnabled = true;
      octx.imageSmoothingQuality = 'high';

      // The plate goes edge to edge whatever the inset is, so a launcher that
      // crops a maskable icon to a circle never exposes a transparent corner.
      octx.fillStyle = `rgb(${YELLOW[0]}, ${YELLOW[1]}, ${YELLOW[2]})`;
      octx.fillRect(0, 0, size, size);

      const art = Math.round(size * inset);
      const offset = Math.round((size - art) / 2);
      octx.drawImage(current, offset, offset, art, art);
      return out.toDataURL('image/png');
    }

    const written = {};
    for (const output of OUTPUTS) {
      written[output.file] = scaled(
        output.size,
        output.maskable ? MASKABLE_SCALE : 1
      );
    }

    const favicons = FAVICON_SIZES.map((size) => ({ size, url: scaled(size, 1) }));

    return { filled, total: width * height, written, favicons };
  },
  {
    master,
    MINT,
    YELLOW,
    TOLERANCE,
    MIN_BRIGHTNESS,
    MASKABLE_SCALE,
    OUTPUTS,
    FAVICON_SIZES,
  }
);

await browser.close();

const share = ((results.filled / results.total) * 100).toFixed(1);
console.log(`plate recoloured: ${results.filled} pixels, ${share}% of the master`);

/** A data URL from the canvas, back into bytes. */
const decode = (url) => Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');

for (const output of OUTPUTS) {
  const png = decode(results.written[output.file]);
  await writeFile(join(SITE, output.file), png);
  console.log(`  ${output.file.padEnd(24)} ${output.size} square, ${png.length} bytes`);
}

const ico = packIco(
  results.favicons.map((entry) => ({ size: entry.size, png: decode(entry.url) }))
);
await writeFile(join(SITE, 'favicon.ico'), ico);
console.log(
  `  ${'favicon.ico'.padEnd(24)} ${FAVICON_SIZES.join(', ')}, ${ico.length} bytes`
);
