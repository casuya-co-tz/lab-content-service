const { JSDOM } = require('jsdom')
const createDOMPurify = require('dompurify')
const { minify } = require('html-minifier-terser')

const window = new JSDOM('').window
const DOMPurify = createDOMPurify(window)

const SANITIZE_CONFIG = {
  ALLOWED_TAGS: [
    'html', 'head', 'body', 'meta', 'title', 'link', 'style', 'script',
    'div', 'span', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'canvas', 'svg', 'img', 'video', 'audio', 'source',
    'button', 'input', 'label', 'select', 'option', 'textarea',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'ul', 'ol', 'li', 'a', 'br', 'hr', 'pre', 'code',
    'form', 'fieldset', 'section', 'article', 'header', 'footer', 'nav',
  ],
  ALLOWED_ATTR: [
    'class', 'id', 'style', 'title', 'lang', 'dir',
    'href', 'target', 'rel',
    'src', 'width', 'height', 'alt', 'loading',
    'type', 'value', 'placeholder', 'disabled', 'checked', 'name', 'for',
    'colspan', 'rowspan', 'scope',
    'viewBox', 'xmlns', 'fill', 'stroke', 'stroke-width', 'd',
    'cx', 'cy', 'r', 'x', 'y', 'rx', 'ry',
    'data-*', 'aria-*',
    'sandbox', 'allow', 'srcdoc',
    'controls', 'autoplay', 'loop', 'muted', 'poster', 'preload',
    'method', 'action', 'enctype',
    'min', 'max', 'step', 'pattern', 'required', 'readonly',
  ],
  ALLOW_DATA_ATTR: true,
  ADD_URI_SAFE_ATTR: ['viewBox', 'xmlns'],
  WHOLE_DOCUMENT: false,
  FORCE_BODY: true,
  RETURN_DOM: false,
  RETURN_DOM_FRAGMENT: false,
  SANITIZE_DOM: true,
  KEEP_CONTENT: true,
}

const MINIFY_CONFIG = {
  collapseWhitespace: true,
  removeComments: true,
  removeRedundantAttributes: true,
  removeScriptTypeAttributes: true,
  removeStyleLinkTypeAttributes: true,
  minifyCSS: true,
  minifyJS: true,
  minifyURLs: false,
}

// DOMPurify removes <script type="importmap"> entirely.
// We extract them before sanitization and reinsert after.
const IMPORTMAP_RX = /<script\s+type=["']importmap["'][^>]*>[\s\S]*?<\/script>/gi

async function sanitizeHtml(html) {
  if (!html || typeof html !== 'string') return html

  // 1. Extract importmaps
  const maps = []
  const stripped = html.replace(IMPORTMAP_RX, m => { maps.push(m); return '' })

  // 2. Sanitize everything else
  const clean = DOMPurify.sanitize(stripped, SANITIZE_CONFIG)

  // 3. Prepend importmaps (DOMPurify strips <html>/<head>/<body> with WHOLE_DOCUMENT:false)
  const withMaps = maps.length ? maps.join('\n') + '\n' + clean : clean

  // 4. Minify but protect importmaps from JS minifier
  try {
    const phMaps = []
    const preserved = withMaps.replace(IMPORTMAP_RX, m => {
      phMaps.push(m)
      return `<script type="__PH__IMPORTMAP" data-idx="${phMaps.length - 1}"></script>`
    })
    const minified = await minify(preserved, MINIFY_CONFIG)
    return minified.replace(
      /<script\s+type="__PH__IMPORTMAP"\s+data-idx="(\d+)"><\/script>/gi,
      (_, i) => phMaps[parseInt(i)]
    )
  } catch {
    return withMaps
  }
}

function sanitizeHtmlSync(html) {
  if (!html || typeof html !== 'string') return html
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}

module.exports = { sanitizeHtml, sanitizeHtmlSync }
