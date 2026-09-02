// GENERATED FILE. Do not edit this copy.
//
// Written by gen-docs-lib.js from main-site/api/_lib/qr.js.
// Change that file and run:  node gen-docs-lib.js
//
// It exists because Vercel builds each project from its own root directory, so
// this site cannot import the portal's modules. 5h: duplicate them, and keep
// the two copies identical.
//
// Identical. The TOTP enrolment QR is drawn from this site's own function
// and never fetched, which is phase 11 part 4's rule about a credential
// never leaving this build to be rendered, arriving at a sharper case: the
// otpauth URI carries the shared secret in the clear.
//
// Nothing differs from the portal's copy but this banner.
// A QR encoder, because section 15 step 1 asks the site to show the linking
// deep link "and QR" and nothing in this build draws one.
//
// **Why it is written here rather than fetched from somewhere.** The obvious
// shortcut is an image service: hand a URL to a third party and get a PNG back.
// That would send a single use linking token, which is a credential for
// somebody's account, to a company with no relationship to this project, where
// it would sit in an access log. There is no version of that which is
// acceptable, and it is worth writing down because the shortcut looks harmless.
//
// **What it deliberately does not do.** Byte mode only, error correction level
// M, versions 1 to 9. That covers 180 bytes, and the thing being encoded is a
// t.me link with a 43 character token on the end, about 75. Numeric and
// alphanumeric modes would make the code smaller for input this never sees.
// Stopping at version 9 also means the character count is always 8 bits and the
// data placement never has to think about a 16 bit one.
//
// **The output is a matrix, not markup.** `encodeQr` answers rows of '0' and
// '1'. The browser turns that into one SVG path with DOM calls, which keeps the
// build's rule that ts_headline is the only field assigned as markup, and it
// means the QR is not a second image to cache or a second thing to precache.
//
// **How it is checked.** `tests/phase11-test.mjs` encodes a string, rebuilds the
// matrix, and decodes it with jsqr, which is a devDependency and never ships.
// That round trip is the only honest check here: a QR with a wrong mask, a
// wrong block interleave or a single flipped module still looks exactly like a
// QR, and the failure is somebody's phone quietly not scanning it.
//
// The standard is ISO/IEC 18004. The tables below are from it and are the parts
// that cannot be derived.

/* -------------------------------------------------------------------------
 * The tables, for versions 1 to 9 at error correction level M
 * ---------------------------------------------------------------------- */

// [error correction codewords per block, blocks in group 1, data codewords in
// each, blocks in group 2, data codewords in each]. Group 2 is empty for most
// versions and carries one extra codeword per block where it is not.
const BLOCKS_M = {
  1: [10, 1, 16, 0, 0],
  2: [16, 1, 28, 0, 0],
  3: [26, 1, 44, 0, 0],
  4: [18, 2, 32, 0, 0],
  5: [24, 2, 43, 0, 0],
  6: [16, 4, 27, 0, 0],
  7: [18, 4, 31, 0, 0],
  8: [22, 2, 38, 2, 39],
  9: [22, 3, 36, 2, 37],
};

// Where the centres of the alignment patterns go. Version 1 has none.
const ALIGNMENT = {
  1: [],
  2: [6, 18],
  3: [6, 22],
  4: [6, 26],
  5: [6, 30],
  6: [6, 34],
  7: [6, 22, 38],
  8: [6, 24, 42],
  9: [6, 26, 46],
};

// Bits of nothing at the end of the data stream, after the last codeword.
const REMAINDER_BITS = { 1: 0, 2: 7, 3: 7, 4: 7, 5: 7, 6: 7, 7: 0, 8: 0, 9: 0 };

const MAX_VERSION = 9;

// Level M as the two bits the format information carries. Not the same as the
// level's position in any list, which is a common way to get this wrong: the
// order in the standard is L=01, M=00, Q=11, H=10.
const ECC_BITS_M = 0b00;

/* -------------------------------------------------------------------------
 * GF(256), for Reed-Solomon
 * ---------------------------------------------------------------------- */

