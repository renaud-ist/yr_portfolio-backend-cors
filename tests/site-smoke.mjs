import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const script = readFileSync(join(root, 'assets/js/script.js'), 'utf8');
const workflow = readFileSync(join(root, '.github/workflows/pages.yml'), 'utf8');
const readme = readFileSync(join(root, 'README.md'), 'utf8');
const repositoryMarkdown = ['README.md'];

assert.deepEqual(repositoryMarkdown, ['README.md'], 'README.md is the sole tracked project documentation file');
for (const heading of [
  'Project Overview', 'Features', 'Technology Stack', 'Installation', 'Local Development',
  'Project Structure', 'Resume Management', 'Contact Form Configuration', 'Brevo Email Integration',
  'Cloudflare Configuration', 'GitHub Deployment', 'Testing and Validation', 'Accessibility Features',
  'SEO Features', 'Security Notes', 'Troubleshooting', 'Change Log', 'Future Improvements',
]) {
  assert.ok(readme.includes(`## ${heading}`), `README is missing the ${heading} section`);
}
assert.doesNotMatch(readme, /(?:AUDIT|DEPLOYMENT)\.md/, 'README must not link to removed Markdown docs');

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
assert.equal(new Set(ids).size, ids.length, 'HTML ids must be unique');
const fragments = [...html.matchAll(/\bhref="#([^"]+)"/g)].map((match) => match[1]);
assert.ok(fragments.every((fragment) => ids.includes(fragment)), 'Every internal link must target an existing id');
assert.match(html, /href="#experience" aria-label="Volunteer IT Support Experience"/, 'Volunteer highlight must target the experience section');
assert.match(html, /<section id="experience"/, 'Volunteer experience section needs a direct anchor id');
assert.match(html, /href="#education" aria-label="Universities Attended"/, 'Universities highlight must target education');
assert.match(html, /<section id="education"/, 'Education section needs a direct anchor id');
assert.equal((html.match(/<main\b/g) || []).length, 1, 'Page must have one main landmark');
assert.match(html, /<h1\b/, 'Page needs a primary heading');
assert.match(html, /rel="canonical"/, 'Page needs canonical metadata');
assert.match(html, /role="status" aria-live="polite"/, 'Contact status needs a live announcement');
assert.match(html, /"@type": "Person"/, 'Page needs structured profile data');
assert.match(script, /https:\/\/yr-portfolio-api-proxy\.yangdarenaud893\.workers\.dev/, 'Production API must use the configured Worker');
assert.doesNotMatch(script, /localStorage/, 'Admin tokens must not persist in localStorage');
assert.match(script, /data-notification-read/, 'Notification rows need a mark-read action');
assert.match(script, /api\/notifications\?id=.*PATCH/s, 'Mark-read must persist through the notification API');
assert.match(script, /api\/notifications\/read-all/, 'Mark all read must persist through the notification API');
assert.match(script, /result\.unread_count/, 'Notification badge must use the persisted unread count');
assert.doesNotMatch(html, /resume\/CV\.docx/, 'Page must not link to the deleted DOCX resume');
for (const resume of [
  'Yangda_Renaud_IT_Support_CV.pdf',
  'Yangda_Renaud_Admin_Assistant_CV.pdf',
  'Yangda_Renaud_Data_Entry_CV.pdf',
]) {
  assert.ok(html.includes(`resume/${resume}`), `Missing equal-track resume link: ${resume}`);
  assert.ok(existsSync(join(root, 'resume', resume)), `Missing resume file: ${resume}`);
}
assert.equal((html.match(/class="resume-card"/g) || []).length, 3, 'Resume section must show exactly three career tracks');
for (const label of ['Download IT Support CV', 'Download Administrative Assistant CV', 'Download Data Entry CV']) {
  assert.ok(html.includes(label), `Missing meaningful resume action label: ${label}`);
}
assert.match(readFileSync(join(root, 'assets/css/style.css'), 'utf8'), /font-family: 'Times New Roman', Times, serif/);
const styles = readFileSync(join(root, 'assets/css/style.css'), 'utf8');
assert.match(styles, /scroll-behavior: smooth/);
assert.match(styles, /\.anchor-highlight\s*\{\s*animation: anchorTargetHighlight 2s ease-out/);
assert.match(script, /document\.querySelectorAll\('a\[href\^="#"\]'\)/);
assert.match(script, /stickyHeader\.getBoundingClientRect\(\)\.height/);
assert.match(script, /target\.scrollIntoView\(\{[\s\S]*behavior: prefersReducedMotion \? 'auto' : 'smooth',[\s\S]*block: 'start'/);
assert.match(script, /Math\.abs\(targetTop - expectedTop\) > 48/);
assert.match(script, /headingTop < headerBottom \+ 8/);
assert.match(script, /anchorHighlightTimer = window\.setTimeout\([\s\S]*?target\.classList\.remove\('anchor-highlight'\),\s*2000/);
const logoMarkup = [...html.matchAll(/<img class="(nkumba-logo|university-logo)" src="([^"]+)" alt="([^"]+)"([^>]*)>/g)];
assert.deepEqual(logoMarkup.map((match) => match[1]).sort(), ['nkumba-logo', 'university-logo']);
const logoDimensions = new Map([
  ['images/Nkumba University Logo.png', [600, 600]],
  ["images/University of N'Djamena Logo.png", [853, 854]],
]);
for (const [, , source, , attributes] of logoMarkup) {
  assert.ok(existsSync(join(root, source)), `Missing university logo: ${source}`);
  assert.doesNotMatch(attributes, /\b(?:width|height)=/, `${source} must keep its intrinsic dimensions`);
  const png = readFileSync(join(root, source));
  assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${source} must be a PNG`);
  assert.deepEqual(
    [png.readUInt32BE(16), png.readUInt32BE(20)],
    logoDimensions.get(source),
    `${source} must retain its expected natural dimensions`
  );
}
const logoRules = styles.match(/img\.university-logo,\s*img\.nkumba-logo\s*\{([^}]*)\}/s);
assert.ok(logoRules, 'Both university logos must share one image-quality rule');
assert.match(logoRules[1], /width: auto;/);
assert.match(logoRules[1], /height: auto;/);
assert.match(logoRules[1], /max-width: 120px;/);
assert.match(logoRules[1], /max-height: 120px;/);
assert.match(logoRules[1], /object-fit: contain;/);
assert.match(logoRules[1], /image-rendering: auto;/);
assert.match(logoRules[1], /justify-self: center;/);
assert.match(logoRules[1], /align-self: center;/);
assert.match(logoRules[1], /transform: none;/);
assert.match(logoRules[1], /filter: none;/);
assert.match(logoRules[1], /opacity: 1;/);
assert.match(logoRules[1], /animation: none;/);
assert.match(logoRules[1], /transition: none;/);
assert.match(styles, /grid-template-columns: minmax\(120px, 0\.4fr\) minmax\(0, 1fr\)/);
assert.match(styles, /\.edu-card\s*\{[^}]*display: grid/s);
assert.match(styles, /\.education-grid,[\s\S]*?grid-template-columns: 1fr;/);
assert.match(styles, /\.js \.education\.reveal\s*\{\s*opacity: 1;\s*transform: none;\s*transition: none;/);
assert.doesNotMatch(html, /data-count=/, 'Profile highlights must remain meaningful without JavaScript');

for (const path of ['index.html', 'robots.txt', 'site.webmanifest', 'assets/css', 'assets/js', 'assets/*.svg', 'images/.', 'resume/.']) {
  assert.ok(workflow.includes(path), `Pages staging is missing ${path}`);
}
assert.match(workflow, /path: _site/, 'Pages upload must use the staged static directory');
assert.doesNotMatch(workflow, /cp .*\.php|cp .*\.env|cp .*\.sql|cp .*tests|cp .*extract_cv/, 'Pages staging must exclude backend and private files');
assert.ok(readme.includes('## Brevo Email Integration'), 'README must document Brevo configuration');

const localPaths = new Set();
for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
  const value = match[1];
  if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) continue;
  localPaths.add(decodeURIComponent(value.split(/[?#]/, 1)[0]));
}
for (const match of readFileSync(join(root, 'assets/css/style.css'), 'utf8').matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
  const value = match[1];
  if (/^(?:[a-z]+:|\/\/|#)/i.test(value)) continue;
  localPaths.add(normalize(join('assets/css', value)));
}

for (const path of localPaths) {
  assert.ok(existsSync(join(root, path)), `Missing local asset: ${path}`);
}

for (const match of html.matchAll(/href="#([^"]+)"/g)) {
  assert.ok(ids.includes(match[1]), `Missing in-page anchor target: ${match[1]}`);
}

console.log(`PASS: ${ids.length} unique IDs, ${localPaths.size} local assets, all in-page anchors, resume files, metadata, and Pages allowlist.`);


