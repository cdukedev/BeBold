/* GENERATED FILE. Do not edit.
 *
 * Source of truth: policy.v1.json
 * Regenerate:      npm run build:policy
 *
 * Loaded before engine.js by the manifest, so the policy is available as
 * window.BeBoldPolicy with every pattern already compiled to a RegExp.
 */
(function () {
  'use strict';
  const RAW = {
    "version": 1,
    "elements": {
      "nonText": {
        "tags": [
          "script",
          "style",
          "noscript",
          "template",
          "svg",
          "math",
          "canvas",
          "video",
          "audio",
          "img",
          "picture",
          "source",
          "track",
          "object",
          "embed",
          "iframe",
          "frame",
          "frameset",
          "noframes",
          "applet",
          "map",
          "area",
          "param",
          "link",
          "base",
          "meta",
          "head",
          "title",
          "col",
          "colgroup"
        ]
      },
      "controls": {
        "tags": [
          "input",
          "textarea",
          "select",
          "option",
          "optgroup",
          "button",
          "meter",
          "progress"
        ]
      },
      "codeish": {
        "tags": [
          "code",
          "pre",
          "kbd",
          "samp",
          "var",
          "tt"
        ]
      }
    },
    "scripts": {
      "arabic": {
        "pattern": "[\\p{Script=Arabic}\\p{Script=Syriac}\\p{Script=Thaana}\\p{Script=Adlam}]",
        "flags": "u"
      },
      "brahmic": {
        "pattern": "[\\p{Script=Devanagari}\\p{Script=Bengali}\\p{Script=Gurmukhi}\\p{Script=Gujarati}\\p{Script=Oriya}\\p{Script=Tamil}\\p{Script=Telugu}\\p{Script=Kannada}\\p{Script=Malayalam}\\p{Script=Sinhala}\\p{Script=Tibetan}]",
        "flags": "u"
      },
      "cjk": {
        "pattern": "[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}\\p{Script=Hangul}\\p{Script=Bopomofo}]",
        "flags": "u"
      },
      "seasia": {
        "pattern": "[\\p{Script=Thai}\\p{Script=Lao}\\p{Script=Khmer}\\p{Script=Myanmar}]",
        "flags": "u"
      }
    },
    "denySpans": {
      "patterns": [
        {
          "name": "url",
          "pattern": "\\bhttps?:\\/\\/\\S+",
          "flags": "gi"
        },
        {
          "name": "bare-host",
          "pattern": "\\bwww\\.[^\\s]+",
          "flags": "gi"
        },
        {
          "name": "email",
          "pattern": "[^\\s@]+@[^\\s@]+\\.[a-z]{2,}",
          "flags": "gi"
        },
        {
          "name": "version",
          "pattern": "\\bv\\d+(\\.\\d+)+(-[\\w.]+)?\\b|\\b\\d+\\.\\d+\\.\\d+(-[\\w.]+)?\\b",
          "flags": "gi"
        },
        {
          "name": "hex-colour",
          "pattern": "#[0-9a-fA-F]{3,8}\\b",
          "flags": "g"
        },
        {
          "name": "uuid",
          "pattern": "\\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\\b",
          "flags": "g"
        },
        {
          "name": "long-number",
          "pattern": "\\b\\d{5,}\\b|\\b\\d{1,3}(,\\d{3})+\\b",
          "flags": "g"
        },
        {
          "name": "iban",
          "pattern": "\\b[A-Z]{2}\\d{2}[ ]?[A-Z0-9][A-Z0-9 ]{8,28}\\b",
          "flags": "g"
        },
        {
          "name": "currency",
          "pattern": "[$€£¥₹]\\s?\\d[\\d,.]*",
          "flags": "g"
        },
        {
          "name": "dosage",
          "pattern": "\\b\\d+(\\.\\d+)?\\s?(mg|mcg|µg|ug|ml|mL|kg|IU|mmol|mEq|cc)\\b",
          "flags": "gi"
        },
        {
          "name": "path",
          "pattern": "\\/[\\w.-]+\\/[\\w.-]+|\\b[\\w.-]+\\/[\\w.-]+\\/[\\w./-]+",
          "flags": "g"
        },
        {
          "name": "private-use",
          "pattern": "[\\u{E000}-\\u{F8FF}\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}]",
          "flags": "gu"
        }
      ]
    },
    "iconFonts": {
      "pattern": "font\\s*awesome|material icons|material symbols|glyphicon|ionicons|feather|bootstrap-icons",
      "flags": "i"
    },
    "credentialFields": {
      "selector": "input[type=\"password\"],[autocomplete*=\"cc-number\" i],[autocomplete*=\"cc-exp\" i],[autocomplete*=\"cc-csc\" i],[autocomplete*=\"cc-name\" i],[autocomplete*=\"one-time-code\" i],[autocomplete*=\"current-password\" i],[autocomplete*=\"new-password\" i]"
    },
    "siteOptOut": {
      "metaSelector": "meta[name=\"bebold\"][content=\"off\"]",
      "attribute": "data-bebold-skip"
    }
  };
  const re = (p) => new RegExp(p.pattern, p.flags);
  window.BeBoldPolicy = Object.freeze({
    version: RAW.version,
    nonText: new Set(RAW.elements.nonText.tags),
    controls: new Set(RAW.elements.controls.tags),
    codeish: new Set(RAW.elements.codeish.tags),
    scriptFamilies: Object.entries(RAW.scripts).map(([name, s]) => [name, re(s)]),
    denySpans: RAW.denySpans.patterns.map(re),
    denySpanNames: RAW.denySpans.patterns.map((p) => p.name),
    iconFont: re(RAW.iconFonts),
    credentialSelector: RAW.credentialFields.selector,
    optOutMeta: RAW.siteOptOut.metaSelector,
    optOutAttribute: RAW.siteOptOut.attribute,
  });
})();
