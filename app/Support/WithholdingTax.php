<?php

namespace App\Support;

use App\Models\Account;
use App\Models\Entity;
use App\Models\TaxCode;

/**
 * Expanded withholding tax (EWT) on supplier bills, for BIR Form 2307 and the 1601-EQ / QAP. Each code is a tax code
 * of type "ewt" in the entity's Tax Codes library, named by its ATC, so rates and new codes are kept there without a
 * code change. These are only the starting set (RR 2-98 as amended by RR 11-2018); the CPA confirms which apply.
 */
class WithholdingTax
{
    public const TYPE = 'ewt';

    /** The EWT payable account; each tax code may point elsewhere. */
    public const PAYABLE_ACCOUNT = '2435';

    /** @var list<array{code: string, name: string, rate: float}> */
    public const DEFAULT_CODES = [
        ['code' => 'WC158', 'name' => 'Purchase of goods by a top withholding agent (1%)', 'rate' => 0.01],
        ['code' => 'WC160', 'name' => 'Purchase of services by a top withholding agent (2%)', 'rate' => 0.02],
        ['code' => 'WC100', 'name' => 'Rentals of real or personal property — corporation (5%)', 'rate' => 0.05],
        ['code' => 'WI100', 'name' => 'Rentals of real or personal property — individual (5%)', 'rate' => 0.05],
        ['code' => 'WC120', 'name' => 'Contractors and subcontractors — corporation (2%)', 'rate' => 0.02],
        ['code' => 'WI120', 'name' => 'Contractors and subcontractors — individual (2%)', 'rate' => 0.02],
        ['code' => 'WI010', 'name' => 'Professional fees — individual, gross up to ₱3M (5%)', 'rate' => 0.05],
        ['code' => 'WI011', 'name' => 'Professional fees — individual, gross over ₱3M (10%)', 'rate' => 0.10],
        ['code' => 'WC010', 'name' => 'Professional fees — corporation, gross up to ₱720K (10%)', 'rate' => 0.10],
        ['code' => 'WC011', 'name' => 'Professional fees — corporation, gross over ₱720K (15%)', 'rate' => 0.15],
    ];

    /**
     * Add the default EWT codes an entity does not have yet. Codes someone changed or removed are left alone.
     */
    public static function ensureFor(Entity $entity): void
    {
        $payable = Account::withoutGlobalScope('entity')->where('entity_id', $entity->id)->where('code', self::PAYABLE_ACCOUNT)->value('id');

        foreach (self::DEFAULT_CODES as $code) {
            TaxCode::withoutGlobalScope('entity')->firstOrCreate(
                ['entity_id' => $entity->id, 'code' => $code['code']],
                ['name' => $code['name'], 'rate' => $code['rate'], 'type' => self::TYPE, 'account_id' => $payable, 'is_active' => true]
            );
        }
    }

    /**
     * EWT withheld on a bill: the rate on the amount net of VAT.
     */
    public static function amount(float $netOfVat, float $rate): float
    {
        return round(max(0, $netOfVat) * max(0, $rate), 2);
    }

    /**
     * The calendar quarter (1–4) of a date.
     */
    public static function quarter(\DateTimeInterface $date): int
    {
        return intdiv((int) $date->format('n') - 1, 3) + 1;
    }
}
