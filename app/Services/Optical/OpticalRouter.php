<?php

namespace App\Services\Optical;

use App\Models\Entity;
use App\Models\Partner;
use App\Models\Vendor;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Decides which entity's books an optical record belongs to, and finds (or creates) the customer / supplier
 * records in those books.
 *
 *  - The collecting entity takes the customer's money: JAM Opticus for wholesale orders, otherwise the clinic of the
 *    branch (A. Jamora Optical, AL Jamora Optical).
 *  - Each order line is owned by the entity that earns it: products by JAM Opticus (it holds the stock), edging and
 *    repair by JAM Opticus, clinical service fees by the collecting clinic.
 */
class OpticalRouter
{
    /** @var array<string, Entity> */
    protected array $entities = [];

    public function entity(string $code): Entity
    {
        return $this->entities[$code] ??= Entity::query()->where('code', $code)->first()
            ?? throw new RuntimeException("Entity {$code} is not set up in accounting.");
    }

    /**
     * @param  array<string, mixed>  $order  an order payload or a payment's order snapshot
     */
    public function collectorFor(array $order): Entity
    {
        if (! empty($order['is_wholesale_order'])) {
            return $this->entity((string) config('optical.wholesale_entity', 'JAM_OPTICUS'));
        }

        $branch = strtolower(trim((string) ($order['branch'] ?? '')));
        $map = (array) config('optical.branch_entities', []);

        return $this->entity((string) ($map[$branch] ?? config('optical.default_branch_entity', 'A_JAMORA')));
    }

    public function productEntity(): Entity
    {
        return $this->entity((string) config('optical.product_entity', 'JAM_OPTICUS'));
    }

    /**
     * A service fee's "billed by" setting in the optical POS decides whether it is a workshop (JAM Opticus) or a
     * clinical (branch clinic) fee. Orders read before that setting existed fall back to the fee's name.
     *
     * @param  array<string, mixed>  $item
     * @return 'product'|'workshop'|'clinical'
     */
    public function lineClass(array $item, bool $legacy = false): string
    {
        if (empty($item['is_service'])) {
            return 'product';
        }

        if (! $legacy && filled($item['billed_by'] ?? null)) {
            return $item['billed_by'] === 'jam_opticus' ? 'workshop' : 'clinical';
        }

        $label = strtolower((string) ($item['product_label'] ?? ''));
        foreach ((array) config('optical.workshop_service_keywords', []) as $keyword) {
            if ($keyword !== '' && str_contains($label, strtolower($keyword))) {
                return 'workshop';
            }
        }

        return 'clinical';
    }

    /**
     * The entity that earns a line: the company the optical POS names for it, else by line class.
     *
     * @param  array<string, mixed>  $item
     */
    public function ownerFor(array $item, Entity $collector, bool $legacy = false): Entity
    {
        $code = $legacy ? null : ($item['accounting_entity_code'] ?? null);
        if (filled($code) && ($entity = $this->entityOrNull((string) $code))) {
            return $entity;
        }

        return match ($this->lineClass($item, $legacy)) {
            'product' => $this->productEntity(),
            'workshop' => $this->entity((string) config('optical.workshop_entity', 'JAM_OPTICUS')),
            default => $collector,
        };
    }

    /**
     * VAT-exempt sale with the statutory discount (Senior Citizen / PWD treatment). The optical POS says so per
     * discount (Libraries › Discounts); orders read before that setting existed fall back to the configured codes.
     *
     * @param  array<string, mixed>  $order
     */
    public function isVatExempt(array $order, bool $legacy = false): bool
    {
        if (! $legacy && isset($order['category_vat_exempt'])) {
            return (bool) $order['category_vat_exempt'];
        }

        $category = strtoupper(trim((string) ($order['category'] ?? '')));

        return $category !== '' && in_array($category, array_map('strtoupper', (array) config('optical.vat_exempt_categories', [])), true);
    }

    /**
     * The BIR Sales Invoice number $entity issued for its part of the order (each entity has its own series), else
     * the order's own SI, else its OR. Accounting only keeps it as a reference.
     *
     * @param  array<string, mixed>  $order
     */
    public function salesInvoiceNo(array $order, Entity $entity): ?string
    {
        foreach ((array) ($order['sales_invoices'] ?? []) as $invoice) {
            if (($invoice['entity_code'] ?? null) === $entity->code && filled($invoice['si_no'] ?? null)) {
                return (string) $invoice['si_no'];
            }
        }

        return ($order['si'] ?? null) ?: (($order['or'] ?? null) ?: null);
    }

