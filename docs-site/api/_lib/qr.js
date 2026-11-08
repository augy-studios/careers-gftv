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

const MAXIMUM_VERSION = 9;

// Level M as the two bits the format information carries. Not the same as the
// level's position in any list, which is a common way to get this wrong: the
// order in the standard is L=01, M=00, Q=11, H=10.
const ERROR_CORRECTION_BITS_M = 0b00;

/* -------------------------------------------------------------------------
 * GF(256), for Reed-Solomon
 * ---------------------------------------------------------------------- */

// The field the standard uses: modulo x^8 + x^4 + x^3 + x^2 + 1, generator 2.
const GALOIS_EXPONENTS = new Uint8Array(512);
const GALOIS_LOGARITHMS = new Uint8Array(256);

(() => {
  let value = 1;
  for (let index = 0; index < 255; index += 1) {
    GALOIS_EXPONENTS[index] = value;
    GALOIS_LOGARITHMS[value] = index;
    value <<= 1;
    if (value & 0x100) value ^= 0x11d;
  }
  // Doubled so a product of two logs can be read without a modulo.
  for (let index = 255; index < 512; index += 1)
    GALOIS_EXPONENTS[index] = GALOIS_EXPONENTS[index - 255];
})();

function galoisFieldMultiply(first, second) {
  if (first === 0 || second === 0) return 0;
  return GALOIS_EXPONENTS[GALOIS_LOGARITHMS[first] + GALOIS_LOGARITHMS[second]];
}

/** The generator polynomial for `count` error correction codewords. */
function generatorPolynomial(count) {
  let polynomial = [1];
  for (let index = 0; index < count; index += 1) {
    // Multiply by (x - α^i), which in this field is (x + α^i).
    const next = new Array(polynomial.length + 1).fill(0);
    for (let bitIndex = 0; bitIndex < polynomial.length; bitIndex += 1) {
      next[bitIndex] ^= polynomial[bitIndex];
      next[bitIndex + 1] ^= galoisFieldMultiply(polynomial[bitIndex], GALOIS_EXPONENTS[index]);
    }
    polynomial = next;
  }
  return polynomial;
}

/** The error correction codewords for one block. */
function errorCorrection(data, count) {
  const generator = generatorPolynomial(count);
  const remainder = new Array(count).fill(0);

  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < count; index += 1) {
      remainder[index] ^= galoisFieldMultiply(generator[index + 1], factor);
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
  const value = (ERROR_CORRECTION_BITS_M << 3) | mask;
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
  const [, firstGroupBlocks, firstGroupBlockSize, secondGroupBlocks, secondGroupBlockSize] =
    BLOCKS_M[version];
  return firstGroupBlocks * firstGroupBlockSize + secondGroupBlocks * secondGroupBlockSize;
}

/**
 * The smallest version that fits, or null.
 *
 * Byte mode costs four bits for the mode and eight for the length, which is why
 * the capacity is two codewords short of the data capacity rather than one.
 */
function versionFor(byteLength) {
  for (let version = 1; version <= MAXIMUM_VERSION; version += 1) {
    if (byteLength <= dataCodewords(version) - 2) return version;
  }
  return null;
}

