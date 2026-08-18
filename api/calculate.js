function safeNum(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function safeFix(v, d = 2) { return safeNum(v).toFixed(d); }
const num = (n, d = 3) => Number(Number(n).toFixed(d));
const CUTTING_MARGIN = 0.125;

// ==========================================
// 1. FAST FORMULA EVALUATION CACHE
// ==========================================
const FORMULA_CACHE = new Map();
function evaluateFormula(formula, W, H) {
  if (!formula) return NaN;
  let fn = FORMULA_CACHE.get(formula);
  if (!fn) {
    try {
      fn = new Function('W', 'H', 'return ' + formula);
      FORMULA_CACHE.set(formula, fn);
    } catch (e) {
      fn = () => NaN;
      FORMULA_CACHE.set(formula, fn);
    }
  }
  try {
    return num(fn(W, H));
  } catch (e) {
    return NaN;
  }
}

// ==========================================
// 2. ULTRA-FAST SUT & OFFSET PARSERS
// ==========================================
function parseSutToken(str, unitMode = 'inch') {
  if (!str && str !== 0) return 0;
  if (typeof str === 'number') return str;
  const s = String(str).trim();
  if (!s) return 0;
  if (unitMode === 'mm') {
    const val = parseFloat(s);
    return isNaN(val) ? 0 : val / 25.4;
  }

  const dot1 = s.indexOf('.');
  if (dot1 !== -1) {
    const dot2 = s.indexOf('.', dot1 + 1);
    if (dot2 !== -1) {
      const doubleDotMatch = s.match(/^(\d+)\.(\d)\.5$/);
      if (doubleDotMatch) {
        return parseInt(doubleDotMatch[1], 10) + ((parseInt(doubleDotMatch[2], 10) + 0.5) / 8);
      }
    } else {
      const singleDotMatch = s.match(/^(\d+)\.(\d)$/);
      if (singleDotMatch) {
        const sut = parseInt(singleDotMatch[2], 10);
        if (sut >= 0 && sut <= 7) return parseInt(singleDotMatch[1], 10) + (sut / 8);
      }
    }
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}

function parseSutOffset(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const s = String(val).trim();
  const isNeg = s.charCodeAt(0) === 45; // '-'
  const clean = isNeg ? s.slice(1) : s;
  const parts = clean.split('.');
  if (parts.length === 2) {
    const inch = parseInt(parts[0], 10) || 0;
    const dec = parts[1];
    let sut = 0;
    if (dec.length === 1) {
      sut = parseInt(dec, 10);
      if (sut >= 0 && sut <= 7) return isNeg ? -(inch + (sut / 8)) : (inch + (sut / 8));
    } else if (dec === '25' || dec === '2') return isNeg ? -(inch + 0.25) : (inch + 0.25);
    else if (dec === '75' || dec === '6') return isNeg ? -(inch + 0.75) : (inch + 0.75);
    else if (dec === '125' || dec === '1') return isNeg ? -(inch + 0.125) : (inch + 0.125);
    else if (dec === '375' || dec === '3') return isNeg ? -(inch + 0.375) : (inch + 0.375);
    else if (dec === '625' || dec === '5') return isNeg ? -(inch + 0.625) : (inch + 0.625);
    else if (dec === '875' || dec === '7') return isNeg ? -(inch + 0.875) : (inch + 0.875);
  }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function fmtEighthDigits(n) {
  if (n == null || isNaN(n)) return '';
  const whole = Math.floor(n);
  const dec = num(n - whole, 4);
  const sut16 = Math.round(dec * 16);
  if (sut16 === 0) return String(whole);
  if (sut16 % 2 === 0) return `${whole}.${sut16 / 2}`;
  return `${whole}.${Math.floor(sut16 / 2)}½`;
}

function fmtLength(n, unitMode = 'inch') {
  if (n == null || isNaN(n)) return '';
  if (unitMode === 'mm') return `${num(n * 25.4, 1)} mm`;
  return fmtEighthDigits(n);
}

function mapToProfileType(key) {
  if (key.startsWith('Shutter')) return 'Shutter';
  if (key.startsWith('BearingBottom')) return 'BearingBottom';
  if (key.startsWith('TrackStrip')) return 'TrackStrip';
  if (key.startsWith('TopBottomTrack')) return 'TopBottomTrack';
  if (key.startsWith('SideTrack')) return 'SideTrack';
  return key;
}

function isTrackProfile(key) {
  if (!key) return false;
  const t = String(key).replace(/\s*\([^\)]+\)$/, '').trim();
  const mapped = mapToProfileType(t);
  return mapped === 'Track' || mapped === 'TopTrack' || mapped === 'BottomTrack' || mapped === 'TopBottomTrack' || mapped === 'SideTrack';
}

function roundToEighth(v) {
  if (v == null || isNaN(v)) return 0;
  const whole = Math.floor(v);
  const dec = v - whole;
  const sut16 = Math.round(dec * 16);
  return num(whole + (sut16 / 16), 4);
}

function applySutRounding(valInInches, profileType, isWidth) {
  if (valInInches == null || isNaN(valInInches)) return 0;
  if (isTrackProfile(profileType)) return roundToEighth(valInInches);
  const totalSut = valInInches * 8;
  const wholeSut = Math.floor(totalSut + 0.00001);
  const fracSut = totalSut - wholeSut;
  if (Math.abs(fracSut - 0.5) < 0.01) {
    return isWidth ? wholeSut / 8 : (wholeSut + 1) / 8;
  }
  return Math.round(totalSut) / 8;
}

// ==========================================
// 3. CONFIG & DEFAULTS
// ==========================================
const DEFAULT_RULES_CONFIG = {
  D2: { arw: 500, lr: 100, rubberWtFt: 0.025, rubberRate: 160, glassQty: 2, glassW_offset: -4.1, glassH_offset: -4.1, ShutterW: { formula: 'W / 2', qty: 4 }, ShutterH: { formula: 'H - 2.6', qty: 4 }, Interlock: { formula: 'H - 2.6', qty: 2 } },
  D3: { arw: 700, lr: 120, jaliRate: 30, rubberWtFt: 0.025, rubberRate: 160, glassQty: 2, glassW_offset: -4.1, glassH_offset: -4.1, ShutterW: { formula: 'W / 2', qty: 6 }, ShutterH: { formula: 'H - 2.6', qty: 6 }, Interlock: { formula: 'H - 2.6', qty: 2 } },
  S2: { arw: 1000, lr: 130, rubberWtFt: 0.025, rubberRate: 160, glassQty: 2, glassW_offset: -1.6, glassH_offset: -4.1, ShutterW: { formula: '(W - 4) / 2', qty: 4 }, ShutterH: { formula: 'H - 2.6', qty: 2 }, Interlock: { formula: 'H - 2.6', qty: 2 }, TrackStrip: { formula: 'W - 3', qty: 2, stockLen: 192.5, rate: 800 } },
  S3: { arw: 1500, lr: 150, jaliRate: 30, rubberWtFt: 0.025, rubberRate: 160, glassQty: 2, glassW_offset: -1.6, glassH_offset: -4.1, ShutterW: { formula: '(W - 4) / 2', qty: 6 }, ShutterH: { formula: 'H - 2.6', qty: 3 }, Interlock: { formula: 'H - 2.6', qty: 3 }, TrackStrip: { formula: 'W - 3', qty: 3, stockLen: 192.5, rate: 800 } },
  N2: { arw: 200, lr: 90, rubberWtFt: 0.025, rubberRate: 160, glassQty: 2, glassW_offset: 0.5, glassH_offset: -2.5, BearingBottomW: { formula: '(W - 6.2) / 2', qty: 4 }, Handle: { formula: 'H - 1.7', qty: 2 }, Interlock: { formula: 'H - 1.7', qty: 2 } },
  N3: { arw: 300, lr: 100, jaliRate: 30, rubberWtFt: 0.025, rubberRate: 160, glassQty: 2, glassW_offset: 0.5, glassH_offset: -2.5, BearingBottomW: { formula: '(W - 6.2) / 2', qty: 6 }, Handle: { formula: 'H - 1.7', qty: 3 }, Interlock: { formula: 'H - 1.7', qty: 3 } }
};

const DEFAULT_WEIGHTS = {
  D2: { Track: 6, Shutter: 3.2, Interlock: 1.8 },
  D3: { Track: 6, Shutter: 3.2, Interlock: 1.8 },
  S2: { Track: 6, Shutter: 3.2, Interlock: 1.8, TrackStrip: 1.5 },
  S3: { Track: 6, Shutter: 3.2, Interlock: 1.8, TrackStrip: 1.5 },
  N2: { TopTrack: 2.8, BottomTrack: 2.5, BearingBottom: 2, Handle: 1.5, Interlock: 1.5 },
  N3: { TopTrack: 2.8, BottomTrack: 2.5, BearingBottom: 2, Handle: 1.5, Interlock: 1.5 },
  Pipes: { Pipes: 2.15 }
};

const FIXED_TRACK_RULES = {
  D2: { Track: ['W', 'W', 'H', 'H'] },
  D3: { Track: ['W', 'W', 'H', 'H'] },
  S2: { Track: ['W', 'W', 'H', 'H'] },
  S3: { Track: ['W', 'W', 'H', 'H'] },
  N2: { TopTrack: ['W', 'H', 'H'], BottomTrack: ['W'] },
  N3: { TopTrack: ['W', 'H', 'H'], BottomTrack: ['W'] }
};

function getCurrentRulesConfig(mode, customRules = {}) {
  const isBuiltIn = ['D2', 'D3', 'S2', 'S3', 'N2', 'N3'].includes(mode);
  const defaults = isBuiltIn ? (DEFAULT_RULES_CONFIG[mode] || DEFAULT_RULES_CONFIG.D3) : {};
  const custom = customRules[mode] || {};

  const res = { ...defaults };
  for (const key in defaults) {
    if (typeof defaults[key] === 'object' && defaults[key] !== null) {
      res[key] = { ...defaults[key] };
    }
  }

  for (const key in custom) {
    if (typeof custom[key] === 'object' && custom[key] !== null && !Array.isArray(custom[key])) {
      res[key] = { ...(res[key] || {}), ...custom[key] };
    } else {
      res[key] = custom[key];
    }
  }

  res.arw = safeNum(res.arw ?? defaults.arw);
  res.lr = safeNum(res.lr ?? defaults.lr);
  res.jaliRate = safeNum(res.jaliRate ?? defaults.jaliRate);
  res.rubberWtFt = safeNum(res.rubberWtFt ?? defaults.rubberWtFt) || 0.025;
  res.rubberRate = safeNum(res.rubberRate ?? defaults.rubberRate) || 160;
  res.glassQty = safeNum(res.glassQty ?? defaults.glassQty) || 2;
  return res;
}

function getModeFamily(mode) {
  const c = mode.charCodeAt(0);
  if (c === 68 || c === 100) return 'D-Series';
  if (c === 78 || c === 110) return 'N-Series';
  if (c === 83 || c === 115) return 'S-Series';
  return mode.toUpperCase();
}

function getWeight(mode, category, storedWeights = {}) {
  const m = category.match(/\(([A-Za-z0-9\-]+)\)$/);
  let type = category.replace(/\s*\([^\)]+\)$/, '').trim();
  let activeMode = mode;
  if (m) {
    const tag = m[1].toUpperCase();
    if (tag.endsWith('-SERIES')) {
      const familyPrefix = tag.charAt(0);
      activeMode = (mode.startsWith(familyPrefix)) ? mode : `${familyPrefix}2`;
    } else { activeMode = tag; }
  }
  const mapped = mapToProfileType(type);
  if (mapped === "Pipes") {
    const val = storedWeights.Pipes?.Pipes;
    return (val !== undefined && val !== "") ? safeNum(val) : DEFAULT_WEIGHTS.Pipes.Pipes;
  }
  const modeObj = storedWeights[activeMode] || {};
  if (modeObj[mapped] !== undefined && modeObj[mapped] !== "") return safeNum(modeObj[mapped]);
  const defObj = DEFAULT_WEIGHTS[activeMode] || DEFAULT_WEIGHTS.D3 || {};
  return safeNum(defObj[mapped] || 2.5);
}

function getWindowPiecesAndGlass(W, H, mode, rules) {
  const pieces = {};
  const originalLengths = {};
  const W_shutter = applySutRounding(W, 'non-track', true);
  const H_shutter = applySutRounding(H, 'non-track', false);

  const isBuiltIn = (mode === 'D2' || mode === 'D3' || mode === 'S2' || mode === 'S3' || mode === 'N2' || mode === 'N3');
  const included = rules.includedProfiles;

  for (const key in rules) {
    if (key === 'glassQty' || key === 'glassW_offset' || key === 'glassH_offset' ||
        key === 'glassW' || key === 'glassH' || key === 'arw' || key === 'lr' ||
        key === 'jaliRate' || key === 'rubberWtFt' || key === 'rubberRate' ||
        key === 'hasJali' || key === 'includedProfiles' || key === 'trackType') continue;

    if (!isBuiltIn && Array.isArray(included) && !included.includes(key)) continue;

    const rule = rules[key];
    if (typeof rule === 'object' && rule.formula && rule.qty > 0) {
      let length = evaluateFormula(rule.formula, W_shutter, H_shutter);
      if (isNaN(length)) continue;
      const isW = rule.formula.indexOf('W') !== -1 || rule.formula.indexOf('w') !== -1;
      length = applySutRounding(length, key, isW);
      originalLengths[key] = num(length);
      if (!isNaN(length) && length > 0) length += CUTTING_MARGIN;
      const finalLength = applySutRounding(length, key, isW);
      if (finalLength > 0) pieces[key] = Array(parseInt(rule.qty, 10)).fill(finalLength);
    }
  }

  let trackRulesToUse = {};
  if (isBuiltIn) {
    trackRulesToUse = FIXED_TRACK_RULES[mode] || {};
  } else {
    const trackOption = rules.trackType || 'sameOuter';
    if (trackOption === 'sameOuter') {
      trackRulesToUse = { Track: ['W', 'W', 'H', 'H'] };
    } else if (trackOption === 'topSidesBottom') {
      trackRulesToUse = { TopTrack: ['W', 'H', 'H'], BottomTrack: ['W'] };
    } else if (trackOption === 'topBottomSides') {
      trackRulesToUse = { TopBottomTrack: ['W', 'W'], SideTrack: ['H', 'H'] };
    }
  }

  for (const key in trackRulesToUse) {
    const arr = trackRulesToUse[key];
    const lenArr = [];
    const origArr = [];
    for (let i = 0; i < arr.length; i++) {
      const formula = arr[i];
      let length = (formula === 'W') ? W : H;
      origArr.push(num(length));
      if (!isNaN(length) && length > 0) length += CUTTING_MARGIN;
      const fLen = applySutRounding(length, key, true);
      if (fLen > 0) lenArr.push(fLen);
    }
    originalLengths[key] = origArr;
    pieces[key] = lenArr;
  }

  let shutterW_val = evaluateFormula(rules.ShutterW?.formula || rules.BearingBottomW?.formula || 'W / 2', W_shutter, H_shutter);
  let shutterH_val = evaluateFormula(rules.ShutterH?.formula || rules.Handle?.formula || 'H', W_shutter, H_shutter);

  const rawGlassW = safeNum(shutterW_val) + parseSutOffset(rules.glassW_offset ?? -4.1);
  const rawGlassH = safeNum(shutterH_val) + parseSutOffset(rules.glassH_offset ?? -4.1);

  const g = {
    w: applySutRounding(rawGlassW, 'Glass', true),
    h: applySutRounding(rawGlassH, 'Glass', false),
    qty: rules.glassQty || 2
  };
  return { pieces, glass: g, originalLengths };
}

function assignFromStock(required, stockPieces) {
  const req = required.slice().sort((a, b) => b.len - a.len);
  const stock = stockPieces.map(v => ({ len: v, originalLength: v, cuts: [] }));
  const usedFromStockGrouped = [];
  const remaining = [];

  for (let i = 0; i < req.length; i++) {
    const cut = req[i];
    let best = -1, bestLeft = Infinity;
    for (let j = 0; j < stock.length; j++) {
      if (stock[j].len >= cut.len) {
        const left = num(stock[j].len - cut.len);
        if (left < bestLeft) {
          bestLeft = left;
          best = j;
          if (left === 0) break;
        }
      }
    }
    if (best >= 0) {
      stock[best].len = num(stock[best].len - cut.len);
      stock[best].cuts.push(cut);
    } else {
      remaining.push(cut);
    }
  }

  for (let i = 0; i < stock.length; i++) {
    const s = stock[i];
    if (s.cuts.length > 0) usedFromStockGrouped.push({ originalLength: s.originalLength, leftover: s.len, cuts: s.cuts });
  }
  return { usedFromStockGrouped, remainingReq: remaining.sort((a, b) => b.len - a.len) };
}

// ==========================================
// 4. ULTRA FAST SEGMENT-TREE BIN PACKING (O(N log M))
// ==========================================
function optimizeMinWaste(cuts, stockLen) {
  if (!cuts || cuts.length === 0) return [];
  const SCALE = 1000;
  const targetInt = Math.round(stockLen * SCALE);
  const items = cuts.slice().sort((a, b) => b.len - a.len);

  let treeSize = 1;
  while (treeSize <= targetInt + 1) treeSize <<= 1;
  const segTree = new Int32Array(treeSize * 2);

  const bucketBins = new Array(targetInt + 1);
  for (let i = 0; i <= targetInt; i++) bucketBins[i] = [];

  function updateTree(val, delta) {
    let idx = treeSize + val;
    segTree[idx] += delta;
    for (idx >>= 1; idx > 0; idx >>= 1) {
      segTree[idx] = segTree[idx << 1] + segTree[(idx << 1) | 1];
    }
  }

  function queryBestFit(node, l, r, minCap) {
    if (segTree[node] === 0 || r < minCap) return -1;
    if (l === r) return l;
    const mid = (l + r) >> 1;
    if (mid >= minCap && segTree[node << 1] > 0) {
      const res = queryBestFit(node << 1, l, mid, minCap);
      if (res !== -1) return res;
    }
    return queryBestFit((node << 1) | 1, mid + 1, r, minCap);
  }

  const bins = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemLenInt = Math.round(item.len * SCALE);
    if (itemLenInt > targetInt) {
      bins.push({ cuts: [item], used: num(item.len), waste: 0 });
      continue;
    }

    const bestRemInt = queryBestFit(1, 0, treeSize - 1, itemLenInt);

    if (bestRemInt !== -1) {
      const binList = bucketBins[bestRemInt];
      const bin = binList.pop();
      updateTree(bestRemInt, -1);

      bin.cuts.push(item);
      bin.used = num(bin.used + item.len);
      bin.waste = num(stockLen - bin.used);

      const newRemInt = bestRemInt - itemLenInt;
      bucketBins[newRemInt].push(bin);
      updateTree(newRemInt, 1);
    } else {
      const newBin = { cuts: [item], used: num(item.len), waste: num(stockLen - item.len) };
      bins.push(newBin);
      const newRemInt = targetInt - itemLenInt;
      bucketBins[newRemInt].push(newBin);
      updateTree(newRemInt, 1);
    }
  }

  return bins;
}