// The field the standard uses: modulo x^8 + x^4 + x^3 + x^2 + 1, generator 2.
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  // Doubled so a product of two logs can be read without a modulo.
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function gfMultiply(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

/** The generator polynomial for `count` error correction codewords. */
function generatorPolynomial(count) {
  let poly = [1];
  for (let i = 0; i < count; i += 1) {
    // Multiply by (x - α^i), which in this field is (x + α^i).
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMultiply(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

/** The error correction codewords for one block. */
function errorCorrection(data, count) {
  const generator = generatorPolynomial(count);
  const remainder = new Array(count).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let i = 0; i < count; i += 1) {
      remainder[i] ^= gfMultiply(generator[i + 1], factor);
    }
  }

  return remainder;
}

/* -------------------------------------------------------------------------
 * BCH, for the format and version information
 * ---------------------------------------------------------------------- */

function bch(value, generator, bits) {
  let result = value << bits;
  const generatorBits = 32 - Math.clz32(generator);
  while (32 - Math.clz32(result) >= generatorBits) {
    result ^= generator << (32 - Math.clz32(result) - generatorBits);
  }
  return (value << bits) | result;
}

/** The 15 bit format information for a level and a mask. */
function formatBits(mask) {
  const value = (ECC_BITS_M << 3) | mask;
  // The XOR is in the standard and stops an all zero format area, which would
  // otherwise be a valid reading of a blank code.
  return bch(value, 0b101_0011_0111, 10) ^ 0b101_0100_0001_0010;
}

/** The 18 bit version information, for version 7 and above. */
function versionBits(version) {
  return bch(version, 0b1_1111_0010_0101, 12);
}

/* -------------------------------------------------------------------------
 * The data stream
 * ---------------------------------------------------------------------- */

/** Data codewords a version holds, across every block. */
function dataCodewords(version) {
  const [, group1, size1, group2, size2] = BLOCKS_M[version];
  return group1 * size1 + group2 * size2;
}

/**
 * The smallest version that fits, or null.
 *
 * Byte mode costs four bits for the mode and eight for the length, which is why
 * the capacity is two codewords short of the data capacity rather than one.
 */
function versionFor(byteLength) {
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    if (byteLength <= dataCodewords(version) - 2) return version;
  }
  return null;
}

/** Mode, length, payload, terminator, padding: the full data codeword run. */
function buildCodewords(bytes, version) {
  const total = dataCodewords(version);
  const bits = [];

  const push = (value, count) => {
    for (let i = count - 1; i >= 0; i -= 1) bits.push((value >> i) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);

  // Up to four zero bits, and fewer when there is no room for four.
  const terminator = Math.min(4, total * 8 - bits.length);
  push(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }

  // The two pad codewords the standard names, alternating.
  const PAD = [0b1110_1100, 0b0001_0001];
  while (codewords.length < total) codewords.push(PAD[(codewords.length - bits.length / 8) % 2]);

  return codewords;
}

/**
 * Split into blocks, add error correction, and interleave.
 *
 * The interleave is what makes a QR survive a thumb over one corner: taking one
 * codeword from each block in turn spreads every block across the whole symbol,
 * so damage in one place is spread thinly over every block rather than
 * destroying one outright.
 */
function interleave(codewords, version) {
  const [ecCount, group1, size1, group2, size2] = BLOCKS_M[version];

  const blocks = [];
  let offset = 0;
  for (let i = 0; i < group1; i += 1) {
    blocks.push(codewords.slice(offset, offset + size1));
    offset += size1;
  }
  for (let i = 0; i < group2; i += 1) {
    blocks.push(codewords.slice(offset, offset + size2));
    offset += size2;
  }

  const ecBlocks = blocks.map((block) => errorCorrection(block, ecCount));

  const out = [];
  const longest = Math.max(...blocks.map((block) => block.length));
  for (let i = 0; i < longest; i += 1) {
    for (const block of blocks) if (i < block.length) out.push(block[i]);
  }
  for (let i = 0; i < ecCount; i += 1) {
    for (const block of ecBlocks) out.push(block[i]);
  }

  return out;
}

/* -------------------------------------------------------------------------
 * The matrix
 * ---------------------------------------------------------------------- */

function blank(size) {
  return {
    modules: Array.from({ length: size }, () => new Array(size).fill(false)),
    // Function patterns and the reserved areas. Data is never written here, and
    // the mask is never applied here either, which is the half that is easy to
    // forget.
    fixed: Array.from({ length: size }, () => new Array(size).fill(false)),
  };
}

function drawFinder(grid, size, top, left) {
  for (let y = -1; y <= 7; y += 1) {
    for (let x = -1; x <= 7; x += 1) {
      const row = top + y;
      const col = left + x;
      if (row < 0 || row >= size || col < 0 || col >= size) continue;

      const outer = y >= 0 && y <= 6 && (x === 0 || x === 6);
      const sides = x >= 0 && x <= 6 && (y === 0 || y === 6);
      const centre = x >= 2 && x <= 4 && y >= 2 && y <= 4;

      grid.modules[row][col] = outer || sides || centre;
      grid.fixed[row][col] = true;
    }
  }
}

function drawAlignment(grid, size, version) {
  const centres = ALIGNMENT[version];
  for (const row of centres) {
    for (const col of centres) {
      // The three that would sit on a finder are not drawn.
      const onFinder =
        (row === 6 && col === 6) ||
        (row === 6 && col === size - 7) ||
        (row === size - 7 && col === 6);
      if (onFinder) continue;

      for (let y = -2; y <= 2; y += 1) {
        for (let x = -2; x <= 2; x += 1) {
          grid.modules[row + y][col + x] =
            Math.max(Math.abs(x), Math.abs(y)) !== 1;
          grid.fixed[row + y][col + x] = true;
        }
      }
    }
  }
}

function drawTiming(grid, size) {
  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0;
    grid.modules[6][i] = dark;
    grid.fixed[6][i] = true;
    grid.modules[i][6] = dark;
    grid.fixed[i][6] = true;
  }
}

function reserveFormat(grid, size) {
  // The dark module, which is always set and is not part of anything else.
  grid.modules[size - 8][8] = true;
  grid.fixed[size - 8][8] = true;

  for (let i = 0; i <= 8; i += 1) {
    if (!grid.fixed[8][i]) grid.fixed[8][i] = true;
    if (!grid.fixed[i][8]) grid.fixed[i][8] = true;
  }
  for (let i = 0; i < 8; i += 1) {
    grid.fixed[8][size - 1 - i] = true;
    grid.fixed[size - 1 - i][8] = true;
  }
}

function drawVersion(grid, size, version) {
  if (version < 7) return;
  const bits = versionBits(version);

  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >> i) & 1) === 1;
    const row = Math.floor(i / 3);
    const col = size - 11 + (i % 3);
    grid.modules[row][col] = dark;
    grid.fixed[row][col] = true;
    grid.modules[col][row] = dark;
    grid.fixed[col][row] = true;
  }
}