/** Mode, length, payload, terminator, padding: the full data codeword run. */
function buildCodewords(bytes, version) {
  const total = dataCodewords(version);
  const bits = [];

  const push = (value, count) => {
    for (let index = count - 1; index >= 0; index -= 1) bits.push((value >> index) & 1);
  };

  push(0b0100, 4);
  push(bytes.length, 8);
  for (const byte of bytes) push(byte, 8);

  // Up to four zero bits, and fewer when there is no room for four.
  const terminator = Math.min(4, total * 8 - bits.length);
  push(0, terminator);
  while (bits.length % 8 !== 0) bits.push(0);

  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bitIndex = 0; bitIndex < 8; bitIndex += 1) byte = (byte << 1) | bits[index + bitIndex];
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
  const [
    errorCorrectionCount,
    firstGroupBlocks,
    firstGroupBlockSize,
    secondGroupBlocks,
    secondGroupBlockSize,
  ] = BLOCKS_M[version];

  const blocks = [];
  let offset = 0;
  for (let index = 0; index < firstGroupBlocks; index += 1) {
    blocks.push(codewords.slice(offset, offset + firstGroupBlockSize));
    offset += firstGroupBlockSize;
  }
  for (let index = 0; index < secondGroupBlocks; index += 1) {
    blocks.push(codewords.slice(offset, offset + secondGroupBlockSize));
    offset += secondGroupBlockSize;
  }

  const errorCorrectionBlocks = blocks.map((block) => errorCorrection(block, errorCorrectionCount));

  const out = [];
  const longest = Math.max(...blocks.map((block) => block.length));
  for (let index = 0; index < longest; index += 1) {
    for (const block of blocks) if (index < block.length) out.push(block[index]);
  }
  for (let index = 0; index < errorCorrectionCount; index += 1) {
    for (const block of errorCorrectionBlocks) out.push(block[index]);
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
  // rowOffset and columnOffset run one module past the 7x7 finder on every
  // side, so the white separator around it is reserved too.
  for (let rowOffset = -1; rowOffset <= 7; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 7; columnOffset += 1) {
      const row = top + rowOffset;
      const column = left + columnOffset;
      if (row < 0 || row >= size || column < 0 || column >= size) continue;

      const outer = rowOffset >= 0 && rowOffset <= 6 && (columnOffset === 0 || columnOffset === 6);
      const sides = columnOffset >= 0 && columnOffset <= 6 && (rowOffset === 0 || rowOffset === 6);
      const centre = columnOffset >= 2 && columnOffset <= 4 && rowOffset >= 2 && rowOffset <= 4;

      grid.modules[row][column] = outer || sides || centre;
      grid.fixed[row][column] = true;
    }
  }
}

function drawAlignment(grid, size, version) {
  const centres = ALIGNMENT[version];
  for (const row of centres) {
    for (const column of centres) {
      // The three that would sit on a finder are not drawn.
      const onFinder =
        (row === 6 && column === 6) ||
        (row === 6 && column === size - 7) ||
        (row === size - 7 && column === 6);
      if (onFinder) continue;

      for (let rowOffset = -2; rowOffset <= 2; rowOffset += 1) {
        for (let columnOffset = -2; columnOffset <= 2; columnOffset += 1) {
          grid.modules[row + rowOffset][column + columnOffset] =
            Math.max(Math.abs(columnOffset), Math.abs(rowOffset)) !== 1;
          grid.fixed[row + rowOffset][column + columnOffset] = true;
        }
      }
    }
  }
}

function drawTiming(grid, size) {
  for (let index = 8; index < size - 8; index += 1) {
    const dark = index % 2 === 0;
    grid.modules[6][index] = dark;
    grid.fixed[6][index] = true;
    grid.modules[index][6] = dark;
    grid.fixed[index][6] = true;
  }
}

function reserveFormat(grid, size) {
  // The dark module, which is always set and is not part of anything else.
  grid.modules[size - 8][8] = true;
  grid.fixed[size - 8][8] = true;

  for (let index = 0; index <= 8; index += 1) {
    if (!grid.fixed[8][index]) grid.fixed[8][index] = true;
    if (!grid.fixed[index][8]) grid.fixed[index][8] = true;
  }
  for (let index = 0; index < 8; index += 1) {
    grid.fixed[8][size - 1 - index] = true;
    grid.fixed[size - 1 - index][8] = true;
  }
}

function drawVersion(grid, size, version) {
  if (version < 7) return;
  const bits = versionBits(version);

  for (let index = 0; index < 18; index += 1) {
    const dark = ((bits >> index) & 1) === 1;
    const row = Math.floor(index / 3);
    const column = size - 11 + (index % 3);
    grid.modules[row][column] = dark;
    grid.fixed[row][column] = true;
    grid.modules[column][row] = dark;
    grid.fixed[column][row] = true;
  }
}