let SHARED_DP_BUFFER = null;
let SHARED_DP_CAPACITY = 0;
function getSharedDpBuffer(size) {
  if (!SHARED_DP_BUFFER || SHARED_DP_CAPACITY < size) {
    SHARED_DP_CAPACITY = Math.max(size, SHARED_DP_CAPACITY * 2, 65536);
    SHARED_DP_BUFFER = new Int32Array(SHARED_DP_CAPACITY);
  }
  return SHARED_DP_BUFFER;
}

function bestFitSubsetIndices(items, stockLen, scale = 1000) {
  const target = Math.round(stockLen * scale);
  const n = items.length;
  const ints = new Int32Array(n);
  for (let i = 0; i < n; i++) ints[i] = Math.round(items[i].len * scale);

  const dp = getSharedDpBuffer(target + 1);
  dp.fill(-1, 0, target + 1);
  dp[0] = -2;

  for (let i = 0; i < n; i++) {
    const val = ints[i];
    if (val > target) continue;
    for (let s = target; s >= val; s--) {
      if (dp[s] === -1 && dp[s - val] !== -1) {
        dp[s] = i;
      }
    }
  }

  let best = -1;
  for (let s = target; s >= 0; s--) {
    if (dp[s] !== -1) { best = s; break; }
  }

  if (best <= 0) {
    let ix = -1, mx = -1;
    for (let i = 0; i < n; i++) {
      if (ints[i] <= target && ints[i] > mx) {
        mx = ints[i];
        ix = i;
      }
    }
    return ix === -1 ? [] : [ix];
  }

  const chosen = [];
  let cur = best;
  while (cur > 0) {
    const i = dp[cur];
    if (i < 0) break;
    chosen.push(i);
    cur -= ints[i];
  }
  return chosen;
}