function drawFormat(grid, size, mask) {
  const bits = formatBits(mask);

  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1;

    // The copy beside the top left finder, which skips the timing row and
    // column, and the split copy beside the other two.
    if (i < 6) grid.modules[8][i] = dark;
    else if (i === 6) grid.modules[8][7] = dark;
    else if (i === 7) grid.modules[8][8] = dark;
    else if (i === 8) grid.modules[7][8] = dark;
    else grid.modules[14 - i][8] = dark;

    if (i < 8) grid.modules[8][size - 1 - i] = dark;
    else grid.modules[size - 15 + i][8] = dark;
  }
}

/** The zigzag, two columns at a time, from the bottom right. */
function placeData(grid, size, stream) {
  let index = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is stepped over entirely.
    if (right === 6) right = 5;

    for (let step = 0; step < size; step += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - step : step;

        if (grid.fixed[y][x]) continue;

        let dark = false;
        if (index < stream.length) {
          dark = stream[index] === 1;
          index += 1;
        }
        grid.modules[y][x] = dark;
      }
    }
  }
}

const MASKS = [
  (y, x) => (y + x) % 2 === 0,
  (y) => y % 2 === 0,
  (y, x) => x % 3 === 0,
  (y, x) => (y + x) % 3 === 0,
  (y, x) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (y, x) => ((y * x) % 2) + ((y * x) % 3) === 0,
  (y, x) => (((y * x) % 2) + ((y * x) % 3)) % 2 === 0,
  (y, x) => (((y + x) % 2) + ((y * x) % 3)) % 2 === 0,
];

