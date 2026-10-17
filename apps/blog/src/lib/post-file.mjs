// The validator of one post file (spec 5.2): the reader (PF-2, PF-3), then the rules of every field (PF-1, PF-4 to
// PF-12, PF-14) and of the body (PF-10, PF-12). It reports every failure, never throws, and returns the post (the shape
// the generator uses) when there is no FAIL.
import path from 'node:path';
import { at, fail, hasFailure } from './findings.mjs';
import { parsePostText } from './frontmatter.mjs';
import { inspectImage } from './image.mjs';
import { linkProblems } from './links.mjs';
import { bodyProblems, dateProblems, imageAltProblems, langProblems, quoteProblems, quoteSourceProblems, sourceTitleProblems, textProblems, titleProblems } from './post-rules.mjs';

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// `posts/<year>/<slug>.md` from the last two parts of a path: { year, slug, problem? }.
export function addressOf(file) {
  const parts = path.resolve(String(file)).split(/[\\/]/); // resolved, so that `x.md` run inside posts/2026/ still has its year folder
  const name = parts[parts.length - 1] || '';
  const year = parts[parts.length - 2] || '';
  const found = { year, slug: name.replace(/\.md$/, ''), problems: [] };
  if (!/^\d{4}$/.test(year)) found.problems.push(`the folder ${JSON.stringify(year)} must be a four-digit year`);
  if (!name.endsWith('.md')) found.problems.push(`the file name ${JSON.stringify(name)} must end in .md`);
  else if (!SLUG.test(found.slug) || found.slug.length < 3 || found.slug.length > 60) found.problems.push(`the file name ${JSON.stringify(found.slug)} is not a slug: lower case letters, digits and single dashes, 3 to 60 characters`);
  return found;
}

// readImage(name) returns the bytes of the file `name` in the folder of the post, or null when it does not exist.
export function checkPostText(input, { file, publish = false, now = new Date(), fixture = false, readImage = () => null } = {}) {
  const parsed = parsePostText(input, file);
  const findings = [...parsed.findings];
  const fields = parsed.fields;
  const add = (items, line) => { for (const item of items) findings.push(fail(item.rule, at(file, item.line === undefined ? line : item.line), item.what)); };
  const address = addressOf(file);
  for (const what of address.problems) findings.push(fail('PF-1', file, what));

  const value = (key) => (key in fields ? fields[key].value : undefined);
  const line = (key) => (key in fields ? fields[key].line : undefined);
  const checks = { title: titleProblems, lang: langProblems, quote: quoteProblems, quoteSource: quoteSourceProblems, sourceTitle: sourceTitleProblems };
  for (const [key, rule] of Object.entries(checks)) if (key in fields) add(rule(value(key)), line(key));
  if ('date' in fields) {
    add(dateProblems(value('date'), { publish, now }), line('date'));
    if (/^\d{4}$/.test(address.year) && address.year !== value('date').slice(0, 4) && dateProblems(value('date')).length === 0) {
      findings.push(fail('PF-1', at(file, line('date')), `the file is in the folder ${address.year} but the date ${value('date')} is in ${value('date').slice(0, 4)}; the year folder is the year of the date`));
    }
  }
  if ('sourceLink' in fields) add([...linkProblems(value('sourceLink'), { publish }), ...textProblems(value('sourceLink'))], line('sourceLink'));
  if ('sourceTitle' in fields && !('sourceLink' in fields)) add([{ rule: 'PF-8', what: 'sourceTitle is only allowed together with sourceLink' }], line('sourceTitle'));
  if ('quote' in fields && !('quoteSource' in fields)) add([{ rule: 'PF-9', what: 'a quote needs quoteSource, the source named as text' }], line('quote'));
  if ('quoteSource' in fields && !('quote' in fields)) add([{ rule: 'PF-9', what: 'quoteSource is only allowed together with a quote' }], line('quoteSource'));

  for (const key of ['example', 'imageRights']) {
    if (key in fields && (fields[key].quoted || !['true', 'false'].includes(fields[key].value))) add([{ rule: 'PF-3', what: `${key} must be the plain word true or false` }], line(key));
  }
  if ('example' in fields && !findings.some((item) => item.where === at(file, line('example')))) {
    if (value('example') !== 'true') add([{ rule: 'PF-14', what: 'example is only ever true (leave the key out otherwise)' }], line('example'));
    else if (publish) add([{ rule: 'PF-14', what: 'a publish build refuses example: true (invented text never goes live)' }], line('example'));
    else if (!fixture) add([{ rule: 'PF-14', what: 'example: true is only allowed under tests/fixtures/' }], line('example'));
  }

  let imageInfo;
  if ('image' in fields) {
    const name = value('image');
    const allowed = [`${address.slug}.webp`, `${address.slug}.png`];
    const rule = (what) => add([{ rule: 'PF-11', what }], line('image'));
    if (!allowed.includes(name)) rule(`image must be ${allowed.join(' or ')}, a file in the folder of the post`);
    else {
      const bytes = readImage(name);
      if (bytes === null) rule(`the image file ${name} does not exist next to the post`);
      else {
        const inspected = inspectImage(bytes, name);
        add(inspected.problems, line('image'));
        if (inspected.problems.length === 0) imageInfo = { format: inspected.format, width: inspected.width, height: inspected.height, bytes: inspected.bytes };
      }
    }
    if (!('imageAlt' in fields)) rule('an image needs imageAlt, a description of the picture');
    if (!('imageRights' in fields) || value('imageRights') !== 'true') {
      if (!('imageRights' in fields)) rule('an image needs imageRights: true (the rights are cleared)');
      else add([{ rule: 'PF-11', what: 'imageRights must be true when there is an image' }], line('imageRights'));
    }
  } else {
    for (const key of ['imageAlt', 'imageRights']) if (key in fields) add([{ rule: 'PF-11', what: `${key} is only allowed together with image` }], line(key));
  }
  if ('imageAlt' in fields) add(imageAltProblems(value('imageAlt')), line('imageAlt'));

  let paragraphs = [];
  if (parsed.body) {
    const body = bodyProblems(parsed.body.lines);
    paragraphs = body.paragraphs;
    add(body.problems);
  }

  findings.sort((a, b) => lineOfWhere(a.where) - lineOfWhere(b.where));
  if (hasFailure(findings)) return { post: null, findings };
  const post = { title: value('title'), date: value('date'), lang: value('lang') || 'de', paragraphs, year: address.year, slug: address.slug, address: `${address.year}/${address.slug}`, file };
  for (const key of ['sourceLink', 'sourceTitle', 'quote', 'quoteSource', 'image', 'imageAlt']) if (key in fields) post[key] = value(key);
  if (imageInfo) post.imageInfo = imageInfo;
  for (const key of ['imageRights', 'example']) if (key in fields) post[key] = value(key) === 'true';
  return { post, findings };
}

function lineOfWhere(where) {
  const match = /:(\d+)$/.exec(where);
  return match ? Number(match[1]) : 0;
}