function optimizeMinBars(cuts, stockLen) {
  let items = cuts.slice();
  const bins = [];
  while (items.length) {
    const idxs = bestFitSubsetIndices(items, stockLen);
    if (!idxs.length) {
      const one = items.shift();
      bins.push({ cuts: [one], used: num(one.len), waste: num(stockLen - one.len) });
      continue;
    }
    idxs.sort((a, b) => b - a);
    const pack = [];
    let used = 0;
    for (let i = 0; i < idxs.length; i++) {
      const it = items.splice(idxs[i], 1)[0];
      pack.push(it);
      used += it.len;
    }
    used = num(used);
    bins.push({ cuts: pack, used, waste: num(stockLen - used) });
  }
  return bins;
}

// ==========================================
// 5. SQFT CALCULATIONS
// ==========================================
function roundWindowStep6(val) {
  const base = Math.floor(val / 6) * 6;
  return (val <= base + 0.875) ? base : base + 6;
}

function roundWindowStep3(val) {
  const base = Math.floor(val / 3) * 3;
  return (val <= base + 0.875) ? base : base + 3;
}

function windowSqFtSingle(w, h, mode = '6step') {
  if (mode === 'inch') return (w * h) / 144;
  if (mode === '3step') return (roundWindowStep3(w) * roundWindowStep3(h)) / 144;
  return (roundWindowStep6(w) * roundWindowStep6(h)) / 144;
}