function applyMask(grid, size, mask) {
  const test = MASKS[mask];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (grid.fixed[y][x]) continue;
      if (test(y, x)) grid.modules[y][x] = !grid.modules[y][x];
    }
  }
}

/**
 * The four penalty rules, added up. Lower is better.
 *
 * They exist to keep a masked symbol from looking like its own function
 * patterns, which is why rule three is worth so much: that bit sequence is the
 * finder pattern's own proportions, and a scanner that finds one in the data
 * has found a finder in the wrong place.
 */
function penalty(grid, size) {
  const { modules } = grid;
  let score = 0;

  // 1. Runs of five or more.
  for (let i = 0; i < size; i += 1) {
    for (const read of [(k) => modules[i][k], (k) => modules[k][i]]) {
      let run = 1;
      for (let k = 1; k < size; k += 1) {
        if (read(k) === read(k - 1)) {
          run += 1;
          if (run === 5) score += 3;
          else if (run > 5) score += 1;
        } else {
          run = 1;
        }
      }
    }
  }

  // 2. Two by two blocks of one colour.
  for (let y = 0; y < size - 1; y += 1) {
    for (let x = 0; x < size - 1; x += 1) {
      const first = modules[y][x];
      if (
        first === modules[y][x + 1] &&
        first === modules[y + 1][x] &&
        first === modules[y + 1][x + 1]
      ) {
        score += 3;
      }
    }
  }

  // 3. The finder-like sequence, in either direction.
  const PATTERNS = [
    [true, false, true, true, true, false, true, false, false, false, false],
    [false, false, false, false, true, false, true, true, true, false, true],
  ];
  for (let i = 0; i < size; i += 1) {
    for (let k = 0; k + 11 <= size; k += 1) {
      for (const pattern of PATTERNS) {
        let row = true;
        let column = true;
        for (let p = 0; p < 11; p += 1) {
          if (modules[i][k + p] !== pattern[p]) row = false;
          if (modules[k + p][i] !== pattern[p]) column = false;
        }
        if (row) score += 40;
        if (column) score += 40;
      }
    }
  }

  // 4. How far from half dark the whole symbol is.
  let dark = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) if (modules[y][x]) dark += 1;
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

function build(version, stream, mask) {
  const size = version * 4 + 17;
  const grid = blank(size);

  drawFinder(grid, size, 0, 0);
  drawFinder(grid, size, 0, size - 7);
  drawFinder(grid, size, size - 7, 0);
  drawAlignment(grid, size, version);
  drawTiming(grid, size);
  reserveFormat(grid, size);
  drawVersion(grid, size, version);

  placeData(grid, size, stream);
  applyMask(grid, size, mask);
  drawFormat(grid, size, mask);

  return grid;
}

/* -------------------------------------------------------------------------
 * The one export
 * ---------------------------------------------------------------------- */

/**
 * Encode text as a QR symbol.
 *
 * @param {string} text
 * @returns {{ version: number, size: number, rows: string[] }} rows of '0'
 *   and '1', one string per row, top to bottom, no quiet zone. The quiet zone
 *   is the drawing's business, since it is padding rather than data.
 */
export function encodeQr(text) {
  const bytes = Array.from(new TextEncoder().encode(String(text)));

  const version = versionFor(bytes.length);
  if (version === null) {
    throw new Error(
      `qr: ${bytes.length} bytes does not fit in version ${MAX_VERSION} at level M`
    );
  }

  const codewords = interleave(buildCodewords(bytes, version), version);

  const stream = [];
  for (const codeword of codewords) {
    for (let i = 7; i >= 0; i -= 1) stream.push((codeword >> i) & 1);
  }
  for (let i = 0; i < REMAINDER_BITS[version]; i += 1) stream.push(0);

  // Every mask is built and scored, and the lowest wins. Picking one and
  // trusting it works most of the time, which is the worst kind of wrong here.
  let best = null;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const grid = build(version, stream, mask);
    const score = penalty(grid, version * 4 + 17);
    if (score < bestScore) {
      bestScore = score;
      best = grid;
    }
  }

  return {
    version,
    size: version * 4 + 17,
    rows: best.modules.map((row) => row.map((dark) => (dark ? '1' : '0')).join('')),
  };
}
