const NAMED: Record<string, string> = {
  Alpha: 'α', Beta: 'β', Gamma: 'γ', Delta: 'δ', Epsilon: 'ϵ', Zeta: 'ζ', Eta: 'η',
  Theta: 'θ', Iota: 'ι', Kappa: 'κ', Lambda: 'λ', Mu: 'μ', Nu: 'ν', Xi: 'ξ',
  Omicron: 'ο', Pi: 'π', Rho: 'ρ', Sigma: 'σ', Tau: 'τ', Upsilon: 'υ', Phi: 'ϕ',
  Chi: 'χ', Psi: 'ψ', Omega: 'ω', CapitalGamma: 'Γ', CapitalDelta: 'Δ',
  CapitalTheta: 'Θ', CapitalLambda: 'Λ', CapitalXi: 'Ξ', CapitalPi: 'Π',
  CapitalSigma: 'Σ', CapitalPhi: 'Φ', CapitalPsi: 'Ψ', CapitalOmega: 'Ω',
  CurlyEpsilon: 'ε', CurlyPhi: 'φ', Infinity: '∞', ImaginaryI: 'ⅈ', ExponentialE: 'ⅇ',
  Rule: '→', RuleDelayed: '⧴', RightArrow: '→', LeftArrow: '←', DoubleRightArrow: '⇒',
  LessEqual: '≤', GreaterEqual: '≥', NotEqual: '≠', Equal: '==', Element: '∈',
  NotElement: '∉', And: '∧', Or: '∨', Not: '¬', Times: '×', CenterDot: '·',
  PlusMinus: '±', MinusPlus: '∓', PartialD: '∂', Del: '∇', Integral: '∫',
  Sum: '∑', Product: '∏', Sqrt: '√', Degree: '°', Ellipsis: '…',
  IndentingNewLine: '\n', NewLine: '\n', Tab: '\t', InvisibleSpace: '',
  VeryThinSpace: ' ', ThinSpace: ' ', MediumSpace: ' ', ThickSpace: ' ',
  NegativeVeryThinSpace: '', NegativeThinSpace: '', InvisibleTimes: ' ',
  InvisibleComma: ',', NoBreak: '', Continuation: '',
  LeftDoubleBracket: '〚', RightDoubleBracket: '〛',
  LeftBracketingBar: '|', RightBracketingBar: '|',
  DifferentialD: 'ⅆ', Transpose: 'ᵀ', ConjugateTranspose: 'ᴴ',
  DoubleStruckCapitalR: 'ℝ', DoubleStruckCapitalZ: 'ℤ', DoubleStruckCapitalQ: 'ℚ', DoubleStruckCapitalC: 'ℂ',
};

/** Decode only Wolfram string escapes. Unknown sequences remain visible, never executable. */
export function decodeWolframString(raw: string): string {
  return raw.replace(/\\(?:\r\n|\n|\r|\[[^\]\r\n]+\]|:[0-9a-fA-F]{4}|\|[0-9a-fA-F]{6}|\.[0-9a-fA-F]{2}|[0-7]{3}|[\s\S])/g, token => {
    const s = token.slice(1);
    if (s === '\n' || s === '\r\n' || s === '\r' || s === '<' || s === '>') return '';
    if (s === 'n') return '\n';
    if (s === 'r') return '\r';
    if (s === 't') return '\t';
    if (s === 'b') return '\b';
    if (s === 'f') return '\f';
    if (s === '"' || s === '\\') return s;
    if (s.startsWith('[')) return NAMED[s.slice(1, -1)] ?? token;
    if (/^[:|.]/.test(s)) {
      const cp = parseInt(s.slice(1), 16);
      return cp <= 0x10ffff ? String.fromCodePoint(cp) : token;
    }
    if (/^[0-7]{3}$/.test(s)) return String.fromCharCode(parseInt(s, 8));
    return token;
  });
}

const TEX_SYMBOLS: Record<string, string> = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ϵ': '\\epsilon',
  'ε': '\\varepsilon', 'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'λ': '\\lambda',
  'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ρ': '\\rho', 'σ': '\\sigma',
  'τ': '\\tau', 'υ': '\\upsilon', 'ϕ': '\\phi', 'φ': '\\varphi', 'χ': '\\chi',
  'ψ': '\\psi', 'ω': '\\omega', 'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta',
  'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi', 'Σ': '\\Sigma', 'Φ': '\\Phi',
  'Ψ': '\\Psi', 'Ω': '\\Omega', '∞': '\\infty', '→': '\\to', '←': '\\leftarrow',
  '⇒': '\\Rightarrow', '≤': '\\le', '≥': '\\ge', '≠': '\\ne', '∈': '\\in',
  '∉': '\\notin', '∧': '\\land', '∨': '\\lor', '¬': '\\neg', '×': '\\times',
  '·': '\\cdot', '±': '\\pm', '∓': '\\mp', '∂': '\\partial', '∇': '\\nabla',
  '∫': '\\int', '∑': '\\sum', '∏': '\\prod', '√': '\\surd', '…': '\\ldots',
  'ℝ': '\\mathbb{R}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
};

/** No Notebook string is accepted as TeX. Each character is escaped or mapped to a constant. */
export function textToTex(text: string): string {
  let result = '';
  for (const ch of text) {
    if (TEX_SYMBOLS[ch]) result += `{${TEX_SYMBOLS[ch]}}`;
    else if (/[A-Za-z0-9+\-=.,:;!?()\[\]|/<>]/.test(ch)) result += ch;
    else if (/\s/.test(ch)) result += '\\, ';
    else if (ch === '\\') result += '{\\backslash}';
    else if ('{}_$%&#'.includes(ch)) result += `\\${ch}`;
    else if (ch === '^') result += '\\text{\\textasciicircum}';
    else if (ch === '~') result += '{\\sim}';
    else result += `\\text{${ch}}`;
  }
  return result;
}