function roundGlassStep(val) {
  const base = Math.floor(val / 6) * 6;
  return (val % 6 === 0) ? base : base + 6;
}
function glassSqFt(w, h) { return (roundGlassStep(w) * roundGlassStep(h)) / 144; }
function glassRunningFeet(w, h, qty = 2) { return ((w + h) * 2 / 12) * qty; }

// ==========================================
// 6. MAIN SERVERLESS / API HANDLER
// ==========================================
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(400).json({ error: 'Only POST allowed' });

  try {
    const {
      sizesRaw = '', pipeSizesRaw = '', defaultMode = 'D3',
      stockLen = 192.5, pipeStockLen = 192.5, unitMode = 'inch',
      mrc = 520, gr = 60, sqftMode = '6step',
      customRules = {}, weights = {}, stockMap = {}, optStrategy = {}
    } = req.body || {};

    let windowCounter = 1;
    const sizes = [];
    if (sizesRaw) {
      const lines = sizesRaw.split(/\n+/g);
      for (let l = 0; l < lines.length; l++) {
        const line = lines[l].trim();
        if (!line) continue;
        const m = line.match(/^\s*([\d\.]+)\s*[\*xX×]\s*([\d\.]+)(?:\s*\((.*?)\))?\s*$/);
        if (!m) continue;
        const w = parseSutToken(m[1], unitMode);
        const h = parseSutToken(m[2], unitMode);
        if (isNaN(w) || isNaN(h) || w <= 0 || h <= 0) continue;

        let q = 1, mode = defaultMode;
        if (m[3]) {
          const tag = m[3].trim();
          const parsedTag = tag.match(/^(\d+)?\s*([a-zA-Z0-9_\-]+)?$/);
          if (parsedTag) {
            if (parsedTag[1]) q = parseInt(parsedTag[1], 10);
            if (parsedTag[2] && !/^\d+$/.test(parsedTag[2])) mode = parsedTag[2].toUpperCase();
          }
        }
        for (let k = 0; k < q; k++) {
          sizes.push({ w, h, id: windowCounter++, mode });
        }
      }
    }

    const piecesByType = {};
    const glasses = [];
    const windowCutDetails = [];

    // Precompute window modes & categories in O(1)
    const modeSet = new Set();
    const familySet = new Set();
    for (let i = 0; i < sizes.length; i++) {
      const m = sizes[i].mode || defaultMode;
      modeSet.add(m);
      familySet.add(getModeFamily(m));
    }
    const isMultiFamily = familySet.size > 1;

    const categoryCache = new Map();
    function getFastCutCategory(key, windowMode) {
      const cacheKey = `${key}_${windowMode}`;
      let cat = categoryCache.get(cacheKey);
      if (cat) return cat;

      const type = mapToProfileType(key);
      const family = getModeFamily(windowMode);

      if (type === 'Track' || type === 'TopTrack' || type === 'BottomTrack' || type === 'TopBottomTrack' || type === 'SideTrack') {
        let hasMultipleModesInFamily = false;
        for (const m of modeSet) {
          if (getModeFamily(m) === family && m !== windowMode) {
            hasMultipleModesInFamily = true;
            break;
          }
        }
        if (hasMultipleModesInFamily || isMultiFamily) cat = `${type} (${windowMode})`;
        else cat = type;
      } else if (isMultiFamily) {
        cat = `${type} (${family})`;
      } else {
        cat = type;
      }
      categoryCache.set(cacheKey, cat);
      return cat;
    }

    const rulesCache = {};
    function getRules(m) {
      if (!rulesCache[m]) rulesCache[m] = getCurrentRulesConfig(m, customRules);
      return rulesCache[m];
    }

    let arwCost = 0, laborCost = 0, jaliCost = 0, totalRubberCost = 0;
    let totalWindowSqFt = 0;
    let totalGlassSqFt = 0;

    // 1. SINGLE-PASS PROCESSING
    for (let i = 0; i < sizes.length; i++) {
      const sz = sizes[i];
      const W = num(sz.w), H = num(sz.h);
      const winMode = sz.mode || defaultMode;
      const rules = getRules(winMode);

      const { pieces: pc, glass: g, originalLengths } = getWindowPiecesAndGlass(W, H, winMode, rules);

      const singleGlassSq = glassSqFt(g.w, g.h) * g.qty;
      const winSq = windowSqFtSingle(W, H, sqftMode);

      totalWindowSqFt += winSq;
      totalGlassSqFt += singleGlassSq;

      totalRubberCost += (glassRunningFeet(g.w || 0, g.h || 0, g.qty || 2) * (rules.rubberWtFt || 0.025)) * (rules.rubberRate || 160);
      arwCost += safeNum(rules.arw);
      laborCost += safeNum(rules.lr) * winSq;
      if (rules.jaliRate) jaliCost += safeNum(rules.jaliRate) * winSq;

      glasses.push({
        window: sz.id,
        widthFmt: fmtLength(g.w, unitMode),
        heightFmt: fmtLength(g.h, unitMode),
        qty: g.qty,
        rawW: W,
        rawH: H,
        mode: winMode,
        totalGlassSq: safeFix(singleGlassSq),
        winSqFt: safeFix(winSq),
        sizeFmt: `${fmtLength(W, unitMode)} x ${fmtLength(H, unitMode)}`
      });

      const formattedOrig = {};
      for (const pk in originalLengths) {
        const val = originalLengths[pk];
        formattedOrig[pk] = Array.isArray(val) ? val.map(v => fmtLength(v, unitMode)).join(', ') : fmtLength(val, unitMode);
      }

      windowCutDetails.push({
        id: `W${sz.id}`,
        mode: winMode,
        W: fmtLength(W, unitMode),
        H: fmtLength(H, unitMode),
        origFmt: formattedOrig
      });

      for (const key in pc) {
        const arr = pc[key];
        const category = getFastCutCategory(key, winMode);
        if (!piecesByType[category]) piecesByType[category] = [];
        const orig = originalLengths[key];
        const isArr = Array.isArray(orig);
        const origLen = isArr ? orig.length : 1;

        for (let a = 0; a < arr.length; a++) {
          const cutLen = arr[a];
          const origVal = isArr ? orig[a % origLen] : orig;
          piecesByType[category].push({
            len: cutLen,
            id: `W${sz.id}`,
            winMode: winMode,
            originalLen: origVal,
            origFmt: fmtLength(origVal, unitMode)
          });
        }
      }
    }

    // 2. PROCESS PIPES
    if (pipeSizesRaw) {
      const pLines = pipeSizesRaw.split(/\n+/g);
      for (let pIdx = 0; pIdx < pLines.length; pIdx++) {
        const line = pLines[pIdx].trim();
        if (!line) continue;
        const m = line.match(/^([\d\.]+)(?:\s*(?:[\*\(\(xX×,\-])\s*(\d+)\)?)?$/);
        let len = 0, qty = 1;
        if (m) {
          len = parseSutToken(m[1], unitMode);
          qty = m[2] ? parseInt(m[2], 10) || 1 : 1;
        } else {
          const parts = line.split(/[\s\*\(\)xX×,\-]+/);
          len = parseSutToken(parts[0], unitMode);
          qty = parts[1] ? parseInt(parts[1], 10) || 1 : 1;
        }
        if (isNaN(len) || len <= 0) continue;

        if (!piecesByType['Pipes']) piecesByType['Pipes'] = [];
        for (let q = 0; q < qty; q++) {
          let cutLen = len;
          if (cutLen > 0) cutLen += CUTTING_MARGIN;
          piecesByType['Pipes'].push({
            len: cutLen,
            id: `P${pIdx + 1}`,
            winMode: 'Pipes',
            originalLen: len,
            origFmt: fmtLength(len, unitMode)
          });
        }
      }
    }

    // 3. CUT PLAN OPTIMIZATION
    const cutPlans = {};
    let grandBars = 0;
    let grandWeight = 0;
    let trackStripTotalCost = 0;
    const barSummaryRows = [];

    const categories = Object.keys(piecesByType);
    for (let c = 0; c < categories.length; c++) {
      const type = categories[c];
      const cuts = piecesByType[type];
      if (!cuts || cuts.length === 0) continue;

      const stockLengthToUse = (type === 'Pipes') ? pipeStockLen : stockLen;
      const stockArr = (stockMap[type] || []).slice().sort((a, b) => b - a);
      const af = assignFromStock(cuts, stockArr);

      const strategy = optStrategy[type] || 'minWaste';
      const bins = (strategy === 'minBars')
        ? optimizeMinBars(af.remainingReq, stockLengthToUse)
        : optimizeMinWaste(af.remainingReq, stockLengthToUse);

      const formattedBins = new Array(bins.length);
      for (let b = 0; b < bins.length; b++) {
        const bin = bins[b];
        formattedBins[b] = {
          usedFmt: fmtLength(bin.used, unitMode),
          wasteFmt: fmtLength(stockLengthToUse - bin.used, unitMode),
          cutsStr: bin.cuts.map(cut => `${fmtLength(cut.originalLen, unitMode)} (${cut.id})`).join(", ")
        };
      }

      const formattedStockGrouped = new Array(af.usedFromStockGrouped.length);
      for (let u = 0; u < af.usedFromStockGrouped.length; u++) {
        const stockItem = af.usedFromStockGrouped[u];
        formattedStockGrouped[u] = {
          origFmt: fmtLength(stockItem.originalLength, unitMode),
          leftFmt: fmtLength(stockItem.leftover, unitMode),
          cutsStr: stockItem.cuts.map(cut => `${fmtLength(cut.originalLen, unitMode)} (${cut.id})`).join(", ")
        };
      }

      cutPlans[type] = {
        usedFromStock: formattedStockGrouped,
        bins: formattedBins,
        stockLenFmt: fmtLength(stockLengthToUse, unitMode)
      };

      const bars = bins.length;
      const kgPerBar = getWeight(defaultMode, type, weights);
      const totalKg = bars * kgPerBar;
      grandBars += bars;
      grandWeight += totalKg;
      barSummaryRows.push([type, `${bars} Bars`, `${safeFix(kgPerBar, 3)} kg`, `${safeFix(totalKg, 3)} kg`]);
    }

    const windowsCount = sizes.length;
    const glassCost = safeNum(totalGlassSqFt * gr);
    const weightCost = safeNum(mrc * grandWeight);
    const grandTotal = safeNum(weightCost + glassCost + arwCost + laborCost + jaliCost + trackStripTotalCost + totalRubberCost);
    const avgRatePerSqFt = totalWindowSqFt ? grandTotal / totalWindowSqFt : 0;

    return res.status(200).json({
      status: 'success',
      data: {
        sizes: glasses,
        windowCutDetails,
        cutPlans,
        barSummary: { rows: barSummaryRows, grandBars, grandWeight: safeFix(grandWeight, 3) },
        totals: {
          windowsCount,
          totalWindowSqFt: safeFix(totalWindowSqFt),
          totalBars: grandBars,
          totalWeightKg: safeFix(grandWeight, 3),
          weightCost: safeFix(weightCost),
          totalGlassSqFt: safeFix(totalGlassSqFt),
          glassCost: safeFix(glassCost),
          totalRubberCost: safeFix(totalRubberCost),
          laborCost: safeFix(laborCost),
          arwCost: safeFix(arwCost),
          jaliCost: safeFix(jaliCost),
          trackStripTotalCost: safeFix(trackStripTotalCost),
          grandTotal: safeFix(grandTotal),
          avgRatePerSqFt: safeFix(avgRatePerSqFt),
          matsRate: mrc,
          glassRate: gr
        }
      }
    });

  } catch (err) {
    return res.status(500).json({ error: 'Calculation Engine Error: ' + err.message });
  }
};
