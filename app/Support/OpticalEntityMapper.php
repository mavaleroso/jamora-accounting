<?php

namespace App\Support;

use App\Models\Optical\Order;

class OpticalEntityMapper
{
    public const JAM_OPTICUS = 'JAM_OPTICUS';

    public const A_JAMORA = 'A_JAMORA';

    public const AL_JAMORA = 'AL_JAMORA';

    public static function forOrder(Order $order): string
    {
        if ($order->is_wholesale_order) {
            return self::JAM_OPTICUS;
        }

        return self::forBranch($order->branch);
    }

    public static function forBranch(?string $branch): string
    {
        $normalized = strtolower(trim((string) $branch));

        if ($normalized === 'a.l. jamora' || $normalized === 'al jamora') {
            return self::AL_JAMORA;
        }

        return self::A_JAMORA;
    }

    public static function matchesCurrentEntity(Order $order): bool
    {
        $current = app(EntityContext::class)->current();

        if (! $current) {
            return true;
        }

        return self::forOrder($order) === $current->code;
    }
}
