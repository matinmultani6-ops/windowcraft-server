function safeNum(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
function safeFix(v, d=2) { return safeNum(v).toFixed(d); }
const num = (n,d=3)=>Number(Number(n).toFixed(d));
const CUTTING_MARGIN = 0.125;

function parseSutToken(str, unitMode='inch') {
  if (!str) return 0;
  const s = String(str).trim();
  if (unitMode === 'mm') return (parseFloat(s) || 0) / 25.4;
  const doubleDotMatch = s.match(/^(\d+)\.(\d)\.5$/);
  if (doubleDotMatch) {
    const inch = parseInt(doubleDotMatch[1], 10);
    const sut = parseInt(doubleDotMatch[2], 10) + 0.5;
    return inch + (sut / 8);
  }
  const singleDotMatch = s.match(/^(\d+)\.(\d)$/);
  if (singleDotMatch) {
    const inch = parseInt(singleDotMatch[1], 10);
    const sut = parseInt(singleDotMatch[2], 10);
    if (sut >= 0 && sut <= 7) return inch + (sut / 8);
  }
  const val = parseFloat(s);
  return isNaN(val) ? 0 : val;
}

function parseSutOffset(val) {
  if (val === undefined || val === null || val === '') return 0;
  const s = String(val).trim();
  const isNeg = s.startsWith('-');
  const clean = s.replace('-', '');
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

function fmtEighthDigits(n){
  if(n==null || isNaN(n)) return '';
  const whole = Math.floor(n);
  const dec = num(n - whole, 4);
  const sut16 = Math.round(dec * 16);
  if (sut16 === 0) return String(whole);
  if (sut16 % 2 === 0) return `${whole}.${sut16 / 2}`;
  else {
    const s = Math.floor(sut16 / 2);
    return `${whole}.${s}½`;
  }
}

function fmtLength(n, unitMode='inch') {
  if (n == null || isNaN(n)) return '';
  if (unitMode === 'mm') {
    const valMM = num(n * 25.4, 1);
    return `${valMM} mm`;
  } else {
    return fmtEighthDigits(n);
  }
}

function mapToProfileType(key) {
  if (key.startsWith('Shutter')) return 'Shutter';
  if (key.startsWith('BearingBottom')) return 'BearingBottom';
  if (key.startsWith('TrackStrip')) return 'TrackStrip';
  return key;
}

function isTrackProfile(key) {
  if (!key) return false;
  const t = String(key).replace(/\s*\([^\)]+\)$/, '').trim();
  const mapped = mapToProfileType(t);
  return mapped === 'Track' || mapped === 'TopTrack' || mapped === 'BottomTrack';
}

function roundToEighth(v){
  if (v==null || isNaN(v)) return 0;
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

function evaluateFormula(formula, W, H) {
  try {
    if (!formula) return NaN;
    const fn = new Function('W', 'H', 'return ' + formula);
    return num(fn(W, H));
  } catch (e) { return NaN; }
}

const DEFAULT_RULES_CONFIG = {
  D2: { glassQty: 2, glassW_offset: -4.3, glassH_offset: -4.125, ShutterW: { formula: 'W / 2', qty: 4 }, ShutterH: { formula: 'H - 2.75', qty: 4 }, Interlock: { formula: 'H - 2.75', qty: 2 }, arw: 700, lr: 30, rubberWtFt: 0.025, rubberRate: 160 },
  D3: { glassQty: 3, glassW_offset: -4.3, glassH_offset: -4.125, ShutterW: { formula: 'W / 2', qty: 6 }, ShutterH: { formula: 'H - 2.75', qty: 6 }, Interlock: { formula: 'H - 2.75', qty: 3 }, arw: 700, jaliRate: 30, lr: 120, rubberWtFt: 0.025, rubberRate: 160 },
  S2: { glassQty: 2, glassW_offset: -3.5, glassH_offset: -2.5, ShutterW: { formula: 'W / 2', qty: 4 }, ShutterH: { formula: 'H - 2.5', qty: 4 }, Interlock: { formula: 'H - 2.5', qty: 2 }, TrackStrip: { formula: 'W - 3', qty: 2, stockLen: 192.5, rate: 800 }, arw: 700, lr: 30, rubberWtFt: 0.025, rubberRate: 160 },
  S3: { glassQty: 3, glassW_offset: -4.125, glassH_offset: -4.125, ShutterW: { formula: 'W / 2', qty: 6 }, ShutterH: { formula: 'H - 2.75', qty: 3 }, Interlock: { formula: 'H - 2.75', qty: 3 }, TrackStrip: { formula: 'W - 3', qty: 3, stockLen: 192.5, rate: 800 }, arw: 1000, jaliRate: 25, lr: 150, rubberWtFt: 0.025, rubberRate: 160 },
  N2: { glassQty: 2, glassW_offset: -2.5, glassH_offset: -2.625, BearingBottomW: { formula: '(W - 6.25) / 2', qty: 4 }, Handle: { formula: 'H - 1.875', qty: 2 }, Interlock: { formula: 'H - 1.875', qty: 2 }, arw: 700, lr: 30, rubberWtFt: 0.025, rubberRate: 160 },
  N3: { glassQty: 3, glassW_offset: -2.5, glassH_offset: -2.625, BearingBottomW: { formula: '(W - 6.25) / 2', qty: 6 }, Handle: { formula: 'H - 1.875', qty: 3 }, Interlock: { formula: 'H - 1.875', qty: 3 }, arw: 700, jaliRate: 25, lr: 30, rubberWtFt: 0.025, rubberRate: 160 }
};

const DEFAULT_WEIGHTS = {
  D2: { Track: 6, Shutter: 3.2, Interlock: 1.8 }, D3: { Track: 6, Shutter: 3.2, Interlock: 1.8 },
  S2: { Track: 6, Shutter: 3.2, Interlock: 1.8, TrackStrip: 1.5 }, S3: { Track: 6, Shutter: 3.2, Interlock: 1.8, TrackStrip: 1.5 },
  N2: { TopTrack: 2.8, BottomTrack: 2.5, BearingBottom: 2, Handle: 1.5, Interlock: 1.5 },
  N3: { TopTrack: 2.8, BottomTrack: 2.5, BearingBottom: 2, Handle: 1.5, Interlock: 1.5 },
  Pipes: { Pipes: 2.15 }
};

const FIXED_TRACK_RULES = {
  D2: { Track: ['W', 'W', 'H', 'H'] }, D3: { Track: ['W', 'W', 'H', 'H'] },
  S2: { Track: ['W', 'W', 'H', 'H'] }, S3: { Track: ['W', 'W', 'H', 'H'] },
  N2: { TopTrack: ['W', 'H', 'H'], BottomTrack: ['W'] },
  N3: { TopTrack: ['W', 'H', 'H'], BottomTrack: ['W'] }
};

function getCurrentRulesConfig(mode, customRules = {}) {
  const isBuiltIn = ['D2','D3','S2','S3','N2','N3'].includes(mode);
  const defaults = isBuiltIn ? (DEFAULT_RULES_CONFIG[mode] || DEFAULT_RULES_CONFIG.D3) : {};
  const custom = customRules[mode] || {};
  let res = { ...defaults, ...custom };

  res.arw = safeNum(res.arw); res.lr = safeNum(res.lr);
  res.jaliRate = safeNum(res.jaliRate);
  res.rubberWtFt = safeNum(res.rubberWtFt) || 0.025;
  res.rubberRate = safeNum(res.rubberRate) || 160;
  res.glassQty = safeNum(res.glassQty) || defaults.glassQty || 2;
  return res;
}

function getModeFamily(mode) {
  const m = mode.toUpperCase();
  if (m.startsWith('D')) return 'D-Series';
  if (m.startsWith('N')) return 'N-Series';
  if (m.startsWith('S')) return 'S-Series';
  return m;
}

function getProfileCutCategory(key, windowMode, allWindowModes) {
  const type = mapToProfileType(key);
  const family = getModeFamily(windowMode);
  const familiesInProject = new Set(allWindowModes.map(getModeFamily));
  const isMultiFamily = familiesInProject.size > 1;

  if (type === 'Track' || type === 'TopTrack' || type === 'BottomTrack') {
    const hasMultipleModesInFamily = allWindowModes.some(m => getModeFamily(m) === family && m !== windowMode);
    if (hasMultipleModesInFamily || isMultiFamily) return `${type} (${windowMode})`;
    return type;
  }
  if (isMultiFamily) return `${type} (${family})`;
  return type;
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

function getWindowPiecesAndGlass(W, H, mode, customRules = {}) {
  const rules = getCurrentRulesConfig(mode, customRules);
  const pieces = {}; const originalLengths = {};
  const W_shutter = applySutRounding(W, 'non-track', true);
  const H_shutter = applySutRounding(H, 'non-track', false);

  for (const key in rules) {
    if (['glassQty','glassW_offset','glassH_offset','glassW','glassH','arw','lr','jaliRate','rubberWtFt','rubberRate','hasJali','includedProfiles'].includes(key)) continue;
    const rule = rules[key];
    if (typeof rule === 'object' && rule.formula && rule.qty > 0) {
      let length = evaluateFormula(rule.formula, W_shutter, H_shutter);
      if (isNaN(length)) continue;
      const isW = rule.formula.toLowerCase().includes('w');
      length = applySutRounding(length, key, isW);
      originalLengths[key] = num(length);
      if (!isNaN(length) && length > 0) length += CUTTING_MARGIN;
      const finalLength = applySutRounding(length, key, isW);
      if (finalLength > 0) pieces[key] = Array(parseInt(rule.qty,10)).fill(finalLength);
    }
  }

  const isBuiltIn = ['D2','D3','S2','S3','N2','N3'].includes(mode);
  let trackRulesToUse = isBuiltIn ? (FIXED_TRACK_RULES[mode] || {}) : {};

  for (const key in trackRulesToUse) {
    pieces[key] = trackRulesToUse[key].map(formula => {
      let length = evaluateFormula(formula, W, H);
      originalLengths[key] = originalLengths[key] || [];
      originalLengths[key].push(num(length));
      if (!isNaN(length) && length > 0) length += CUTTING_MARGIN;
      return applySutRounding(length, key, true);
    }).filter(v => v > 0);
  }

  let shutterW_val = evaluateFormula(rules.ShutterW?.formula || rules.BearingBottomW?.formula || 'W / 2', W_shutter, H_shutter);
  let shutterH_val = evaluateFormula(rules.ShutterH?.formula || rules.Handle?.formula || 'H', W_shutter, H_shutter);

  const rawGlassW = safeNum(shutterW_val) + parseSutOffset(rules.glassW_offset ?? -2.5);
  const rawGlassH = safeNum(shutterH_val) + parseSutOffset(rules.glassH_offset ?? -2.625);

  const g = {
    w: applySutRounding(rawGlassW, 'Glass', true),
    h: applySutRounding(rawGlassH, 'Glass', false),
    qty: rules.glassQty || 2
  };
  return { pieces, glass: g, originalLengths };
}

function assignFromStock(required, stockPieces){
  const req=required.map(c=>({...c})).sort((a,b)=>b.len-a.len);
  const stock=stockPieces.map(v=>({len:v, originalLength:v, cuts:[]}));
  const usedFromStockGrouped=[]; const remaining=[];
  for(const cut of req){
    let best=-1, bestLeft=Infinity;
    for(let i=0;i<stock.length;i++){
      if(stock[i].len>=cut.len){
        const left=num(stock[i].len-cut.len);
        if(left<bestLeft){bestLeft=left; best=i;}
      }
    }
    if(best>=0){ stock[best].len = num(stock[best].len - cut.len); stock[best].cuts.push(cut); }
    else remaining.push(cut);
  }
  const updatedStock = [];
  for (const s of stock) {
    if (s.cuts.length > 0) usedFromStockGrouped.push({ originalLength: s.originalLength, leftover: s.len, cuts: s.cuts });
    if (s.len >= 0.01) updatedStock.push(s.len);
  }
  return { usedFromStockGrouped, remainingReq: remaining.sort((a,b)=>b.len-a.len), updatedStock };
}

function optimizeMinWaste(cuts, stockLen){
  const items = cuts.filter(v => v && v.len > 0.01).map(v => ({...v})).sort((a,b) => b.len - a.len);
  const bins = [];
  for (const item of items) {
    let bestBin = null; let minRemainder = Infinity;
    for (const bin of bins) {
      const rem = num(stockLen - bin.used - item.len);
      if (rem >= 0 && rem < minRemainder) { minRemainder = rem; bestBin = bin; }
    }
    if (bestBin) {
      bestBin.cuts.push(item); bestBin.used = num(bestBin.used + item.len);
      bestBin.waste = num(stockLen - bestBin.used);
    } else {
      bins.push({ cuts: [item], used: num(item.len), waste: num(stockLen - item.len) });
    }
  }
  return bins;
}

function roundWindowStep6(val){
  const base = Math.floor(val/6)*6;
  return (val <= base + 0.875)? base : base + 6;
}
function windowSqFtSingle(w, h, mode='6step'){
  if (mode === 'inch') return (w * h) / 144;
  const rw = roundWindowStep6(w), rh = roundWindowStep6(h);
  return (rw * rh) / 144;
}
function roundGlassStep(val){
  const base = Math.floor(val/6)*6;
  return (val % 6 === 0)? base : base + 6;
}
function glassSqFt(w,h){ return (roundGlassStep(w) * roundGlassStep(h)) / 144; }

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
      sizesRaw.split(/\n+/g).map(s=>s.trim()).filter(Boolean).forEach(line => {
        const m = line.match(/^\s*([\d\.]+)\s*[\*xX×]\s*([\d\.]+)(?:\s*\((.*?)\))?\s*$/);
        if(!m) return;
        let w = parseSutToken(m[1], unitMode);
        let h = parseSutToken(m[2], unitMode);
        if(isNaN(w) || isNaN(h) || w <= 0 || h <= 0) return;
        
        let q = 1, mode = defaultMode;
        if(m[3]){
          const tag = m[3].trim();
          const parsedTag = tag.match(/^(\d+)?\s*([a-zA-Z0-9_\-]+)?$/);
          if (parsedTag) {
            if (parsedTag[1]) q = parseInt(parsedTag[1], 10);
            if (parsedTag[2] && !/^\d+$/.test(parsedTag[2])) mode = parsedTag[2].toUpperCase();
          }
        }
        for (let k = 0; k < q; k++) sizes.push({ w, h, id: windowCounter++, mode });
      });
    }

    const piecesByType = {};
    const glasses = [];
    const allWindowModes = sizes.map(s => s.mode || defaultMode);
    const windowCutDetails = [];

    sizes.forEach(sz => {
      const W = num(sz.w), H = num(sz.h);
      const winMode = sz.mode || defaultMode;
      const { pieces: pc, glass: g, originalLengths } = getWindowPiecesAndGlass(W, H, winMode, customRules);
      
      const glassSq = safeFix(glassSqFt(g.w, g.h) * g.qty);
      const winSq = safeFix(windowSqFtSingle(applySutRounding(W, 'non-track', true), applySutRounding(H, 'non-track', false), sqftMode));

      glasses.push({
        window: sz.id, widthFmt: fmtLength(g.w, unitMode), heightFmt: fmtLength(g.h, unitMode),
        qty: g.qty, rawW: W, rawH: H, mode: winMode, totalGlassSq: glassSq, winSqFt: winSq,
        sizeFmt: `${fmtLength(applySutRounding(W, 'non-track', true), unitMode)} x ${fmtLength(applySutRounding(H, 'non-track', false), unitMode)}`
      });

      const formattedOrig = {};
      for (const [pk, val] of Object.entries(originalLengths)) {
        formattedOrig[pk] = Array.isArray(val) ? val.map(v => fmtLength(v, unitMode)).join(', ') : fmtLength(val, unitMode);
      }

      windowCutDetails.push({
        id: `W${sz.id}`, mode: winMode, W: fmtLength(W, unitMode), H: fmtLength(H, unitMode), origFmt: formattedOrig
      });

      for(const [key, arr] of Object.entries(pc)){
        const category = getProfileCutCategory(key, winMode, allWindowModes);
        piecesByType[category] = piecesByType[category] || [];
        let orig = originalLengths[key];
        piecesByType[category].push(...arr.map((len, idx) => ({
          len, id: `W${sz.id}`, winMode: winMode, originalLen: Array.isArray(orig) ? orig[idx%orig.length] : orig,
          origFmt: fmtLength(Array.isArray(orig) ? orig[idx%orig.length] : orig, unitMode)
        })));
      }
    });

    const cutPlans = {};
    let grandBars = 0; let grandWeight = 0; let trackStripTotalCost = 0;
    const barSummaryRows = [];

    Object.entries(piecesByType).forEach(([type, cuts]) => {
      if (!cuts || cuts.length === 0) return;
      const stockLengthToUse = (type === 'Pipes') ? pipeStockLen : stockLen;
      const af = assignFromStock(cuts, (stockMap[type] || []).slice().sort((a,b)=>b-a));
      const bins = optimizeMinWaste(af.remainingReq, stockLengthToUse);
      
      const formattedBins = bins.map(b => ({
        usedFmt: fmtLength(b.used, unitMode),
        wasteFmt: fmtLength(stockLengthToUse - b.used, unitMode),
        cutsStr: b.cuts.map(c => `${fmtLength(c.originalLen, unitMode)} (${c.id})`).join(", ")
      }));

      cutPlans[type] = {
        usedFromStock: af.usedFromStockGrouped.map(u => ({
          origFmt: fmtLength(u.originalLength, unitMode), leftFmt: fmtLength(u.leftover, unitMode),
          cutsStr: u.cuts.map(c => `${fmtLength(c.originalLen, unitMode)} (${c.id})`).join(", ")
        })),
        bins: formattedBins, stockLenFmt: fmtLength(stockLengthToUse, unitMode)
      };
      const bars = bins.length;
      const kgPerBar = getWeight(defaultMode, type, weights);
      const totalKg = bars * kgPerBar;
      grandBars += bars; grandWeight += totalKg;
      barSummaryRows.push([type, `${bars} Bars`, `${safeFix(kgPerBar, 3)} kg`, `${safeFix(totalKg, 3)} kg`]);
    });

    let arwCost = 0, laborCost = 0, jaliCost = 0, totalRubberCost = 0;
    const windowsCount = sizes.length;
    const totalGlassSqFt = safeNum(glasses.reduce((s,g)=> s + (glassSqFt(parseSutToken(g.widthFmt, unitMode), parseSutToken(g.heightFmt, unitMode))*g.qty || 0), 0));
    const totalWindowSqFt = safeNum(sizes.reduce((s,sz)=> s + (windowSqFtSingle(sz.w, sz.h, sqftMode) || 0), 0));

    sizes.forEach(sz => {
      const winMode = sz.mode || defaultMode;
      const rules = getCurrentRulesConfig(winMode, customRules);
      const winSq = windowSqFtSingle(sz.w, sz.h, sqftMode);
      const { glass: g } = getWindowPiecesAndGlass(sz.w, sz.h, winMode, customRules);
      totalRubberCost += (glassRunningFeet(g.w || 0, g.h || 0, g.qty || 2) * (rules.rubberWtFt || 0.025)) * (rules.rubberRate || 160);
      arwCost += safeNum(rules.arw); laborCost += safeNum(rules.lr) * winSq;
    });

    const glassCost = safeNum(totalGlassSqFt * gr);
    const weightCost = safeNum(mrc * grandWeight);
    const grandTotal = safeNum(weightCost + glassCost + arwCost + laborCost + jaliCost + trackStripTotalCost + totalRubberCost);
    const avgRatePerSqFt = totalWindowSqFt ? grandTotal / totalWindowSqFt : 0;

    return res.status(200).json({
      status: 'success',
      data: {
        sizes: glasses, windowCutDetails, cutPlans,
        barSummary: { rows: barSummaryRows, grandBars, grandWeight: safeFix(grandWeight, 3) },
        totals: {
          windowsCount, totalWindowSqFt: safeFix(totalWindowSqFt), totalBars: grandBars,
          totalWeightKg: safeFix(grandWeight, 3), weightCost: safeFix(weightCost),
          totalGlassSqFt: safeFix(totalGlassSqFt), glassCost: safeFix(glassCost),
          totalRubberCost: safeFix(totalRubberCost), laborCost: safeFix(laborCost),
          arwCost: safeFix(arwCost), jaliCost: safeFix(jaliCost),
          trackStripTotalCost: safeFix(trackStripTotalCost),
          grandTotal: safeFix(grandTotal), avgRatePerSqFt: safeFix(avgRatePerSqFt),
          matsRate: mrc, glassRate: gr
        }
      }
    });

  } catch (err) {
    return res.status(500).json({ error: 'Calculation Engine Error: ' + err.message });
  }
};
function glassRunningFeet(w, h, qty=2){ return ((w + h) * 2 / 12) * qty; }
