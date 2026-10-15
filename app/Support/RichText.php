<?php

namespace App\Support;

use DOMDocument;
use DOMElement;
use DOMNode;

/**
 * Sanitizes HTML from the rich text editor down to simple formatting: paragraphs, line breaks,
 * bold / italic / underline and lists. Every attribute is dropped; other tags are unwrapped
 * (their text kept), and script-like tags are removed with their content.
 */
class RichText
{
    private const ALLOWED = ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li'];

    private const DROPPED = ['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'svg', 'math'];

    public static function sanitize(?string $html): string
    {
        $html = trim((string) $html);
        if ($html === '') {
            return '';
        }

        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        $doc->loadHTML('<?xml encoding="UTF-8"><div id="rich-text-root">'.$html.'</div>', LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD | LIBXML_NONET);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $root = $doc->getElementById('rich-text-root');
        if (! $root) {
            return '';
        }

        self::clean($root);

        $out = '';
        foreach ($root->childNodes as $child) {
            $out .= $doc->saveHTML($child);
        }

        return self::isBlank($out) ? '' : trim($out);
    }

    /** The visible text, e.g. for previews and length checks. */
    public static function plainText(?string $html): string
    {
        $text = preg_replace('/<(br|\/p|\/li)\b[^>]*>/i', ' ', (string) $html);

        return trim(preg_replace('/\s+/u', ' ', html_entity_decode(strip_tags($text), ENT_QUOTES | ENT_HTML5, 'UTF-8')));
    }

    public static function isBlank(?string $html): bool
    {
        return self::plainText($html) === '';
    }

    private static function clean(DOMNode $node): void
    {
        foreach (iterator_to_array($node->childNodes) as $child) {
            if (! $child instanceof DOMElement) {
                if ($child->nodeType !== XML_TEXT_NODE) {
                    $node->removeChild($child); // comments, processing instructions
                }

                continue;
            }

            $tag = strtolower($child->tagName);
            if (in_array($tag, self::DROPPED, true)) {
                $node->removeChild($child);

                continue;
            }

            self::clean($child);

            if (in_array($tag, self::ALLOWED, true)) {
                foreach (iterator_to_array($child->attributes) as $attribute) {
                    $child->removeAttribute($attribute->nodeName);
                }

                continue;
            }

            // Not allowed: keep the text, drop the tag.
            while ($child->firstChild) {
                $node->insertBefore($child->firstChild, $child);
            }
            $node->removeChild($child);
        }
    }
}