    protected function entityOrNull(string $code): ?Entity
    {
        try {
            return $this->entity($code);
        } catch (RuntimeException) {
            return null;
        }
    }

    /**
     * Business date (Asia/Manila) of an optical timestamp. Date-only values are taken as they are.
     */
    public function businessDate(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return null;
        }

        if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
            return $value;
        }

        return Carbon::parse($value)->setTimezone('Asia/Manila')->toDateString();
    }

    public function startDate(): ?string
    {
        $start = config('optical.start_date');

        return filled($start) ? Carbon::parse((string) $start)->toDateString() : null;
    }

    /**
     * The customer's record in $entity's books: the wholesale client, the patient, or the shared walk-in customer.
     *
     * @param  array<string, mixed>  $order
     */
    public function partnerFor(array $order, Entity $entity): Partner
    {
        $name = trim((string) ($order['customer_name'] ?? ''));

        [$code, $externalId, $type, $name] = match (true) {
            ! empty($order['is_wholesale_order']) && ! empty($order['wholesale_client_id']) => ['OPT-C'.$order['wholesale_client_id'], 'client:'.$order['wholesale_client_id'], 'wholesale', $name ?: 'Wholesale client '.$order['wholesale_client_id']],
            ! empty($order['patient_id']) => ['OPT-P'.$order['patient_id'], 'patient:'.$order['patient_id'], 'patient', $name ?: 'Patient '.$order['patient_id']],
            default => ['OPT-WALKIN', 'walkin', 'customer', 'Walk-in customers (Optical POS)'],
        };

        $partner = Partner::query()->withoutGlobalScope('entity')->firstOrNew(['entity_id' => $entity->id, 'code' => $code]);

        if (! $partner->exists || ($type !== 'customer' && $partner->name !== $name)) {
            $partner->fill([
                'name' => $name,
                'type' => $type,
                'external_source' => 'optical',
                'external_id' => $externalId,
                'is_active' => true,
            ])->save();
        }

        return $partner;
    }

    /**
     * A wholesale client's record in the wholesale entity's books, from the clients feed.
     *
     * @param  array<string, mixed>  $client
     */
    public function upsertClient(array $client): Partner
    {
        $entity = $this->entity((string) config('optical.wholesale_entity', 'JAM_OPTICUS'));

        return Partner::query()->withoutGlobalScope('entity')->updateOrCreate(
            ['entity_id' => $entity->id, 'code' => 'OPT-C'.$client['id']],
            [
                'name' => (string) ($client['name'] ?? 'Wholesale client '.$client['id']),
                'type' => 'wholesale',
                'tin' => $client['tin'] ?? null,
                'email' => $client['email'] ?? null,
                'phone' => $client['phone'] ?? null,
                'address' => $client['address'] ?? null,
                'external_source' => 'optical',
                'external_id' => 'client:'.$client['id'],
                'is_active' => ($client['status'] ?? 'active') !== 'inactive',
            ]
        );
    }

    /**
     * A supplier's record in the product entity's books. Stock rows name the supplier; the id comes from the
     * suppliers feed when the name matches.
     */
    public function vendorFor(?string $name, ?int $supplierId = null, array $details = []): ?Vendor
    {
        $name = trim((string) $name);
        if ($name === '' && ! $supplierId) {
            return null;
        }

        $entity = $this->productEntity();
        $code = $supplierId ? 'OPT-S'.$supplierId : 'OPT-S-'.Str::upper(Str::limit(Str::slug($name), 40, ''));

        $vendor = Vendor::query()->withoutGlobalScope('entity')->firstOrNew(['entity_id' => $entity->id, 'code' => $code]);
        $vendor->fill(array_filter([
            'name' => $name !== '' ? $name : ($vendor->name ?? 'Supplier '.$supplierId),
            'tin' => $details['tin'] ?? null,
            'email' => $details['email'] ?? null,
            'phone' => $details['contact_number'] ?? null,
            'address' => $details['address'] ?? null,
            'external_source' => 'optical',
            'external_id' => $supplierId ? 'supplier:'.$supplierId : 'supplier:'.$name,
        ], fn ($v) => $v !== null));
        $vendor->is_active ??= true;
        $vendor->save();

        return $vendor;
    }
}
