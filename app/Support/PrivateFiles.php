<?php

namespace App\Support;

use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Uploads with personal data (medical certificates, filing proofs) live on the private `local` disk
 * and are only served through routes that check who is asking. Files uploaded before the move may
 * still sit on the public disk; they are served from there until `uploads:make-private` moves them.
 */
class PrivateFiles
{
    public const DISK = 'local';

    public static function response(string $path): StreamedResponse
    {
        foreach ([self::DISK, 'public'] as $disk) {
            if (Storage::disk($disk)->exists($path)) {
                return Storage::disk($disk)->response($path);
            }
        }

        abort(404);
    }
}