function drawFormat(grid, size, mask) {
  const bits = formatBits(mask);

  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >> index) & 1) === 1;

    // The copy beside the top left finder, which skips the timing row and
    // column, and the split copy beside the other two.
    if (index < 6) grid.modules[8][index] = dark;
    else if (index === 6) grid.modules[8][7] = dark;
    else if (index === 7) grid.modules[8][8] = dark;
    else if (index === 8) grid.modules[7][8] = dark;
    else grid.modules[14 - index][8] = dark;

    if (index < 8) grid.modules[8][size - 1 - index] = dark;
    else grid.modules[size - 15 + index][8] = dark;
  }
}

/** The zigzag, two columns at a time, from the bottom right. */
function placeData(grid, size, stream) {
  let index = 0;

  for (let right = size - 1; right >= 1; right -= 2) {
    // Column 6 is the vertical timing pattern and is stepped over entirely.
    if (right === 6) right = 5;

    for (let step = 0; step < size; step += 1) {
      for (let columnOffset = 0; columnOffset < 2; columnOffset += 1) {
        const column = right - columnOffset;
        const upward = ((right + 1) & 2) === 0;
        let row;

        if (upward) {
          row = size - 1 - step;
        } else {
          row = step;
        }

        if (grid.fixed[row][column]) continue;

        let dark = false;
        if (index < stream.length) {
          dark = stream[index] === 1;
          index += 1;
        }
        grid.modules[row][column] = dark;
      }
    }
  }
}

const MASKS = [
  (row, column) => (row + column) % 2 === 0,
  (row) => row % 2 === 0,
  (row, column) => column % 3 === 0,
  (row, column) => (row + column) % 3 === 0,
  (row, column) => (Math.floor(row / 2) + Math.floor(column / 3)) % 2 === 0,
  (row, column) => ((row * column) % 2) + ((row * column) % 3) === 0,
  (row, column) => (((row * column) % 2) + ((row * column) % 3)) % 2 === 0,
  (row, column) => (((row + column) % 2) + ((row * column) % 3)) % 2 === 0,
];

function applyMask(grid, size, mask) {
  const test = MASKS[mask];
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (grid.fixed[row][column]) continue;
      if (test(row, column)) grid.modules[row][column] = !grid.modules[row][column];
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
  for (let index = 0; index < size; index += 1) {
    for (const read of [
      (position) => modules[index][position],
      (position) => modules[position][index],
    ]) {
      let run = 1;
      for (let position = 1; position < size; position += 1) {
        if (read(position) === read(position - 1)) {
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
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const first = modules[row][column];
      if (
        first === modules[row][column + 1] &&
        first === modules[row + 1][column] &&
        first === modules[row + 1][column + 1]
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
  for (let index = 0; index < size; index += 1) {
    for (let position = 0; position + 11 <= size; position += 1) {
      for (const pattern of PATTERNS) {
        let row = true;
        let column = true;
        for (let patternIndex = 0; patternIndex < 11; patternIndex += 1) {
          if (modules[index][position + patternIndex] !== pattern[patternIndex]) row = false;
          if (modules[position + patternIndex][index] !== pattern[patternIndex]) column = false;
        }
        if (row) score += 40;
        if (column) score += 40;
      }
    }
  }

  // 4. How far from half dark the whole symbol is.
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) if (modules[row][column]) dark += 1;
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
      `qr: ${bytes.length} bytes does not fit in version ${MAXIMUM_VERSION} at level M`
    );
  }

  const codewords = interleave(buildCodewords(bytes, version), version);

  const stream = [];
  for (const codeword of codewords) {
    for (let index = 7; index >= 0; index -= 1) stream.push((codeword >> index) & 1);
  }
  for (let index = 0; index < REMAINDER_BITS[version]; index += 1) stream.push(0);

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
    rows: best.modules.map((row) =>
      row
        .map((dark) => {
          if (dark) {
            return '1';
          } else {
            return '0';
          }
        })
        .join('')
    ),
  };
}
