<?php

namespace App\Services\Optical;

use Illuminate\Support\Facades\Cache;

/**
 * Stock on hand in the optical POS, read from its database when asked. It is never stored in accounting; the
 * reading is only kept for optical.stock_cache_seconds so screens that show it side by side stay quick.
 */
class OpticalStock
{
    protected const CACHE_KEY = 'optical.stock-summary';

    public function __construct(protected OpticalSource $source) {}

    public function isConfigured(): bool
    {
        return $this->source->isConfigured();
    }

    /**
     * @param  bool  $fresh  read the POS now, whatever was read a moment ago
     * @return array<string, mixed> the summary, with read_at
     *
     * @throws \Throwable when the POS can't be read
     */
    public function summary(bool $fresh = false): array
    {
        $seconds = (int) config('optical.stock_cache_seconds', 60);
        $read = fn () => [...$this->source->stockSummary(), 'read_at' => now()->toIso8601String()];

        if ($seconds <= 0) {
            return $read();
        }

        if ($fresh) {
            Cache::forget(self::CACHE_KEY);
        }

        return Cache::remember(self::CACHE_KEY, $seconds, $read);
    }
}
