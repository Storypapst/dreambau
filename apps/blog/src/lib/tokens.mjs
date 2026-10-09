// The colour tokens (spec 5.8 AC-1): read the custom properties of a stylesheet and find colours that are typed by hand.
// Plain functions over text, so that a check can prove them on made-up CSS before it trusts them on the real files.

// CSS without its comments and without the text of its strings, with every line break kept (so that a line number of
// the result is the line number of the file).
function blank(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, (match) => match.replace(/[^\n]/g, ' '))
    .replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, (match) => `"${' '.repeat(match.length - 2)}"`);
}

const normalize = (value) => value.replace(/\s+/g, ' ').trim();

// The custom properties declared in the :root block(s), as { '--name': 'value' }, values with their spaces collapsed.
// With { everywhere: true } the declarations of every block (a rule of the stylesheet that declares a property of its
// own) are read too; the last declaration of a name wins.
export function customProperties(css, { everywhere = false } = {}) {
  const found = {};
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const blocks = everywhere ? [...text.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]) : [...text.matchAll(/:root\s*\{([^{}]*)\}/g)].map((m) => m[1]);
  for (const block of blocks) for (const match of block.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) found[match[1]] = normalize(match[2]);
  return found;
}

// Every custom property declaration with its line number (for the "declared again" line).
export function customPropertyLines(css) {
  const found = [];
  blank(css).split('\n').forEach((line, index) => { for (const match of line.matchAll(/(--[\w-]+)\s*:/g)) found.push({ name: match[1], line: index + 1 }); });
  return found;
}

// The CSS colour names. `transparent`, `currentcolor` and the global keywords are not colours of the palette.
const NAMES = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen').split(' '));
// Properties whose value is never a colour (a name such as `tan` can only be a different thing there).
const NOT_COLOUR = /^(?:content|quotes|font(?:-family)?|grid(?:-[a-z-]+)?|animation(?:-[a-z-]+)?|transition(?:-[a-z-]+)?|will-change|counter-[a-z]+|list-style(?:-type)?|cursor|display|position|overflow(?:-[xy])?|text-align|white-space)$/;

// The numbers (1-based) of the lines that type a colour by hand: a #hex value, rgb()/rgba()/hsl()/hsla()/hwb()/lab()/
// lch()/oklab()/oklch()/color() with anything but var() as its first argument, or a colour name as a value. A colour
// that comes through var() is the one way to a colour. Comments and strings do not count.
export function colourLines(css) {
  const found = [];
  blank(css).split('\n').forEach((line, index) => {
    let typed = /#[0-9a-fA-F]{3,8}\b/.test(line) || /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*(?!var\()/i.test(line);
    if (!typed) {
      for (const declaration of line.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]+)/g)) {
        if (NOT_COLOUR.test(declaration[1].toLowerCase())) continue;
        const words = declaration[2].replace(/var\([^)]*\)/g, ' ').match(/[a-zA-Z]+/g) || [];
        if (words.some((word) => NAMES.has(word.toLowerCase()))) typed = true;
      }
    }
    if (typed) found.push(index + 1);
  });
  return found;
}

// The two properties that blog.css may declare in addition to the ones of references.css, with the values AC-2 gives them.
export const EXTRAS = Object.freeze({ '--bd-control': 'rgba(var(--fg),.45)', '--ring': '#fff' });

// All findings of AC-1 as { rule, where, what }: tokens text and reference text (null when the file is missing), the text
// of blog.css (null when missing is not an error here: the build output is checked elsewhere).
export function tokenProblems({ tokensText, referenceText, cssText, tokensPath = 'tokens.css', referencePath = 'references.css', cssPath = 'blog.css' }) {
  const found = [];
  const add = (where, what) => found.push({ rule: 'AC-1', where, what });
  if (tokensText === null) add('tokens.css', `not found at ${tokensPath}`);
  if (referenceText === null) add('references.css', `not found at ${referencePath}`);
  if (tokensText === null || referenceText === null) return found;
  const tokens = customProperties(tokensText);
  const reference = customProperties(referenceText);
  if (Object.keys(tokens).length === 0) add('tokens.css', 'no custom property found in a :root block');
  if (Object.keys(reference).length === 0) add('references.css', 'no custom property found in a :root block');
  for (const [name, value] of Object.entries(tokens)) {
    if (name in EXTRAS) { if (value !== EXTRAS[name]) add(name, `tokens.css declares ${value}, the spec (AC-2) gives ${EXTRAS[name]}`); continue; }
    if (!(name in reference)) add(name, 'not found in references.css');
    else if (reference[name] !== value) add(name, `tokens.css declares ${value}, references.css declares ${reference[name]}`);
  }
  if (cssText !== null && cssText !== undefined) {
    const lines = cssText.split('\n');
    for (const line of colourLines(cssText)) add(`blog.css:${line}`, `colour typed by hand (${lines[line - 1].trim().slice(0, 80)})`);
    for (const { name, line } of customPropertyLines(cssText)) if (name in tokens) add(`blog.css:${line}`, `${name} is declared again (the tokens are declared once, in tokens.css)`);
  }
  return found;
}
